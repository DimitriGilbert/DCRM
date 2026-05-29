import { expo } from "@better-auth/expo";
import { createDb } from "@DCRM/db";
import * as schema from "@DCRM/db/schema/auth";
import { env } from "@DCRM/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  extractKeyPrefix,
  isApiKeyFormat,
  API_KEY_PREFIX,
} from "./api-key";
export type { GeneratedApiKey } from "./api-key";

export { resolveAuth } from "./resolve-auth";
export type { AuthResult, UserRecord } from "./resolve-auth";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN, "DCRM://", "exp://", "http://localhost:8081"],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [tanstackStartCookies(), expo()],
  });
}

export const auth = createAuth();
