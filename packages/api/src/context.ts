import { auth } from "@DCRM/auth";
import { verifyApiKeyFromHeaders } from "@DCRM/auth/api-keys";
import { createDcrmApiKeyService } from "@DCRM/auth/api-keys.drizzle";
import { createDb } from "@DCRM/db";
import { createEventService } from "@DCRM/events";
import { createDrizzleEventRepository } from "@DCRM/events/drizzle";

import type { ApiKeyService, VerifiedApiKey } from "@DCRM/auth/api-keys";
import type { EventService } from "@DCRM/events";

import { createDrizzleCrmRepository } from "./crm/drizzle.js";

import type { CrmRepository } from "./crm/repository.js";

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
  apiKeyService?: ApiKeyService;
  crmRepository?: CrmRepository;
  eventService?: EventService;
  req: Request;
};

export type Context = {
  readonly auth: RequestAuth | null;
  readonly crmRepository: CrmRepository;
  readonly eventService: EventService;
  readonly session: Session | null;
};

export async function createContext({ apiKeyService, crmRepository, eventService, req }: CreateContextOptions): Promise<Context> {
  const database = crmRepository || eventService ? undefined : createDb();
  const resolvedCrmRepository = crmRepository ?? createDrizzleCrmRepository(database ?? createDb());
  const resolvedEventService =
    eventService ?? createEventService({ repository: createDrizzleEventRepository(database ?? createDb()) });
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (session) {
    return {
      auth: {
        kind: "session",
        user: session.user,
      } satisfies RequestAuth,
      crmRepository: resolvedCrmRepository,
      eventService: resolvedEventService,
      session,
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
    crmRepository: resolvedCrmRepository,
    eventService: resolvedEventService,
    session,
  };
}

function hasApiKeyCredential(headers: Headers) {
  return headers.has("authorization") || headers.has("x-api-key");
}
