export { ProviderManager } from "./provider-manager";
export type { ProviderRecord } from "./provider-manager";

export { createOpenRouterAdapter } from "./adapters/openrouter";
export { createOpenAIAdapter } from "./adapters/openai";
export { createAnthropicAdapter } from "./adapters/anthropic";
export { createGoogleAdapter } from "./adapters/google";

export {
  zodToJsonSchema,
  validateStructuredOutput,
  safeValidateStructuredOutput,
  buildStructuredOutputConfig,
} from "./structured-output";

export {
  executeAIHook,
} from "./hook-executor";
export type {
  HookWriteBehavior,
  AIHookConfig,
  AIHookExecutionInput,
  AIHookExecutionResult,
  AIInsightRecord,
  AIInsightStore,
  EntityUpdateFn,
  EntityFetchFn,
} from "./hook-executor";

export {
  applyFieldMapping,
  buildHookFieldMapping,
  fieldMappingSchema,
} from "./field-mapper";
export type {
  FieldMapping,
  FieldMappingResult,
} from "./field-mapper";

export {
  getBuiltinTemplate,
  listBuiltinTemplateIds,
  listBuiltinTemplates,
  summarizeTemplate,
  classifyTemplate,
  extractContactsTemplate,
  enrichFromWebTemplate,
} from "./templates";
export type { HookTemplate } from "./templates";

export type {
  ProviderConfig,
  ChatMessage,
  GenerateResult,
  AdapterFactory,
  ProviderMetadata,
} from "./types";

export { PROVIDER_METADATA } from "./types";

export { sendMessage, listMessages, clearHistory } from "./chat";
export type {
  SendMessageInput,
  SendMessageResult,
  ChatDeps,
  PersistedChatMessage,
} from "./chat";

export { createCRMTools } from "./tools/index";
export type {
  CRMToolDeps,
  ClientResult,
  ProjectSummaryResult,
  TicketResult,
  PipelineSummaryResult,
  ExchangeResult,
} from "./tools/index";
