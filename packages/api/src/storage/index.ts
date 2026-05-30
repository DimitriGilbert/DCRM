import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { AttachmentStorageBackend } from "@DCRM/domain";

export type StoragePutInput = {
  readonly key: string;
  readonly content: Buffer;
  readonly contentType?: string | null;
};

export type StoredObject = {
  readonly backend: AttachmentStorageBackend;
  readonly key: string;
  readonly byteSize: number;
  readonly contentType: string | null;
};

export type StorageService = {
  readonly backend: AttachmentStorageBackend;
  readonly put: (input: StoragePutInput) => Promise<StoredObject>;
  readonly get: (key: string) => Promise<Buffer>;
  readonly delete: (key: string) => Promise<boolean>;
};

export type StorageServiceOptions =
  | {
      readonly backend?: "local";
      readonly localPath: string;
    }
  | {
      readonly backend: "s3_compatible";
      readonly endpoint: string;
      readonly region: string;
      readonly bucket: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly forcePathStyle?: boolean;
    };

/** Creates the configured attachment object-storage adapter. */
export function createStorageService(options: StorageServiceOptions): StorageService {
  if (options.backend === "s3_compatible") {
    return createS3CompatibleStorageService(options);
  }

  return createLocalStorageService(options.localPath);
}

function createLocalStorageService(rootPath: string): StorageService {
  return {
    backend: "local",
    async put(input) {
      const filePath = resolveLocalObjectPath(rootPath, input.key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, input.content);
      return { backend: "local", key: input.key, byteSize: input.content.byteLength, contentType: input.contentType ?? null };
    },
    async get(key) {
      return readFile(resolveLocalObjectPath(rootPath, key));
    },
    async delete(key) {
      try {
        await unlink(resolveLocalObjectPath(rootPath, key));
        return true;
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          return false;
        }
        throw error;
      }
    },
  };
}

function resolveLocalObjectPath(rootPath: string, key: string): string {
  const segments = safeStorageKeySegments(key);
  return join(rootPath, ...segments);
}

function safeStorageKeySegments(key: string): readonly string[] {
  if (key.includes("\\")) {
    throw new Error("Storage key must stay inside the configured local storage path.");
  }
  const segments = key.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Storage key must stay inside the configured local storage path.");
  }
  return segments;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

type S3CompatibleStorageOptions = Extract<StorageServiceOptions, { readonly backend: "s3_compatible" }>;

function createS3CompatibleStorageService(options: S3CompatibleStorageOptions): StorageService {
  return {
    backend: "s3_compatible",
    async put(input) {
      const response = await signedS3Request(options, "PUT", input.key, input.content, input.contentType ?? "application/octet-stream");
      if (!response.ok) {
        throw new Error(`S3-compatible storage put failed with status ${response.status}.`);
      }
      return { backend: "s3_compatible", key: input.key, byteSize: input.content.byteLength, contentType: input.contentType ?? null };
    },
    async get(key) {
      const response = await signedS3Request(options, "GET", key);
      if (!response.ok) {
        throw new Error(`S3-compatible storage get failed with status ${response.status}.`);
      }
      return Buffer.from(await response.arrayBuffer());
    },
    async delete(key) {
      const response = await signedS3Request(options, "DELETE", key);
      if (response.status === 404) {
        return false;
      }
      if (!response.ok && response.status !== 204) {
        throw new Error(`S3-compatible storage delete failed with status ${response.status}.`);
      }
      return true;
    },
  };
}

async function signedS3Request(options: S3CompatibleStorageOptions, method: "DELETE" | "GET" | "PUT", key: string, body?: Buffer, contentType?: string): Promise<Response> {
  const endpoint = new URL(options.endpoint);
  const path = options.forcePathStyle ? `/${options.bucket}/${encodeS3Path(key)}` : `/${encodeS3Path(key)}`;
  const host = options.forcePathStyle ? endpoint.host : `${options.bucket}.${endpoint.host}`;
  const url = new URL(endpoint.toString());
  url.host = host;
  url.pathname = path;

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body ?? Buffer.alloc(0));
  const headers = new Headers({ host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate });
  if (contentType) {
    headers.set("content-type", contentType);
  }
  const signedHeaders = Array.from(headers.keys()).sort().join(";");
  const canonicalHeaders = Array.from(headers.keys()).sort().map((name) => `${name}:${headers.get(name) ?? ""}\n`).join("");
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${options.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(Buffer.from(canonicalRequest))].join("\n");
  const signature = hmacHex(signingKey(options.secretAccessKey, dateStamp, options.region), stringToSign);
  headers.set("authorization", `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);

  const requestBody = body ? new Uint8Array(body) : undefined;
  return fetch(url, { method, headers, body: requestBody });
}

function encodeS3Path(key: string): string {
  return safeStorageKeySegments(key).map(encodeURIComponent).join("/");
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/gu, "");
}

function sha256Hex(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const regionKey = createHmac("sha256", dateKey).update(region).digest();
  const serviceKey = createHmac("sha256", regionKey).update("s3").digest();
  return createHmac("sha256", serviceKey).update("aws4_request").digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}
