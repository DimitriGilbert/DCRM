import { OpenAITextAdapter } from "@tanstack/ai-openai";
import type { AnyTextAdapter } from "@tanstack/ai";

import type { AdapterFactory, ProviderConfig } from "../types";

/**
 * OpenAI adapter with optional custom base URL for OpenAI-compatible services.
 * Set `baseUrl` in the provider config to point at any OpenAI-compatible API.
 */
export const createOpenAIAdapter: AdapterFactory = (
  config: ProviderConfig,
  model?: string,
): AnyTextAdapter => {
  const resolvedModel = model ?? config.defaultModel;

  const adapterConfig: { apiKey: string; baseURL?: string } = {
    apiKey: config.apiKey,
  };
  if (config.baseUrl) {
    adapterConfig.baseURL = config.baseUrl;
  }

  return new OpenAITextAdapter(
    adapterConfig,
    resolvedModel as "gpt-4o",
  ) as unknown as AnyTextAdapter;
};
