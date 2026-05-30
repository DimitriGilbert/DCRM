import { AnthropicTextAdapter } from "@tanstack/ai-anthropic";
import type { AnyTextAdapter } from "@tanstack/ai";

import type { AdapterFactory, ProviderConfig } from "../types";

/**
 * Anthropic adapter with optional custom base URL for Anthropic-compatible services.
 */
export const createAnthropicAdapter: AdapterFactory = (
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

  return new AnthropicTextAdapter(
    adapterConfig,
    resolvedModel as "claude-sonnet-4",
  ) as unknown as AnyTextAdapter;
};
