import type { CryptoService, EncryptedValue } from "@DCRM/crypto";
import type { AIProvider } from "@DCRM/domain";
import type { AnyTextAdapter } from "@tanstack/ai";

import { createOpenRouterAdapter } from "./adapters/openrouter";
import { createOpenAIAdapter } from "./adapters/openai";
import { createAnthropicAdapter } from "./adapters/anthropic";
import { createGoogleAdapter } from "./adapters/google";
import type { AdapterFactory, ProviderConfig } from "./types";

/** Maps provider keys to their adapter factory functions. */
const ADAPTER_FACTORIES: Record<AIProvider, AdapterFactory> = {
  openrouter: createOpenRouterAdapter,
  openai: createOpenAIAdapter,
  anthropic: createAnthropicAdapter,
  google: createGoogleAdapter,
};

/**
 * Provider record as stored in the database.
 * The `encryptedApiKey` field is a JSON-serialized `EncryptedValue`.
 */
export type ProviderRecord = {
  readonly id: string;
  readonly userId: string;
  readonly provider: AIProvider;
  readonly name: string;
  readonly encryptedApiKey: string;
  readonly baseUrl?: string | null;
  readonly config?: Record<string, unknown> | null;
  readonly enabled: boolean;
};

/**
 * Manages AI provider adapter instances.
 *
 * - Decrypts API keys from the database using the crypto service.
 * - Creates TanStack AI adapters on demand.
 * - Adapters are lightweight and not cached (they hold the API key in memory).
 */
export class ProviderManager {
  constructor(private readonly crypto: CryptoService) {}

  /**
   * Decrypt the stored API key from a JSON-serialized EncryptedValue.
   */
  decryptApiKey(encryptedApiKeyJson: string): string {
    const encrypted: EncryptedValue = JSON.parse(encryptedApiKeyJson);
    return this.crypto.decrypt(encrypted);
  }

  /**
   * Build a ProviderConfig from a database record.
   * Decrypts the API key in the process.
   */
  buildConfig(record: ProviderRecord): ProviderConfig {
    const apiKey = this.decryptApiKey(record.encryptedApiKey);
    const config = record.config ?? undefined;
    const defaultModel =
      config && "defaultModel" in config && typeof config.defaultModel === "string"
        ? config.defaultModel
        : PROVIDER_METADATA_MAP[record.provider].defaultModel;

    return {
      id: record.id,
      provider: record.provider,
      name: record.name,
      apiKey,
      baseUrl: record.baseUrl ?? undefined,
      defaultModel,
      config: config ?? undefined,
    };
  }

  /**
   * Create a TanStack AI adapter for the given provider configuration.
   */
  createAdapter(config: ProviderConfig, model?: string): AnyTextAdapter {
    const factory = ADAPTER_FACTORIES[config.provider];
    if (!factory) {
      throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
    return factory(config, model);
  }
}

/** Minimal metadata lookup for default model resolution. */
const PROVIDER_METADATA_MAP: Record<
  AIProvider,
  { defaultModel: string }
> = {
  openrouter: { defaultModel: "openai/gpt-4o" },
  openai: { defaultModel: "gpt-4o" },
  anthropic: { defaultModel: "claude-sonnet-4" },
  google: { defaultModel: "gemini-2.5-pro" },
};
