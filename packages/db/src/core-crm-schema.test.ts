import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getTableColumns, getTableName } from "drizzle-orm";

import {
  attachmentTargetTypeEnum,
  attachments,
  clients,
  coreCrmTables,
  entityTags,
  exchangeParticipants,
  exchangeTypeEnum,
  exchanges,
  leadStageEnum,
  leads,
  projects,
  tags,
  tickets,
  userSettings,
} from "./schema/index.js";

describe("core CRM schema public exports", () => {
  it("exposes user-scoped CRM tables and fixed domain enums through the schema barrel", () => {
    assert.equal(getTableName(clients), "clients");
    assert.equal(getTableName(leads), "leads");
    assert.equal(getTableName(projects), "projects");
    assert.equal(getTableName(tickets), "tickets");
    assert.equal(getTableName(exchanges), "exchanges");
    assert.equal(getTableName(exchangeParticipants), "exchange_participants");
    assert.equal(getTableName(tags), "tags");
    assert.equal(getTableName(entityTags), "entity_tags");
    assert.equal(getTableName(attachments), "attachments");
    assert.equal(getTableName(userSettings), "user_settings");

    const clientColumns = getTableColumns(clients);
    const exchangeColumns = getTableColumns(exchanges);
    const settingsColumns = getTableColumns(userSettings);

    assert.ok(clientColumns.userId);
    assert.ok(clientColumns.createdAt);
    assert.ok(clientColumns.updatedAt);
    assert.ok(clientColumns.deletedAt);
    assert.ok(exchangeColumns.ticketId);
    assert.ok(settingsColumns.userId);

    assert.deepEqual(leadStageEnum.enumValues, ["new", "contacted", "qualified", "proposal", "won", "lost"]);
    assert.deepEqual(exchangeTypeEnum.enumValues, ["email", "note", "call", "meeting", "comment"]);
    assert.deepEqual(attachmentTargetTypeEnum.enumValues, ["client", "lead", "project", "ticket", "exchange"]);
  });

  it("exposes a complete public registry of core CRM tables for schema consumers", () => {
    assert.deepEqual(
      coreCrmTables.map((table) => getTableName(table)),
      [
        "clients",
        "leads",
        "projects",
        "tickets",
        "exchanges",
        "exchange_participants",
        "tags",
        "entity_tags",
        "attachments",
        "user_settings",
      ],
    );
  });
});
