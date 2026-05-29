import { auth, resolveAuth } from "@DCRM/auth";

import type { AuthResult } from "@DCRM/auth";

export type Context = AuthResult;

export async function createContext({ req }: { req: Request }): Promise<Context> {
  return resolveAuth(req.headers, auth.api);
}
