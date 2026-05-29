import "dotenv/config";

import { createServerEnv } from "./create-server-env.js";

export { createServerEnv } from "./create-server-env.js";

export const env = createServerEnv(process.env);
