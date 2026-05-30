import { OpenAITextAdapter } from "@tanstack/ai-openai";
import type { AnyTextAdapter } from "@tanstack/ai";

import type { AdapterFactory, ProviderConfig } from "../types";

/**
 * OpenRouter adapter — uses the OpenAI-compatible API via OpenRouter's endpoint.
 * OpenRouter provides unified access to many models through an OpenAI-compatible API.
 */
export const createOpenRouterAdapter: AdapterFactory = (
  config: ProviderConfig,
  model?: string,
): AnyTextAdapter => {
  const resolvedModel = model ?? config.defaultModel;
  const baseUrl = config.baseUrl ?? "https://openrouter.ai/api/v1";

  return new OpenAITextAdapter(
    {
      apiKey: config.apiKey,
      baseURL: baseUrl,
      defaultHeaders: {
        "HTTP-Referer": "https://dcrm.app",
        "X-Title": "DCRM",
      },
    },
    resolvedModel as "gpt-4o",
  ) as unknown as AnyTextAdapter;
};
