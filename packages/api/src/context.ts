import { auth } from "@DCRM/auth";
import { verifyApiKeyFromHeaders } from "@DCRM/auth/api-keys";
import { createDcrmApiKeyService } from "@DCRM/auth/api-keys.drizzle";

import type { ApiKeyService, VerifiedApiKey } from "@DCRM/auth/api-keys";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type RequestAuth =
  | {
      kind: "session";
      user: Session["user"];
    }
  | {
      kind: "apiKey";
      apiKey: VerifiedApiKey["apiKey"];
      user: VerifiedApiKey["user"];
    };

type CreateContextOptions = {
  apiKeyService?: ApiKeyService;
  req: Request;
};

export async function createContext({ apiKeyService, req }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (session) {
    return {
      auth: {
        kind: "session",
        user: session.user,
      } satisfies RequestAuth,
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
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

function hasApiKeyCredential(headers: Headers) {
  return headers.has("authorization") || headers.has("x-api-key");
}
