import { GeminiTextAdapter } from "@tanstack/ai-gemini";
import type { AnyTextAdapter } from "@tanstack/ai";

import type { AdapterFactory, ProviderConfig } from "../types";

/**
 * Google Gemini adapter.
 * The Google GenAI SDK does not support a custom base URL in the same way;
 * if a proxy is needed, it should be handled at the network level.
 */
export const createGoogleAdapter: AdapterFactory = (
  config: ProviderConfig,
  model?: string,
): AnyTextAdapter => {
  const resolvedModel = model ?? config.defaultModel;

  return new GeminiTextAdapter(
    { apiKey: config.apiKey },
    resolvedModel as "gemini-2.5-pro",
  ) as unknown as AnyTextAdapter;
};
