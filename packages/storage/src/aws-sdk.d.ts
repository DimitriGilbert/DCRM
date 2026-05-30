/**
 * Type stub for @aws-sdk/client-s3.
 *
 * This is an optional peer dependency. It must be installed when
 * STORAGE_TYPE=s3, but the storage package must typecheck without it
 * when only local storage is used.
 *
 * The real types from @aws-sdk/client-s3 take precedence when installed.
 */
declare module "@aws-sdk/client-s3" {
  export class S3Client {
    constructor(config: {
      region: string;
      endpoint?: string;
      credentials: { accessKeyId: string; secretAccessKey: string };
    });
    send(command: unknown): Promise<unknown>;
  }

  export class PutObjectCommand {
    constructor(input: { Bucket: string; Key: string; Body: Uint8Array; ContentType: string });
  }

  export class GetObjectCommand {
    constructor(input: { Bucket: string; Key: string });
  }

  export class DeleteObjectCommand {
    constructor(input: { Bucket: string; Key: string });
  }

  export class HeadObjectCommand {
    constructor(input: { Bucket: string; Key: string });
  }
}
