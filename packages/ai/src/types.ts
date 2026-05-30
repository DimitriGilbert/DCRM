import type { AIProvider } from "@DCRM/domain";
import type { AnyTextAdapter } from "@tanstack/ai";

/**
 * Configuration for a single AI provider instance.
 * Stored in the database; API keys are encrypted at rest.
 */
export type ProviderConfig = {
  /** Unique provider record ID from the database. */
  readonly id: string;
  /** Which provider service to use. */
  readonly provider: AIProvider;
  /** Human-readable name for this provider config. */
  readonly name: string;
  /** Decrypted API key (only in memory, never persisted). */
  readonly apiKey: string;
  /** Custom base URL override (e.g. for OpenAI-compatible proxies). */
  readonly baseUrl?: string;
  /** Default model to use when none is specified. */
  readonly defaultModel: string;
  /** Arbitrary provider-specific configuration. */
  readonly config?: Record<string, unknown>;
};

/**
 * A message in the chat/conversation format.
 */
export type ChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

/**
 * Result of a text generation call.
 */
export type GenerateResult = {
  /** The generated text content. */
  readonly text: string;
  /** Model used for this generation. */
  readonly model: string;
  /** Provider that handled this request. */
  readonly provider: AIProvider;
  /** Token usage if available. */
  readonly usage?: {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
  };
};

/**
 * Adapter factory function signature.
 * Each provider module exports a function matching this signature.
 */
export type AdapterFactory = (
  config: ProviderConfig,
  model?: string,
) => AnyTextAdapter;

/**
 * Maps provider key to its display metadata.
 */
export type ProviderMetadata = {
  readonly label: string;
  readonly defaultBaseUrl: string | undefined;
  readonly defaultModel: string;
  readonly supportsCustomBaseUrl: boolean;
  readonly models: readonly string[];
};

/**
 * Registry of all supported provider metadata.
 */
export const PROVIDER_METADATA: Record<AIProvider, ProviderMetadata> = {
  openrouter: {
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o",
    supportsCustomBaseUrl: false,
    models: [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-haiku-3-5",
      "google/gemini-2.5-pro",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },
  openai: {
    label: "OpenAI",
    defaultBaseUrl: undefined,
    defaultModel: "gpt-4o",
    supportsCustomBaseUrl: true,
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"],
  },
  anthropic: {
    label: "Anthropic",
    defaultBaseUrl: undefined,
    defaultModel: "claude-sonnet-4",
    supportsCustomBaseUrl: true,
    models: [
      "claude-sonnet-4",
      "claude-haiku-3-5",
      "claude-opus-4",
    ],
  },
  google: {
    label: "Google",
    defaultBaseUrl: undefined,
    defaultModel: "gemini-2.5-pro",
    supportsCustomBaseUrl: false,
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
};
