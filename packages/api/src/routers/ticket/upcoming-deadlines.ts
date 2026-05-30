import { db } from "@DCRM/db";
import { tickets } from "@DCRM/db/schema/crm";
import { TICKET_STATUSES } from "@DCRM/domain";
import { eq, and, isNull, isNotNull, gte, asc, inArray } from "drizzle-orm";

import { protectedProcedure } from "../../index";

export const upcomingTicketDeadlines = protectedProcedure
  .query(async ({ ctx }) => {
    const now = new Date();

    const rows = await db
      .select({
        id: tickets.id,
        title: tickets.title,
        dueDate: tickets.dueDate,
        status: tickets.status,
        priority: tickets.priority,
        projectId: tickets.projectId,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.userId, ctx.user.id),
          isNull(tickets.deletedAt),
          inArray(tickets.status, [TICKET_STATUSES.OPEN, TICKET_STATUSES.IN_PROGRESS]),
          isNotNull(tickets.dueDate),
          gte(tickets.dueDate, now),
        ),
      )
      .orderBy(asc(tickets.dueDate))
      .limit(10);

    return rows;
  });
