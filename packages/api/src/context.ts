import { auth } from "@DCRM/auth";
import { verifyApiKeyFromHeaders } from "@DCRM/auth/api-keys";
import { createDcrmApiKeyService } from "@DCRM/auth/api-keys.drizzle";
import { createSecretCrypto } from "@DCRM/crypto";
import { createDb } from "@DCRM/db";
import { createServerEnv } from "@DCRM/env/create-server-env";
import { createEventService } from "@DCRM/events";
import { createDrizzleEventRepository } from "@DCRM/events/drizzle";

import type { ApiKeyService, VerifiedApiKey } from "@DCRM/auth/api-keys";
import type { CrmChatRunner } from "@DCRM/ai";
import type { SecretCrypto } from "@DCRM/crypto";
import type { EventService } from "@DCRM/events";
import type { HookExecutionQueue, HookExecutionRepository } from "@DCRM/events/hooks";

import { createDrizzleAutomationRepository } from "./automation/drizzle.js";
import { createHookAwareAiEventService, createProductionHookExecutionQueue } from "./automation/runtime.js";
import { createDrizzleCrmRepository } from "./crm/drizzle.js";
import { createNodeSmtpPlainTextClient } from "./email/smtp.js";
import { createStorageService } from "./storage/index.js";

import type { AutomationRepository } from "./automation/repository.js";
import type { CrmRepository } from "./crm/repository.js";
import type { StorageService } from "./storage/index.js";
import type { SmtpPlainTextClient } from "./email/send.js";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type AuthUser = {
  readonly id: string;
  readonly email?: string | null;
  readonly name?: string | null;
  readonly image?: string | null;
};

export type RequestAuth =
  | {
      kind: "session";
      user: AuthUser;
    }
  | {
      kind: "apiKey";
      apiKey: VerifiedApiKey["apiKey"];
      user: AuthUser;
    };

type CreateContextOptions = {
  automationRepository?: AutomationRepository;
  aiChatRunner?: CrmChatRunner;
  apiKeyService?: ApiKeyService;
  crmRepository?: CrmRepository;
  eventService?: EventService;
  hookExecutionQueue?: HookExecutionQueue;
  hookExecutionRepository?: HookExecutionRepository;
  req: Request;
  secretCrypto?: SecretCrypto;
  smtpClient?: SmtpPlainTextClient;
  storage?: ContextStorage;
};

export type ContextStorage = {
  readonly service: StorageService;
  readonly maxAttachmentBytes: number;
  readonly userQuotaBytes: number;
};

export type Context = {
  readonly auth: RequestAuth | null;
  readonly aiChatRunner?: CrmChatRunner;
  readonly automationRepository?: AutomationRepository;
  readonly crmRepository: CrmRepository;
  readonly eventService: EventService;
  readonly secretCrypto?: SecretCrypto;
  readonly smtpClient?: SmtpPlainTextClient;
  readonly session: Session | null;
  readonly storage?: ContextStorage;
};

export async function createContext({ apiKeyService, aiChatRunner, automationRepository, crmRepository, eventService, hookExecutionQueue, hookExecutionRepository, req, secretCrypto, smtpClient, storage }: CreateContextOptions): Promise<Context> {
  const database = crmRepository || eventService || automationRepository ? undefined : createDb();
  const env = createServerEnv(process.env);
  const resolvedAutomationRepository = automationRepository ?? createDrizzleAutomationRepository(database ?? createDb());
  const resolvedCrmRepository = crmRepository ?? createDrizzleCrmRepository(database ?? createDb());
  const baseEventService = eventService ?? createEventService({ repository: createDrizzleEventRepository(database ?? createDb()) });
  const resolvedStorage = storage ?? createDefaultStorage();
  const resolvedSecretCrypto = secretCrypto ?? createSecretCrypto(env);
  const resolvedSmtpClient = smtpClient ?? createNodeSmtpPlainTextClient();
  const resolvedHookExecutionRepository = hookExecutionRepository ?? (await import("@DCRM/events/hooks.drizzle")).createDrizzleHookExecutionRepository(database ?? createDb());
  const resolvedEventService = createHookAwareAiEventService({
    eventService: baseEventService,
    automationRepository: resolvedAutomationRepository,
    executionRepository: resolvedHookExecutionRepository,
    queue: hookExecutionQueue ?? createProductionHookExecutionQueue(env.REDIS_URL),
  });
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (session) {
    return {
      auth: {
        kind: "session",
        user: session.user,
      } satisfies RequestAuth,
      aiChatRunner,
      automationRepository: resolvedAutomationRepository,
      crmRepository: resolvedCrmRepository,
      eventService: resolvedEventService,
      secretCrypto: resolvedSecretCrypto,
      smtpClient: resolvedSmtpClient,
      session,
      storage: resolvedStorage,
    };
  }

  const verifiedApiKey = hasApiKeyCredential(req.headers)
    ? await verifyApiKeyFromHeaders(req.headers, apiKeyService ?? createDcrmApiKeyService())
    : null;

  return {
    auth: verifiedApiKey
      ? ({
          kind: "apiKey",
          apiKey: verifiedApiKey.apiKey,
          user: verifiedApiKey.user,
        } satisfies RequestAuth)
      : null,
    aiChatRunner,
    automationRepository: resolvedAutomationRepository,
    crmRepository: resolvedCrmRepository,
    eventService: resolvedEventService,
    secretCrypto: resolvedSecretCrypto,
    smtpClient: resolvedSmtpClient,
    session,
    storage: resolvedStorage,
  };
}

function hasApiKeyCredential(headers: Headers) {
  return headers.has("authorization") || headers.has("x-api-key");
}

function createDefaultStorage(): ContextStorage {
  const env = createServerEnv(process.env);
  const service = env.STORAGE_BACKEND === "s3_compatible"
    ? createStorageService({
        backend: "s3_compatible",
        endpoint: requiredStorageEnv(env.S3_ENDPOINT, "S3_ENDPOINT"),
        region: requiredStorageEnv(env.S3_REGION, "S3_REGION"),
        bucket: requiredStorageEnv(env.S3_BUCKET, "S3_BUCKET"),
        accessKeyId: requiredStorageEnv(env.S3_ACCESS_KEY_ID, "S3_ACCESS_KEY_ID"),
        secretAccessKey: requiredStorageEnv(env.S3_SECRET_ACCESS_KEY, "S3_SECRET_ACCESS_KEY"),
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      })
    : createStorageService({ backend: "local", localPath: env.LOCAL_STORAGE_PATH });
  return { service, maxAttachmentBytes: env.ATTACHMENT_MAX_BYTES, userQuotaBytes: env.USER_STORAGE_QUOTA_BYTES };
}

function requiredStorageEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required for S3-compatible storage.`);
  }
  return value;
}
