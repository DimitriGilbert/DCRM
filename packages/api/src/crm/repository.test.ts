import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInMemoryCrmRepository } from "./repository.js";

describe("in-memory CRM repository ownership validation", () => {
  it("rejects exchange provenance for nonexistent synced email accounts", async () => {
    const repository = createInMemoryCrmRepository();

    await assert.rejects(
      repository.exchanges.create({
        id: "exchange_1",
        userId: "user_1",
        fields: { type: "email", body: "Inbound", syncedEmailAccountId: "email_account_missing" },
        now: new Date("2026-01-01T00:00:00.000Z"),
      }),
      /Email account not found\./,
    );
  });

  it("rejects exchange provenance for another user's synced email account", async () => {
    const repository = createInMemoryCrmRepository({
      isActiveEmailAccount(input) {
        return input.userId === "user_2" && input.emailAccountId === "email_account_1";
      },
    });

    await assert.rejects(
      repository.exchanges.create({
        id: "exchange_1",
        userId: "user_1",
        fields: { type: "email", body: "Inbound", syncedEmailAccountId: "email_account_1" },
        now: new Date("2026-01-01T00:00:00.000Z"),
      }),
      /Email account not found\./,
    );
  });

  it("accepts exchange provenance for the owning active synced email account", async () => {
    const repository = createInMemoryCrmRepository({
      isActiveEmailAccount(input) {
        return input.userId === "user_1" && input.emailAccountId === "email_account_1";
      },
    });

    const exchange = await repository.exchanges.create({
      id: "exchange_1",
      userId: "user_1",
      fields: { type: "email", body: "Inbound", syncedEmailAccountId: "email_account_1" },
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    assert.equal(exchange.syncedEmailAccountId, "email_account_1");
  });

  it("rejects exchange provenance updates to nonexistent or cross-user synced email accounts", async () => {
    const repository = createInMemoryCrmRepository({
      isActiveEmailAccount(input) {
        return input.userId === "user_2" && input.emailAccountId === "email_account_2";
      },
    });
    await repository.exchanges.create({
      id: "exchange_1",
      userId: "user_1",
      fields: { type: "email", body: "Inbound" },
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    await assert.rejects(
      repository.exchanges.update({
        id: "exchange_1",
        userId: "user_1",
        fields: { syncedEmailAccountId: "email_account_missing" },
        now: new Date("2026-01-01T00:01:00.000Z"),
      }),
      /Email account not found\./,
    );
    await assert.rejects(
      repository.exchanges.update({
        id: "exchange_1",
        userId: "user_1",
        fields: { syncedEmailAccountId: "email_account_2" },
        now: new Date("2026-01-01T00:02:00.000Z"),
      }),
      /Email account not found\./,
    );
  });

  it("rejects ticket project moves when an active dependent exchange exists", async () => {
    const repository = createInMemoryCrmRepository();
    const now = new Date("2026-01-01T00:00:00.000Z");
    await repository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Ada Lovelace" }, now });
    await repository.clients.create({ id: "client_2", userId: "user_1", fields: { name: "Charles Babbage" }, now });
    await repository.projects.create({ id: "project_1", userId: "user_1", fields: { clientId: "client_1", name: "Website rebuild" }, now });
    await repository.projects.create({ id: "project_2", userId: "user_1", fields: { clientId: "client_2", name: "Research" }, now });
    await repository.tickets.create({ id: "ticket_1", userId: "user_1", fields: { projectId: "project_1", title: "Fix contact form" }, now });
    await repository.exchanges.create({ id: "exchange_1", userId: "user_1", fields: { ticketId: "ticket_1", type: "comment", body: "I reproduced this on mobile." }, now });

    await assert.rejects(
      repository.tickets.update({ id: "ticket_1", userId: "user_1", fields: { projectId: "project_2" }, now: new Date("2026-01-01T00:01:00.000Z") }),
      /Ticket project cannot be changed/,
    );
    assert.equal((await repository.tickets.getById({ userId: "user_1", id: "ticket_1" }))?.projectId, "project_1");
  });

  it("does not delete tickets hidden by an inactive project parent", async () => {
    const repository = createInMemoryCrmRepository();
    const now = new Date("2026-01-01T00:00:00.000Z");
    await repository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Ada Lovelace" }, now });
    await repository.projects.create({ id: "project_1", userId: "user_1", fields: { clientId: "client_1", name: "Website rebuild" }, now });
    await repository.tickets.create({ id: "ticket_1", userId: "user_1", fields: { projectId: "project_1", title: "Fix contact form" }, now });
    await repository.projects.setDeletedAt({ id: "project_1", userId: "user_1", deletedAt: now, now });

    const deleted = await repository.tickets.setDeletedAt({ id: "ticket_1", userId: "user_1", deletedAt: new Date("2026-01-01T00:01:00.000Z"), now: new Date("2026-01-01T00:01:00.000Z") });

    assert.equal(deleted, undefined);
    assert.equal((await repository.tickets.getById({ userId: "user_1", id: "ticket_1" }))?.deletedAt, null);
  });
});
