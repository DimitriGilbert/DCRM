import { db } from "@DCRM/db";
import { apiKeys } from "@DCRM/db/schema/automation";
import { user } from "@DCRM/db/schema/auth";
import { eq } from "drizzle-orm";

import { hashApiKey, isApiKeyFormat } from "./api-key";
import type { UserRecord } from "./types";

export type { UserRecord };

/**
 * Resolved authentication result.
 *
 * Either a Better Auth session is present, or an API-key-derived user context.
 */
export type AuthResult = {
  /** User resolved from session or API key. Null when unauthenticated. */
  user: UserRecord | null;
  /**
   * Better Auth session (includes session + user objects).
   * Null when authenticating via API key.
   */
  session: { session: { id: string }; user: UserRecord } | null;
};

/**
 * Resolves authentication from an incoming request.
 *
 * Auth resolution order:
 * 1. API key via `Authorization: Bearer dcrm_...` header
 * 2. Better Auth session via cookies
 *
 * @param headers - The incoming request headers.
 * @param authApi - The Better Auth API instance (from `auth.api`).
 */
export async function resolveAuth(
  headers: Headers,
  authApi: {
    getSession: (opts: {
      headers: Headers;
    }) => Promise<{
      session: { id: string };
      user: Record<string, unknown>;
    } | null>;
  },
): Promise<AuthResult> {
  // --- Try API key auth first ---
  const bearerToken = extractBearerToken(headers.get("Authorization"));
  if (bearerToken !== null && isApiKeyFormat(bearerToken)) {
    return resolveApiKeyAuth(bearerToken);
  }

  // --- Fall back to session auth ---
  const session = await authApi.getSession({ headers });

  if (session) {
    const mappedUser = mapUserRecord(session.user);
    return {
      user: mappedUser,
      session: {
        session: { id: session.session.id },
        user: mappedUser,
      },
    };
  }

  return { user: null, session: null };
}

/**
 * Extracts the token from an Authorization header.
 * Returns null for missing, empty, or non-Bearer schemes.
 */
function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1]!;
}

/**
 * Resolves an API key bearer token to a user context.
 * Looks up the key by SHA-256 hash, fetches the user, updates lastUsedAt.
 */
async function resolveApiKeyAuth(rawKey: string): Promise<AuthResult> {
  const keyHash = hashApiKey(rawKey);

  const matchedKeys = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  const matchedKey = matchedKeys[0];
  if (!matchedKey) {
    return { user: null, session: null };
  }

  const matchedUsers = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, matchedKey.userId))
    .limit(1);

  const matchedUser = matchedUsers[0];
  if (!matchedUser) {
    return { user: null, session: null };
  }

  // Update lastUsedAt (fire-and-forget — do not await)
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, matchedKey.id))
    .catch(() => {});

  const resolvedUser: UserRecord = {
    id: matchedUser.id,
    name: matchedUser.name,
    email: matchedUser.email,
    emailVerified: matchedUser.emailVerified,
    image: matchedUser.image !== undefined && matchedUser.image !== null
      ? matchedUser.image
      : null,
    createdAt: matchedUser.createdAt,
    updatedAt: matchedUser.updatedAt,
  };

  return {
    user: resolvedUser,
    session: null,
  };
}

/**
 * Maps a Better Auth user record to our UserRecord type.
 * Better Auth returns the user as a generic Record, so we pick known fields.
 */
function mapUserRecord(raw: Record<string, unknown>): UserRecord {
  const rawImage = raw["image"];
  return {
    id: raw["id"] as string,
    name: raw["name"] as string,
    email: raw["email"] as string,
    emailVerified: raw["emailVerified"] as boolean,
    image: typeof rawImage === "string" ? rawImage : null,
    createdAt: raw["createdAt"] as Date,
    updatedAt: raw["updatedAt"] as Date,
  };
}
