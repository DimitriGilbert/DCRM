# Code Review Report - Cluster 11: AI Engine Adapters

**Reviewer**: Code Reviewer - Cluster 11
**Date**: 2026-05-30
**Files Reviewed**:
1. `packages/ai/src/adapters/openai.ts`
2. `packages/ai/src/adapters/anthropic.ts`
3. `packages/ai/src/adapters/google.ts`
4. `packages/ai/src/adapters/openrouter.ts`

**Focus**: Security (API key handling, response validation, error handling, rate limiting)

---

## Summary

**No real issues found.**

All four adapter files are thin, well-structured factory functions that delegate to TanStack AI SDK adapter classes. They follow a consistent pattern: resolve the model name with a fallback to the configured default, construct a provider-specific config object, and return the adapter instance.

---

## Detailed Analysis

### Architecture Understanding

Each adapter is an `AdapterFactory` implementation — a pure function `(config: ProviderConfig, model?: string) => AnyTextAdapter`. They are consumed exclusively by `ProviderManager.createAdapter()`, which:

1. Receives a `ProviderRecord` from the database (with encrypted API key)
2. Decrypts the API key via `CryptoService`
3. Builds a `ProviderConfig` (in-memory only, never persisted)
4. Calls the appropriate factory function

The resulting adapter is then used by `chat.ts` to call `chat()` from TanStack AI.

### Security Assessment — Clean

| Area | Assessment |
|------|-----------|
| **API key exposure** | Keys flow from decryption -> `ProviderConfig.apiKey` -> adapter constructor SDK. Never logged, never serialized, never returned to the client. The `readonly` modifier on the type prevents accidental mutation. |
| **Base URL injection** | `baseUrl` comes from the database (`ProviderRecord.baseUrl`), set by the authenticated user. In this single-user CRM, the user configures their own providers. The OpenAI/Anthropic adapters support custom base URLs for legitimate proxy/self-hosting use cases. OpenRouter hardcodes its endpoint with a config-level override — consistent with `PROVIDER_METADATA`. |
| **OpenRouter headers** | The `HTTP-Referer: https://dcrm.app` and `X-Title: DCRM` headers are application identification required by OpenRouter's API — not secrets. This is correct per OpenRouter's documentation. |
| **Error handling** | These factories don't handle HTTP responses — they create adapter objects. Runtime API errors (auth failures, rate limits, network issues) are the SDK's responsibility and surface through the `chat()` call in `chat.ts`. |
| **Rate limiting** | Not an adapter-layer concern. Would be handled at the tRPC router or middleware level. |

### What I Verified and Confirmed as Non-Issues

- **`as` type casts** (`resolvedModel as "gpt-4o"`, `as unknown as AnyTextAdapter`): These are necessary interop casts between the app's dynamic model strings and TanStack AI's branded model types. Standard pattern for this kind of adapter layer. The actual model string is always the runtime value — the cast is purely for TypeScript satisfaction.

- **No input validation of `config.apiKey`**: If an empty or invalid API key is provided, the underlying SDK will throw an authentication error on the first API call. This is the correct behavior — failing loudly at usage time rather than silently at construction time. The `ProviderManager.decryptApiKey()` already ensures a non-empty string from the decryption pipeline.

- **OpenRouter's `config.baseUrl` override despite `supportsCustomBaseUrl: false`**: The metadata flag is a UI concern (whether to show the base URL field). The adapter correctly accepts it for programmatic flexibility. No inconsistency — the adapter is more permissive than the UI, which is the right direction.

- **Shared `OpenAITextAdapter` between `openai.ts` and `openrouter.ts`**: Intentional — OpenRouter exposes an OpenAI-compatible API. Using the same adapter class is the correct approach.

---

**Verdict**: These files are clean. No security vulnerabilities, logic errors, or data integrity issues found.
