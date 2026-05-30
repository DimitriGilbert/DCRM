import { randomUUID } from "node:crypto";

import { chat } from "@tanstack/ai";
import type { AnyTextAdapter } from "@tanstack/ai";

import { createCRMTools, type CRMToolDeps } from "./tools/index";

// --- Types ---

/**
 * A persisted chat message from the ai_chat_messages table.
 */
export type PersistedChatMessage = {
  readonly id: string;
  readonly userId: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly toolCalls: Record<string, unknown>[] | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
};

/**
 * Input for sending a new user message in the chat.
 */
export type SendMessageInput = {
  readonly userId: string;
  readonly content: string;
  readonly providerId: string;
  readonly model?: string;
};

/**
 * Result of sending a message and getting the AI response.
 */
export type SendMessageResult = {
  readonly assistantMessageId: string;
  readonly userMessageId: string;
  readonly content: string;
  readonly toolCalls: Record<string, unknown>[];
  readonly model: string;
  readonly provider: string;
};

/**
 * Dependencies for the chat module — data access layer and provider management.
 */
export type ChatDeps = {
  readonly adapter: AnyTextAdapter;
  readonly provider: string;
  readonly model: string;
  readonly messageStore: {
    readonly insert: (msg: Omit<PersistedChatMessage, "createdAt">) => Promise<void>;
    readonly getByUserId: (userId: string, limit: number) => Promise<PersistedChatMessage[]>;
    readonly deleteByUserId: (userId: string) => Promise<void>;
  };
  readonly crmDeps: CRMToolDeps;
};

// --- Constants ---

const SYSTEM_PROMPT = `You are a helpful AI assistant for DCRM, a micro CRM for independent contractors. 
You help users manage their clients, leads, projects, tickets, and exchanges.
You have access to CRM tools to look up real data. Always use tools when the user asks about their CRM data.
Be concise and actionable in your responses.`;

const MAX_HISTORY_MESSAGES = 50;

// --- Chat Engine ---

/**
 * Send a user message and get an AI response with tool execution.
 *
 * Flow:
 * 1. Persist user message
 * 2. Load conversation history
 * 3. Create user-scoped CRM tools
 * 4. Call TanStack AI chat with tools and history
 * 5. Persist assistant response
 * 6. Return result
 */
export async function sendMessage(
  input: SendMessageInput,
  deps: ChatDeps,
): Promise<SendMessageResult> {
  // 1. Persist user message
  const userMessageId = randomUUID();
  await deps.messageStore.insert({
    id: userMessageId,
    userId: input.userId,
    role: "user",
    content: input.content,
    toolCalls: null,
    metadata: null,
  });

  // 2. Load conversation history
  const history = await deps.messageStore.getByUserId(input.userId, MAX_HISTORY_MESSAGES);

  // Build messages array from history (oldest first)
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const sorted = [...history].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  for (const msg of sorted) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // 3. Create user-scoped CRM tools
  const tools = createCRMTools(input.userId, deps.crmDeps);

  // 4. Call TanStack AI chat
  const result = await chat({
    adapter: deps.adapter,
    systemPrompts: [SYSTEM_PROMPT],
    messages,
    tools: [...tools],
    stream: false,
  });

  const responseText = typeof result === "string" ? result : JSON.stringify(result);

  // 5. Persist assistant response
  const assistantMessageId = randomUUID();
  await deps.messageStore.insert({
    id: assistantMessageId,
    userId: input.userId,
    role: "assistant",
    content: responseText,
    toolCalls: [],
    metadata: {
      model: deps.model,
      provider: deps.provider,
    },
  });

  // 6. Return result
  return {
    assistantMessageId,
    userMessageId,
    content: responseText,
    toolCalls: [],
    model: deps.model,
    provider: deps.provider,
  };
}

/**
 * List chat messages for a user, ordered by creation time (newest first).
 */
export async function listMessages(
  userId: string,
  deps: Pick<ChatDeps, "messageStore">,
  limit = 50,
): Promise<PersistedChatMessage[]> {
  const messages = await deps.messageStore.getByUserId(userId, limit);
  return [...messages].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Clear all chat messages for a user.
 */
export async function clearHistory(
  userId: string,
  deps: Pick<ChatDeps, "messageStore">,
): Promise<void> {
  await deps.messageStore.deleteByUserId(userId);
}
