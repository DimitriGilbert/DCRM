import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { clients, exchanges, projects, tickets } from "@DCRM/db/schema/crm";
import { emailAccounts } from "@DCRM/db/schema/automation";
import {
  createEmailCredentialConfig,
  sendPlainEmail,
  createNodemailerTransport,
  buildThreadingHeaders,
  buildTicketSubject,
} from "@DCRM/email";
import { env } from "@DCRM/env/server";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { and, eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { sendExchangeEmailSchema } from "./schemas";

export const sendExchangeEmail = protectedProcedure
  .input(sendExchangeEmailSchema)
  .mutation(async ({ ctx, input }) => {
    // 1. Fetch exchange, scoped to user
    const [exchange] = await db
      .select()
      .from(exchanges)
      .where(
        and(
          eq(exchanges.id, input.exchangeId),
          eq(exchanges.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!exchange) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Exchange not found" });
    }

    // 2. Guard: internal notes can NEVER be sent externally
    if (exchange.isInternal) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Internal notes cannot be emailed externally",
      });
    }

    // 3. Guard: must have body content
    if (!exchange.body || exchange.body.trim().length === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Exchange has no body content to send",
      });
    }

    // 4. Resolve recipient email
    let recipientEmail: string | null = null;
    let ticketTitle: string | null = null;

    if (exchange.ticketId) {
      const [ticket] = await db
        .select({ id: tickets.id, title: tickets.title, projectId: tickets.projectId })
        .from(tickets)
        .where(eq(tickets.id, exchange.ticketId))
        .limit(1);

      if (ticket) {
        ticketTitle = ticket.title;
        const [project] = await db
          .select({ clientId: projects.clientId })
          .from(projects)
          .where(eq(projects.id, ticket.projectId))
          .limit(1);

        if (project) {
          const [client] = await db
            .select({ email: clients.email })
            .from(clients)
            .where(eq(clients.id, project.clientId))
            .limit(1);

          recipientEmail = client?.email ?? null;
        }
      }
    }

    // Fallback to direct client link if ticket resolution failed
    if (!recipientEmail && exchange.clientId) {
      const [client] = await db
        .select({ email: clients.email })
        .from(clients)
        .where(eq(clients.id, exchange.clientId))
        .limit(1);

      recipientEmail = client?.email ?? null;
    }

    if (!recipientEmail) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No recipient email address found",
      });
    }

    // 5. Fetch and decrypt SMTP credentials
    const [account] = await db
      .select()
      .from(emailAccounts)
      .where(
        and(
          eq(emailAccounts.id, input.emailAccountId),
          eq(emailAccounts.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!account) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Email account not found",
      });
    }

    const credentialConfig = createEmailCredentialConfig(env.ENCRYPTION_KEY);
    const smtpCreds = credentialConfig.decryptSmtp({
      encryptedSmtpHost: account.encryptedSmtpHost,
      encryptedSmtpPort: account.encryptedSmtpPort,
      encryptedSmtpUser: account.encryptedSmtpUser,
      encryptedSmtpPassword: account.encryptedSmtpPassword,
    });

    // 6. Build threading headers from previous exchanges on the ticket
    let inReplyTo: string | undefined;
    let references: string | undefined;

    if (exchange.ticketId) {
      const previousExchanges = await db
        .select({
          id: exchanges.id,
          ticketId: exchanges.ticketId,
          metadata: exchanges.metadata,
          createdAt: exchanges.createdAt,
        })
        .from(exchanges)
        .where(eq(exchanges.ticketId, exchange.ticketId));

      const threading = buildThreadingHeaders(previousExchanges);
      inReplyTo = threading.inReplyTo ?? undefined;
      references = threading.references ?? undefined;
    }

    // 7. Build subject
    const isReply = inReplyTo !== undefined;
    const subject = ticketTitle
      ? buildTicketSubject(ticketTitle, isReply)
      : (exchange.subject ?? "(No subject)");

    // 8. Send email
    const transport = await createNodemailerTransport(smtpCreds);
    const result = await sendPlainEmail(transport, account.email, {
      to: recipientEmail,
      subject,
      body: exchange.body,
      inReplyTo,
      references,
    });

    // 9. Update exchange metadata with email-sent info
    const updatedMetadata = {
      ...(exchange.metadata ?? {}),
      messageId: result.messageId,
      emailSentAt: result.sentAt.toISOString(),
      emailAccountId: account.id,
      emailedTo: recipientEmail,
      emailedFrom: account.email,
    };

    await db
      .update(exchanges)
      .set({
        metadata: updatedMetadata,
        direction: "outgoing",
        updatedAt: new Date(),
      })
      .where(eq(exchanges.id, exchange.id));

    // 10. Emit email.sent event
    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.EMAIL_SENT,
        userId: ctx.user.id,
        source: "email",
        entity: { type: "exchange", id: exchange.id },
        payload: {
          exchangeId: exchange.id,
          ticketId: exchange.ticketId,
          clientId: exchange.clientId,
          to: recipientEmail,
          from: account.email,
          subject,
          messageId: result.messageId,
        },
      },
    );

    return {
      success: true,
      messageId: result.messageId,
      sentAt: result.sentAt,
    };
  });
