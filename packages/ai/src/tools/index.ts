import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// --- Tool Definitions ---
// Each tool is defined with toolDefinition + .server() for explicit server-side execution.
// Tools are user-scoped: the server implementation receives userId to scope all queries.

/**
 * Search clients by name, email, company, or website.
 * Returns matching client records scoped to the user.
 */
export const searchClientsTool = toolDefinition({
  name: "search_clients",
  description:
    "Search clients by name, email, company, or website. Returns matching client profiles.",
  inputSchema: z.object({
    query: z.string().meta({ description: "Search term to match against client fields" }),
    limit: z.number().min(1).max(20).optional().meta({ description: "Max results (default 10)" }),
  }),
  outputSchema: z.object({
    clients: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().nullable(),
        company: z.string().nullable(),
        phone: z.string().nullable(),
        website: z.string().nullable(),
      }),
    ),
    total: z.number(),
  }),
});

/**
 * Summarize a project by ID. Returns project details and related ticket counts.
 */
export const summarizeProjectTool = toolDefinition({
  name: "summarize_project",
  description:
    "Get a summary of a project by its ID, including status, budget, and ticket statistics.",
  inputSchema: z.object({
    projectId: z.string().meta({ description: "The project ID to summarize" }),
  }),
  outputSchema: z.object({
    project: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      status: z.string(),
      budgetAmount: z.number().nullable(),
      budgetCurrency: z.string().nullable(),
      estimatedHours: z.number().nullable(),
      actualHours: z.number().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      clientName: z.string().nullable(),
    }),
    tickets: z.object({
      total: z.number(),
      open: z.number(),
      closed: z.number(),
    }),
  }),
});

/**
 * List open tickets, optionally filtered by project.
 */
export const listOpenTicketsTool = toolDefinition({
  name: "list_open_tickets",
  description:
    "List open tickets, optionally filtered by project. Returns ticket details with priority and due dates.",
  inputSchema: z.object({
    projectId: z.string().optional().meta({ description: "Filter by project ID" }),
    limit: z.number().min(1).max(20).optional().meta({ description: "Max results (default 10)" }),
  }),
  outputSchema: z.object({
    tickets: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        type: z.string(),
        status: z.string(),
        priority: z.string(),
        dueDate: z.string().nullable(),
        projectName: z.string(),
      }),
    ),
    total: z.number(),
  }),
});

/**
 * Get a summary of the lead pipeline — counts and values per stage.
 */
export const pipelineSummaryTool = toolDefinition({
  name: "pipeline_summary",
  description:
    "Get a summary of the lead pipeline showing counts and estimated values per stage.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    stages: z.array(
      z.object({
        stage: z.string(),
        count: z.number(),
        totalEstimatedValue: z.number(),
      }),
    ),
    totalActiveValue: z.number(),
    totalLeads: z.number(),
  }),
});

/**
 * Get recent exchanges (emails, notes, calls, meetings).
 */
export const recentExchangesTool = toolDefinition({
  name: "recent_exchanges",
  description:
    "Get recent exchanges (emails, notes, calls, meetings) across all clients and projects.",
  inputSchema: z.object({
    limit: z.number().min(1).max(20).optional().meta({ description: "Max results (default 10)" }),
    clientId: z.string().optional().meta({ description: "Filter by client ID" }),
    projectId: z.string().optional().meta({ description: "Filter by project ID" }),
  }),
  outputSchema: z.object({
    exchanges: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        subject: z.string().nullable(),
        body: z.string().nullable(),
        direction: z.string(),
        createdAt: z.string(),
        clientName: z.string().nullable(),
        projectName: z.string().nullable(),
      }),
    ),
    total: z.number(),
  }),
});

// --- Tool Server Implementations ---
// These types define the shape of the data access layer injected at call time.
// The API layer provides implementations that query the DB scoped by userId.

export type SearchClientsFn = (
  query: string,
  limit: number,
) => Promise<{ clients: Array<ClientResult>; total: number }>;

export type GetProjectSummaryFn = (
  projectId: string,
) => Promise<ProjectSummaryResult | null>;

export type ListOpenTicketsFn = (
  projectId: string | undefined,
  limit: number,
) => Promise<{ tickets: Array<TicketResult>; total: number }>;

export type GetPipelineSummaryFn = (
) => Promise<PipelineSummaryResult>;

export type GetRecentExchangesFn = (
  limit: number,
  clientId: string | undefined,
  projectId: string | undefined,
) => Promise<{ exchanges: Array<ExchangeResult>; total: number }>;

export type CRMToolDeps = {
  searchClients: SearchClientsFn;
  getProjectSummary: GetProjectSummaryFn;
  listOpenTickets: ListOpenTicketsFn;
  getPipelineSummary: GetPipelineSummaryFn;
  getRecentExchanges: GetRecentExchangesFn;
};

export type ClientResult = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  website: string | null;
};

export type ProjectSummaryResult = {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    budgetAmount: number | null;
    budgetCurrency: string | null;
    estimatedHours: number | null;
    actualHours: number | null;
    startDate: string | null;
    endDate: string | null;
    clientName: string | null;
  };
  tickets: {
    total: number;
    open: number;
    closed: number;
  };
};

export type TicketResult = {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectName: string;
};

export type PipelineSummaryResult = {
  stages: Array<{
    stage: string;
    count: number;
    totalEstimatedValue: number;
  }>;
  totalActiveValue: number;
  totalLeads: number;
};

export type ExchangeResult = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  direction: string;
  createdAt: string;
  clientName: string | null;
  projectName: string | null;
};

/**
 * Creates server-side tool instances bound to a specific user and data access layer.
 * The deps are already user-scoped (created via createCRMToolDataAccess(userId)).
 */
export function createCRMTools(_userId: string, deps: CRMToolDeps) {
  const searchClients = searchClientsTool.server(async ({ query, limit: inputLimit }) => {
    const limit = inputLimit ?? 10;
    return deps.searchClients(query, limit);
  });

  const summarizeProject = summarizeProjectTool.server(async ({ projectId }) => {
    const result = await deps.getProjectSummary(projectId);
    if (!result) {
      return {
        project: {
          id: projectId,
          name: "Not found",
          description: null,
          status: "unknown",
          budgetAmount: null,
          budgetCurrency: null,
          estimatedHours: null,
          actualHours: null,
          startDate: null,
          endDate: null,
          clientName: null,
        },
        tickets: { total: 0, open: 0, closed: 0 },
      };
    }
    return result;
  });

  const listOpenTickets = listOpenTicketsTool.server(async ({ projectId, limit: inputLimit }) => {
    const limit = inputLimit ?? 10;
    return deps.listOpenTickets(projectId, limit);
  });

  const pipelineSummary = pipelineSummaryTool.server(async () => {
    return deps.getPipelineSummary();
  });

  const recentExchanges = recentExchangesTool.server(
    async ({ limit: inputLimit, clientId, projectId }) => {
      const limit = inputLimit ?? 10;
      return deps.getRecentExchanges(limit, clientId, projectId);
    },
  );

  return [searchClients, summarizeProject, listOpenTickets, pipelineSummary, recentExchanges] as const;
}
