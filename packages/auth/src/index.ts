import { expo } from "@better-auth/expo";
import { createDb } from "@DCRM/db";
import * as schema from "@DCRM/db/schema/auth";
import { env } from "@DCRM/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { count } from "drizzle-orm";

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
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            return isOwnerBootstrapOpenForDb(db);
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [tanstackStartCookies(), expo()],
  });
}

export const auth = createAuth();

export async function isOwnerBootstrapOpen(): Promise<boolean> {
  return isOwnerBootstrapOpenForDb(createDb());
}

async function isOwnerBootstrapOpenForDb(db: ReturnType<typeof createDb>): Promise<boolean> {
  const result = await db.select({ value: count() }).from(schema.user);
  return (result[0]?.value ?? 0) === 0;
}
