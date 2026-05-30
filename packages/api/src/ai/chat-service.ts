import { generateCrmChatWithTanStack } from "@DCRM/ai";
import { LEAD_STAGES } from "@DCRM/domain";

import type { CrmChatMessage, CrmChatRunner, CrmChatToolResult, JsonObject } from "@DCRM/ai";
import type { SecretCrypto } from "@DCRM/crypto";

import type { AutomationRepository, AiMessageRecord } from "../automation/repository.js";
import type { CrmRepository } from "../crm/repository.js";
import type { LeadRecord } from "../crm/types.js";

const HISTORY_LIMIT = 30;
const DEFAULT_TOOL_LIMIT = 5;

export type SendAiChatMessageInput = {
  readonly userId: string;
  readonly message: string;
  readonly conversationId?: string;
  readonly providerId?: string;
  readonly model?: string;
  readonly crmRepository: CrmRepository;
  readonly automationRepository: AutomationRepository;
  readonly secretCrypto: SecretCrypto;
  readonly runner?: CrmChatRunner;
  readonly now?: Date;
  readonly idGenerator?: () => string;
};

export type AiChatResponse = {
  readonly conversationId: string;
  readonly message: AiMessageRecord;
  readonly toolMessages: readonly AiMessageRecord[];
  readonly history: readonly AiMessageRecord[];
};

export async function sendAiChatMessage(input: SendAiChatMessageInput): Promise<AiChatResponse> {
  const now = input.now ?? new Date();
  const nextMessageTimestamp = createMonotonicTimestampFactory(now);
  const idGenerator = input.idGenerator ?? (() => crypto.randomUUID());
  const conversationId = input.conversationId ?? idGenerator();
  const provider = await resolveProvider(input);
  const model = input.model?.trim() || provider.defaultModel;
  if (!model) {
    throw new Error("AI chat requires a model.");
  }

  await input.automationRepository.aiMessages.create({
    id: idGenerator(),
    userId: input.userId,
    providerId: provider.id,
    conversationId,
    role: "user",
    content: input.message,
    toolCalls: {},
    metadata: {},
    now: nextMessageTimestamp(),
  });

  const toolResults = await executeCrmChatTools({ userId: input.userId, crmRepository: input.crmRepository, message: input.message });
  const toolMessages = await Promise.all(
    toolResults.map((result) =>
      input.automationRepository.aiMessages.create({
        id: idGenerator(),
        userId: input.userId,
        providerId: provider.id,
        conversationId,
        role: "tool",
        content: JSON.stringify(result.output),
        toolCalls: { name: result.name, input: result.input, output: result.output },
        metadata: { auditable: true },
        now: nextMessageTimestamp(),
      }),
    ),
  );
  const persistedHistory = await input.automationRepository.aiMessages.listConversation({ userId: input.userId, conversationId, limit: HISTORY_LIMIT });
  const assistant = await (input.runner ?? { generate: generateCrmChatWithTanStack }).generate({
    provider,
    model,
    messages: toModelMessages(persistedHistory),
    toolResults,
  });
  const message = await input.automationRepository.aiMessages.create({
    id: idGenerator(),
    userId: input.userId,
    providerId: provider.id,
    conversationId,
    role: "assistant",
    content: assistant.content,
    toolCalls: { tools: toolResults.map((result) => result.name) },
    metadata: { model, toolCount: toolResults.length },
    now: nextMessageTimestamp(),
  });
  const history = await input.automationRepository.aiMessages.listConversation({ userId: input.userId, conversationId, limit: HISTORY_LIMIT });
  return { conversationId, message, toolMessages, history };
}

function createMonotonicTimestampFactory(base: Date): () => Date {
  let offsetMilliseconds = 0;
  return () => new Date(base.getTime() + offsetMilliseconds++);
}

async function resolveProvider(input: SendAiChatMessageInput) {
  const crypto = input.secretCrypto;
  if (input.providerId) {
    const provider = await input.automationRepository.aiProviders.getDecrypted({ userId: input.userId, id: input.providerId, crypto });
    if (!provider) {
      throw new Error("AI provider was not found for chat.");
    }
    return provider;
  }
  const providers = await input.automationRepository.aiProviders.listEncrypted({ userId: input.userId });
  const provider = providers.find((candidate) => candidate.enabled);
  if (!provider) {
    throw new Error("AI chat requires an enabled BYOK provider.");
  }
  return { ...provider, apiKey: crypto.decrypt(provider.encryptedApiKey) };
}

async function executeCrmChatTools(input: { readonly userId: string; readonly crmRepository: CrmRepository; readonly message: string }): Promise<readonly CrmChatToolResult[]> {
  const query = input.message.trim();
  const [matchedClients, allClients, projects, openTickets, leads, exchanges] = await Promise.all([
    input.crmRepository.clients.list({ userId: input.userId, search: query }),
    input.crmRepository.clients.list({ userId: input.userId }),
    input.crmRepository.projects.list({ userId: input.userId }),
    input.crmRepository.tickets.list({ userId: input.userId, status: "open" }),
    input.crmRepository.leads.list({ userId: input.userId }),
    input.crmRepository.exchanges.listTimeline({ userId: input.userId }),
  ]);
  const clients = matchedClients.length > 0 ? matchedClients : allClients;
  const project = projects.find((candidate) => query.toLowerCase().includes(candidate.name.toLowerCase())) ?? projects[0];

  return [
    {
      name: "searchClients",
      input: { query },
      output: { clients: clients.slice(0, DEFAULT_TOOL_LIMIT).map((client) => ({ id: client.id, name: client.name, email: client.email, company: client.company })) },
    },
    {
      name: "summarizeProject",
      input: { projectId: project?.id ?? null },
      output: project
        ? { id: project.id, name: project.name, status: project.status, budgetAmount: project.budgetAmount, budgetCurrency: project.budgetCurrency, dueAt: project.dueAt?.toISOString() ?? null }
        : { project: null },
    },
    {
      name: "listOpenTickets",
      input: { limit: DEFAULT_TOOL_LIMIT },
      output: { tickets: openTickets.slice(0, DEFAULT_TOOL_LIMIT).map((ticket) => ({ id: ticket.id, title: ticket.title, priority: ticket.priority, dueAt: ticket.dueAt?.toISOString() ?? null })) },
    },
    { name: "pipelineSummary", input: {}, output: { stages: summarizePipeline(leads) } },
    {
      name: "recentExchanges",
      input: { limit: DEFAULT_TOOL_LIMIT },
      output: { exchanges: exchanges.slice(0, DEFAULT_TOOL_LIMIT).map((exchange) => ({ id: exchange.id, type: exchange.type, subject: exchange.subject, occurredAt: exchange.occurredAt.toISOString() })) },
    },
  ];
}

function summarizePipeline(leads: readonly LeadRecord[]): readonly JsonObject[] {
  return LEAD_STAGES.map((stage) => {
    const stageLeads = leads.filter((lead) => lead.stage === stage);
    return { stage, count: stageLeads.length, estimatedValue: summarizeEstimatedValue(stageLeads) };
  }).filter((stage) => typeof stage.count === "number" && stage.count > 0);
}

function summarizeEstimatedValue(leads: readonly LeadRecord[]): string {
  const totalsByCurrency = new Map<string, number>();
  for (const lead of leads) {
    if (lead.estimatedValueAmount && lead.estimatedValueCurrency) {
      totalsByCurrency.set(lead.estimatedValueCurrency, (totalsByCurrency.get(lead.estimatedValueCurrency) ?? 0) + Number(lead.estimatedValueAmount));
    }
  }
  const totals = Array.from(totalsByCurrency.entries()).map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`);
  return totals.length > 0 ? totals.join(" + ") : "No estimated value";
}

function toModelMessages(messages: readonly AiMessageRecord[]): readonly CrmChatMessage[] {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}
