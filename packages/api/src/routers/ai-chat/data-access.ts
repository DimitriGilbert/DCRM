import { db } from "@DCRM/db";
import { aiChatMessages } from "@DCRM/db/schema/automation";
import { clients, projects, tickets, leads, exchanges } from "@DCRM/db/schema/crm";
import { eq, and, isNull, desc, ilike, or, sql } from "drizzle-orm";

import type { CRMToolDeps } from "@DCRM/ai";

/**
 * Creates the CRM tool data access layer scoped to a specific user.
 * These functions query the database directly with user-scoped conditions.
 * They do NOT call tRPC — tools use direct DB access for explicit auditability.
 */
export function createCRMToolDataAccess(userId: string): CRMToolDeps {
  return {
    async searchClients(query, limit) {
      const pattern = `%${query}%`;
      const rows = await db
        .select({
          id: clients.id,
          name: clients.name,
          email: clients.email,
          company: clients.company,
          phone: clients.phone,
          website: clients.website,
        })
        .from(clients)
        .where(
          and(
            eq(clients.userId, userId),
            isNull(clients.deletedAt),
            or(
              ilike(clients.name, pattern),
              ilike(clients.email, pattern),
              ilike(clients.company, pattern),
              ilike(clients.website, pattern),
            ),
          ),
        )
        .orderBy(desc(clients.createdAt))
        .limit(limit);

      return { clients: rows, total: rows.length };
    },

    async getProjectSummary(projectId) {
      // Get project with client name
      const projectRows = await db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          status: projects.status,
          budgetAmount: projects.budgetAmount,
          budgetCurrency: projects.budgetCurrency,
          estimatedHours: projects.estimatedHours,
          actualHours: projects.actualHours,
          startDate: projects.startDate,
          endDate: projects.endDate,
          clientId: projects.clientId,
          clientName: clients.name,
        })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(
          and(
            eq(projects.userId, userId),
            eq(projects.id, projectId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);

      const project = projectRows[0];
      if (!project) return null;

      // Count tickets
      const ticketCounts = await db
        .select({
          status: tickets.status,
          count: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(
          and(
            eq(tickets.userId, userId),
            eq(tickets.projectId, projectId),
            isNull(tickets.deletedAt),
          ),
        )
        .groupBy(tickets.status);

      const totalTickets = ticketCounts.reduce((sum, t) => sum + t.count, 0);
      const openTickets = ticketCounts
        .filter((t) => t.status === "open" || t.status === "in_progress")
        .reduce((sum, t) => sum + t.count, 0);
      const closedTickets = ticketCounts
        .filter((t) => t.status === "closed" || t.status === "resolved")
        .reduce((sum, t) => sum + t.count, 0);

      return {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          budgetAmount: project.budgetAmount,
          budgetCurrency: project.budgetCurrency,
          estimatedHours: project.estimatedHours,
          actualHours: project.actualHours,
          startDate: project.startDate?.toISOString() ?? null,
          endDate: project.endDate?.toISOString() ?? null,
          clientName: project.clientName,
        },
        tickets: { total: totalTickets, open: openTickets, closed: closedTickets },
      };
    },

    async listOpenTickets(projectId, limit) {
      const conditions = [
        eq(tickets.userId, userId),
        isNull(tickets.deletedAt),
        sql`${tickets.status} IN ('open', 'in_progress')`,
      ];

      if (projectId) {
        conditions.push(eq(tickets.projectId, projectId));
      }

      const rows = await db
        .select({
          id: tickets.id,
          title: tickets.title,
          type: tickets.type,
          status: tickets.status,
          priority: tickets.priority,
          dueDate: tickets.dueDate,
          projectName: projects.name,
        })
        .from(tickets)
        .leftJoin(projects, eq(tickets.projectId, projects.id))
        .where(and(...conditions))
        .orderBy(desc(tickets.createdAt))
        .limit(limit);

      return {
        tickets: rows.map((r) => ({
          id: r.id,
          title: r.title,
          type: r.type,
          status: r.status,
          priority: r.priority,
          dueDate: r.dueDate?.toISOString() ?? null,
          projectName: r.projectName ?? "Unknown",
        })),
        total: rows.length,
      };
    },

    async getPipelineSummary() {
      const rows = await db
        .select({
          stage: leads.stage,
          count: sql<number>`count(*)::int`,
          totalEstimatedValue: sql<number>`coalesce(sum(${leads.estimatedValue}), 0)::real`,
        })
        .from(leads)
        .where(
          and(
            eq(leads.userId, userId),
            isNull(leads.deletedAt),
          ),
        )
        .groupBy(leads.stage);

      const stageResults = rows.map((r) => ({
        stage: r.stage,
        count: r.count,
        totalEstimatedValue: r.totalEstimatedValue,
      }));

      const activeStages = stageResults.filter(
        (s) => s.stage !== "won" && s.stage !== "lost",
      );
      const totalActiveValue = activeStages.reduce(
        (sum, s) => sum + s.totalEstimatedValue,
        0,
      );
      const totalLeads = stageResults.reduce((sum, s) => sum + s.count, 0);

      return { stages: stageResults, totalActiveValue, totalLeads };
    },

    async getRecentExchanges(limit, clientId, projectId) {
      const conditions = [eq(exchanges.userId, userId)];

      if (clientId) {
        conditions.push(eq(exchanges.clientId, clientId));
      }
      if (projectId) {
        conditions.push(eq(exchanges.projectId, projectId));
      }

      const rows = await db
        .select({
          id: exchanges.id,
          type: exchanges.type,
          subject: exchanges.subject,
          body: exchanges.body,
          direction: exchanges.direction,
          createdAt: exchanges.createdAt,
          clientName: clients.name,
          projectName: projects.name,
        })
        .from(exchanges)
        .leftJoin(clients, eq(exchanges.clientId, clients.id))
        .leftJoin(projects, eq(exchanges.projectId, projects.id))
        .where(and(...conditions))
        .orderBy(desc(exchanges.createdAt))
        .limit(limit);

      return {
        exchanges: rows.map((r) => ({
          id: r.id,
          type: r.type,
          subject: r.subject,
          body: r.body,
          direction: r.direction,
          createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
          clientName: r.clientName,
          projectName: r.projectName,
        })),
        total: rows.length,
      };
    },
  };
}

/**
 * Message store implementation backed by the ai_chat_messages table.
 * The userId parameter is unused in the store itself — scoping is handled
 * at the call site (the chat engine passes userId into each store method).
 */
export function createMessageStore(_userId: string) {
  return {
    async insert(msg: {
      id: string;
      userId: string;
      role: "user" | "assistant" | "system";
      content: string;
      toolCalls: Record<string, unknown>[] | null;
      metadata: Record<string, unknown> | null;
    }) {
      await db.insert(aiChatMessages).values({
        id: msg.id,
        userId: msg.userId,
        role: msg.role,
        content: msg.content,
        toolCalls: msg.toolCalls,
        metadata: msg.metadata,
        createdAt: new Date(),
      });
    },

    async getByUserId(uid: string, msgLimit: number) {
      return db
        .select()
        .from(aiChatMessages)
        .where(eq(aiChatMessages.userId, uid))
        .orderBy(desc(aiChatMessages.createdAt))
        .limit(msgLimit);
    },

    async deleteByUserId(uid: string) {
      await db
        .delete(aiChatMessages)
        .where(eq(aiChatMessages.userId, uid));
    },
  };
}
