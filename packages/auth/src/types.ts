/**
 * The user shape returned in auth context (session or API key).
 * Matches the Better Auth user table columns.
 */
export type UserRecord = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly image: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
