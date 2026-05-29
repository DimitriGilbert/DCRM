import { describe, expect, it } from "vitest";

describe("AI providers", () => {
  it("exports all required AI providers from PRD", async () => {
    const { AI_PROVIDERS } = await import("../src/ai");

    expect(AI_PROVIDERS).toEqual({
      OPENROUTER: "openrouter",
      OPENAI: "openai",
      ANTHROPIC: "anthropic",
      GOOGLE: "google",
    });
  });

  it("validates correct AI providers via schema", async () => {
    const { AI_PROVIDERS, aiProviderSchema } = await import("../src/ai");

    for (const provider of Object.values(AI_PROVIDERS)) {
      expect(aiProviderSchema.safeParse(provider).success).toBe(true);
    }
  });

  it("rejects invalid AI provider values", async () => {
    const { aiProviderSchema } = await import("../src/ai");

    expect(aiProviderSchema.safeParse("azure").success).toBe(false);
  });

  it("exports AI_PROVIDER_VALUES array", async () => {
    const { AI_PROVIDER_VALUES } = await import("../src/ai");

    expect(AI_PROVIDER_VALUES).toEqual([
      "openrouter",
      "openai",
      "anthropic",
      "google",
    ]);
  });
});
