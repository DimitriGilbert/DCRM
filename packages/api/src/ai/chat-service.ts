import { generateCrmChatWithTanStack } from "@DCRM/ai";
import { LEAD_STAGES } from "@DCRM/domain";

import type { CrmChatMessage, CrmChatRunner, CrmChatToolResult, JsonObject } from "@DCRM/ai";
import type { SecretCrypto } from "@DCRM/crypto";

import type { AutomationRepository, AiMessageRecord } from "../automation/repository.js";
import type { CrmRepository } from "../crm/repository.js";
import type { LeadRecord, ProjectRecord } from "../crm/types.js";

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
  const intent = classifyCrmChatIntent(query);
  const toolResults: CrmChatToolResult[] = [];

  if (intent.clients) {
    const clients = await searchClientsByQuery({ userId: input.userId, crmRepository: input.crmRepository, query });
    toolResults.push({
      name: "searchClients",
      input: { query },
      output: { clients: clients.slice(0, DEFAULT_TOOL_LIMIT).map((client) => ({ id: client.id, name: client.name, company: client.company })) },
    });
  }

  if (intent.projects) {
    const projects = await searchProjectsByQuery({ userId: input.userId, crmRepository: input.crmRepository, query });
    const project = resolveScopedProject({ query, projects });
    toolResults.push({
      name: "summarizeProject",
      input: { query, projectId: project?.id ?? null },
      output: project ? projectSummary(project, intent.financials) : { project: null },
    });
  }

  if (intent.tickets) {
    const openTickets = await input.crmRepository.tickets.list({ userId: input.userId, status: "open", search: query });
    toolResults.push({
      name: "listOpenTickets",
      input: { query, limit: DEFAULT_TOOL_LIMIT },
      output: { tickets: openTickets.slice(0, DEFAULT_TOOL_LIMIT).map((ticket) => ({ id: ticket.id, title: ticket.title, priority: ticket.priority, dueAt: ticket.dueAt?.toISOString() ?? null })) },
    });
  }

  if (intent.leads) {
    const leads = await input.crmRepository.leads.list({ userId: input.userId, search: query });
    toolResults.push({ name: "pipelineSummary", input: { query }, output: { stages: summarizePipeline(leads, intent.financials) } });
  }

  if (intent.exchanges) {
    const exchanges = await input.crmRepository.exchanges.list({ userId: input.userId, search: query });
    toolResults.push({
      name: "recentExchanges",
      input: { query, limit: DEFAULT_TOOL_LIMIT },
      output: { exchanges: exchanges.slice(0, DEFAULT_TOOL_LIMIT).map((exchange) => ({ id: exchange.id, type: exchange.type, occurredAt: exchange.occurredAt.toISOString() })) },
    });
  }

  return toolResults;
}

function summarizePipeline(leads: readonly LeadRecord[], includeEstimatedValue: boolean): readonly JsonObject[] {
  return LEAD_STAGES.map((stage) => {
    const stageLeads = leads.filter((lead) => lead.stage === stage);
    return {
      stage,
      count: stageLeads.length,
      ...(includeEstimatedValue ? { estimatedValue: summarizeEstimatedValue(stageLeads) } : {}),
    };
  }).filter((stage) => typeof stage.count === "number" && stage.count > 0);
}

function classifyCrmChatIntent(message: string) {
  const lower = message.toLowerCase();
  const clients = includesAny(lower, ["client", "customer", "contact", "company"]);
  const projects = includesAny(lower, ["project"]);
  const tickets = includesAny(lower, ["ticket", "issue", "support", "bug", "open task"]);
  const leads = includesAny(lower, ["lead", "pipeline", "prospect", "sales"]);
  const exchanges = includesAny(lower, ["email", "message", "exchange", "conversation", "thread"]);
  const financials = includesAny(lower, ["budget", "value", "amount", "revenue", "money", "cost"]);
  return { clients, projects, tickets, leads, exchanges, financials };
}

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

async function searchClientsByQuery(input: { readonly userId: string; readonly crmRepository: CrmRepository; readonly query: string }) {
  const directMatches = await input.crmRepository.clients.list({ userId: input.userId, search: input.query });
  if (directMatches.length > 0) {
    return directMatches;
  }
  for (const term of searchableTerms(input.query)) {
    const termMatches = await input.crmRepository.clients.list({ userId: input.userId, search: term });
    if (termMatches.length > 0) {
      return termMatches;
    }
  }
  return [];
}

async function searchProjectsByQuery(input: { readonly userId: string; readonly crmRepository: CrmRepository; readonly query: string }) {
  const directMatches = await input.crmRepository.projects.list({ userId: input.userId, search: input.query });
  if (directMatches.length > 0) {
    return directMatches;
  }
  for (const term of searchableTerms(input.query)) {
    const termMatches = await input.crmRepository.projects.list({ userId: input.userId, search: term });
    if (termMatches.length > 0) {
      return termMatches;
    }
  }
  return [];
}

function searchableTerms(query: string): readonly string[] {
  const stopWords = new Set(["and", "are", "can", "client", "clients", "contact", "contacts", "find", "for", "from", "give", "have", "how", "lead", "leads", "message", "messages", "open", "project", "projects", "search", "show", "summarize", "the", "ticket", "tickets", "what", "work"]);
  return query
    .toLowerCase()
    .split(/[^a-z0-9@._-]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !stopWords.has(term));
}

function resolveScopedProject(input: { readonly query: string; readonly projects: readonly ProjectRecord[] }): ProjectRecord | undefined {
  const [onlyProject] = input.projects;
  if (input.projects.length === 1) {
    return onlyProject;
  }

  const normalizedQuery = normalizeEntityScope(input.query);
  const explicitNameMatches = input.projects.filter((project) => normalizedQuery.includes(normalizeEntityScope(project.name)));
  if (explicitNameMatches.length === 1) {
    return explicitNameMatches[0];
  }

  return undefined;
}

function normalizeEntityScope(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function projectSummary(project: ProjectRecord, includeFinancials: boolean): JsonObject {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    dueAt: project.dueAt?.toISOString() ?? null,
    ...(includeFinancials ? { budgetAmount: project.budgetAmount, budgetCurrency: project.budgetCurrency } : {}),
  };
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
