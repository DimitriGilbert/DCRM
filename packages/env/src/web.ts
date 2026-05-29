import { createEnv } from "@t3-oss/env-core";

type ViteRuntimeEnv = Record<string, string | boolean | undefined>;
type ImportMetaWithEnv = ImportMeta & {
  readonly env: ViteRuntimeEnv;
};

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {},
  runtimeEnv: (import.meta as ImportMetaWithEnv).env,
  emptyStringAsUndefined: true,
});
