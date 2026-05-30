import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderManager } from "../src/provider-manager";
import type { ProviderRecord } from "../src/provider-manager";
import type { CryptoService, EncryptedValue } from "@DCRM/crypto";

// --- Mock crypto service ---

const MOCK_ENCRYPTED: EncryptedValue = {
  ciphertext: "encrypted-value",
  iv: "iv-value",
  authTag: "tag-value",
  version: 1,
};

function createMockCrypto(): CryptoService {
  return {
    encrypt: vi.fn((plaintext: string) => ({
      ...MOCK_ENCRYPTED,
      ciphertext: `enc(${plaintext})`,
    })),
    decrypt: vi.fn((encrypted: EncryptedValue) => {
      // Extract plaintext from our mock ciphertext format
      const match = encrypted.ciphertext.match(/^enc\((.+)\)$/);
      return match?.[1] ?? "decrypted-key";
    }),
  };
}

// --- Mock adapter factories ---

vi.mock("@tanstack/ai-openai", () => ({
  OpenAITextAdapter: vi.fn((_config: unknown, model: string) => {
    const cfg = _config as { apiKey?: string; baseURL?: string };
    return {
      kind: "text",
      name: "openai",
      model,
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
    };
  }),
}));

vi.mock("@tanstack/ai-anthropic", () => ({
  AnthropicTextAdapter: vi.fn((_config: unknown, model: string) => {
    const cfg = _config as { apiKey?: string; baseURL?: string };
    return {
      kind: "text",
      name: "anthropic",
      model,
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
    };
  }),
}));

vi.mock("@tanstack/ai-gemini", () => ({
  GeminiTextAdapter: vi.fn((_config: unknown, model: string) => {
    const cfg = _config as { apiKey?: string };
    return {
      kind: "text",
      name: "gemini",
      model,
      apiKey: cfg.apiKey,
    };
  }),
}));

describe("ProviderManager", () => {
  let crypto: CryptoService;
  let manager: ProviderManager;

  beforeEach(() => {
    crypto = createMockCrypto();
    manager = new ProviderManager(crypto);
  });

  describe("decryptApiKey", () => {
    it("decrypts a JSON-serialized EncryptedValue", () => {
      const encryptedJson = JSON.stringify({
        ciphertext: "enc(my-secret-key)",
        iv: "iv-value",
        authTag: "tag-value",
        version: 1,
      });

      const result = manager.decryptApiKey(encryptedJson);

      expect(result).toBe("my-secret-key");
    });

    it("throws on malformed JSON", () => {
      expect(() => manager.decryptApiKey("not-json")).toThrow();
    });
  });

  describe("buildConfig", () => {
    it("builds config from a provider record with default model", () => {
      const record: ProviderRecord = {
        id: "provider-1",
        userId: "user-1",
        provider: "openai",
        name: "My OpenAI",
        encryptedApiKey: JSON.stringify({
          ciphertext: "enc(sk-test-key)",
          iv: "iv-value",
          authTag: "tag-value",
          version: 1,
        }),
        baseUrl: "https://custom-openai.example.com/v1",
        config: null,
        enabled: true,
      };

      const config = manager.buildConfig(record);

      expect(config.id).toBe("provider-1");
      expect(config.provider).toBe("openai");
      expect(config.name).toBe("My OpenAI");
      expect(config.apiKey).toBe("sk-test-key");
      expect(config.baseUrl).toBe("https://custom-openai.example.com/v1");
      expect(config.defaultModel).toBe("gpt-4o");
    });

    it("uses defaultModel from config when present", () => {
      const record: ProviderRecord = {
        id: "provider-2",
        userId: "user-1",
        provider: "openai",
        name: "Custom Model",
        encryptedApiKey: JSON.stringify({
          ciphertext: "enc(sk-test)",
          iv: "iv-value",
          authTag: "tag-value",
          version: 1,
        }),
        config: { defaultModel: "gpt-4.1-mini" },
        enabled: true,
      };

      const config = manager.buildConfig(record);

      expect(config.defaultModel).toBe("gpt-4.1-mini");
    });

    it("handles null baseUrl and config", () => {
      const record: ProviderRecord = {
        id: "provider-3",
        userId: "user-1",
        provider: "anthropic",
        name: "Anthropic",
        encryptedApiKey: JSON.stringify({
          ciphertext: "enc(ant-key)",
          iv: "iv-value",
          authTag: "tag-value",
          version: 1,
        }),
        baseUrl: null,
        config: null,
        enabled: true,
      };

      const config = manager.buildConfig(record);

      expect(config.baseUrl).toBeUndefined();
      expect(config.config).toBeUndefined();
      expect(config.defaultModel).toBe("claude-sonnet-4");
    });
  });

  describe("createAdapter", () => {
    it("creates an OpenAI adapter with custom base URL", async () => {
      const { OpenAITextAdapter } = await import("@tanstack/ai-openai");

      const config = {
        id: "p1",
        provider: "openai" as const,
        name: "OpenAI",
        apiKey: "sk-test",
        baseUrl: "https://proxy.example.com/v1",
        defaultModel: "gpt-4o",
      };

      const adapter = manager.createAdapter(config);

      expect(adapter).toBeDefined();
      expect(OpenAITextAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "sk-test",
          baseURL: "https://proxy.example.com/v1",
        }),
        "gpt-4o",
      );
    });

    it("creates an OpenAI adapter without custom base URL", async () => {
      const { OpenAITextAdapter } = await import("@tanstack/ai-openai");

      const config = {
        id: "p2",
        provider: "openai" as const,
        name: "OpenAI",
        apiKey: "sk-test",
        defaultModel: "gpt-4o",
      };

      manager.createAdapter(config);

      expect(OpenAITextAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "sk-test",
        }),
        "gpt-4o",
      );
    });

    it("creates an OpenRouter adapter with correct base URL", async () => {
      const { OpenAITextAdapter } = await import("@tanstack/ai-openai");

      const config = {
        id: "p3",
        provider: "openrouter" as const,
        name: "OpenRouter",
        apiKey: "or-key",
        defaultModel: "openai/gpt-4o",
      };

      manager.createAdapter(config);

      expect(OpenAITextAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "or-key",
          baseURL: "https://openrouter.ai/api/v1",
        }),
        "openai/gpt-4o",
      );
    });

    it("creates an Anthropic adapter with custom base URL", async () => {
      const { AnthropicTextAdapter } = await import("@tanstack/ai-anthropic");

      const config = {
        id: "p4",
        provider: "anthropic" as const,
        name: "Anthropic",
        apiKey: "ant-key",
        baseUrl: "https://anthropic-proxy.example.com",
        defaultModel: "claude-sonnet-4",
      };

      manager.createAdapter(config);

      expect(AnthropicTextAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "ant-key",
          baseURL: "https://anthropic-proxy.example.com",
        }),
        "claude-sonnet-4",
      );
    });

    it("creates a Google adapter", async () => {
      const { GeminiTextAdapter } = await import("@tanstack/ai-gemini");

      const config = {
        id: "p5",
        provider: "google" as const,
        name: "Google",
        apiKey: "google-key",
        defaultModel: "gemini-2.5-pro",
      };

      manager.createAdapter(config);

      expect(GeminiTextAdapter).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "google-key" }),
        "gemini-2.5-pro",
      );
    });

    it("throws for unsupported provider", () => {
      const config = {
        id: "p6",
        provider: "unsupported" as unknown as "openai",
        name: "Bad",
        apiKey: "key",
        defaultModel: "model",
      };

      expect(() => manager.createAdapter(config)).toThrow(
        "Unsupported AI provider: unsupported",
      );
    });

    it("uses override model when provided", async () => {
      const { OpenAITextAdapter } = await import("@tanstack/ai-openai");

      const config = {
        id: "p7",
        provider: "openai" as const,
        name: "OpenAI",
        apiKey: "sk-test",
        defaultModel: "gpt-4o",
      };

      manager.createAdapter(config, "gpt-4.1-mini");

      expect(OpenAITextAdapter).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-test" }),
        "gpt-4.1-mini",
      );
    });
  });
});
