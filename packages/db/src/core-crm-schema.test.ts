import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  attachmentTargetTypeEnum,
  clientAuthorizedEmails,
  attachments,
  clients,
  coreCrmTables,
  entityTags,
  exchangeParticipants,
  exchangeTypeEnum,
  exchanges,
  leadStageEnum,
  leads,
  notifications,
  projects,
  tags,
  tickets,
  userSettings,
} from "./schema/index.js";

describe("core CRM schema public exports", () => {
  it("exposes user-scoped CRM tables and fixed domain enums through the schema barrel", () => {
    assert.equal(getTableName(clients), "clients");
    assert.equal(getTableName(clientAuthorizedEmails), "client_authorized_emails");
    assert.equal(getTableName(leads), "leads");
    assert.equal(getTableName(projects), "projects");
    assert.equal(getTableName(tickets), "tickets");
    assert.equal(getTableName(exchanges), "exchanges");
    assert.equal(getTableName(exchangeParticipants), "exchange_participants");
    assert.equal(getTableName(tags), "tags");
    assert.equal(getTableName(entityTags), "entity_tags");
    assert.equal(getTableName(attachments), "attachments");
    assert.equal(getTableName(userSettings), "user_settings");
    assert.equal(getTableName(notifications), "notifications");

    const clientColumns = getTableColumns(clients);
    const exchangeColumns = getTableColumns(exchanges);
    const settingsColumns = getTableColumns(userSettings);
    const notificationColumns = getTableColumns(notifications);

    assert.ok(clientColumns.userId);
    assert.ok(clientColumns.createdAt);
    assert.ok(clientColumns.updatedAt);
    assert.ok(clientColumns.deletedAt);
    assert.ok(exchangeColumns.ticketId);
    assert.ok(exchangeColumns.syncedEmailAccountId);
    assert.ok(exchangeColumns.syncedEmailMailbox);
    assert.ok(exchangeColumns.syncedEmailUid);
    assert.ok(settingsColumns.userId);
    assert.ok(notificationColumns.userId);
    assert.ok(notificationColumns.readAt);
    assert.ok(notificationColumns.entityId);

    assert.deepEqual(leadStageEnum.enumValues, ["new", "contacted", "qualified", "proposal", "won", "lost"]);
    assert.deepEqual(exchangeTypeEnum.enumValues, ["email", "note", "call", "meeting", "comment"]);
    assert.deepEqual(attachmentTargetTypeEnum.enumValues, ["client", "lead", "project", "ticket", "exchange"]);
  });

  it("exposes a complete public registry of core CRM tables for schema consumers", () => {
    assert.deepEqual(
      coreCrmTables.map((table) => getTableName(table)),
      [
        "clients",
        "client_authorized_emails",
        "leads",
        "projects",
        "tickets",
        "exchanges",
        "exchange_participants",
        "tags",
        "entity_tags",
        "attachments",
        "user_settings",
        "notifications",
      ],
    );
  });

  it("enforces a database-level identity for synced email exchanges", () => {
    const exchangeConfig = getTableConfig(exchanges);
    const syncedEmailIdentity = exchangeConfig.indexes.find((indexDefinition) => indexDefinition.config.name === "exchanges_synced_email_identity_idx");

    assert.ok(syncedEmailIdentity);
    assert.equal(syncedEmailIdentity.config.unique, true);
    assert.deepEqual(syncedEmailIdentity.config.columns.map(columnName), ["user_id", "synced_email_account_id", "synced_email_mailbox", "synced_email_uid"]);
  });

  it("declares user-owned foreign keys for CRM parent references", () => {
    const projectForeignKeys = getTableConfig(projects).foreignKeys.map(foreignKeyName);
    const ticketForeignKeys = getTableConfig(tickets).foreignKeys.map(foreignKeyName);
    const exchangeForeignKeys = getTableConfig(exchanges).foreignKeys.map(foreignKeyName);
    const exchangeParticipantForeignKeys = getTableConfig(exchangeParticipants).foreignKeys.map(foreignKeyName);
    const leadForeignKeys = getTableConfig(leads).foreignKeys.map(foreignKeyName);

    assert.ok(getTableConfig(clients).indexes.some((indexDefinition) => indexDefinition.config.name === "clients_user_id_id_idx" && indexDefinition.config.unique));
    assert.ok(getTableConfig(exchanges).indexes.some((indexDefinition) => indexDefinition.config.name === "exchanges_user_id_id_idx" && indexDefinition.config.unique));
    assert.ok(leadForeignKeys.includes("leads_user_converted_client_fk"));
    assert.ok(projectForeignKeys.includes("projects_user_client_fk"));
    assert.ok(ticketForeignKeys.includes("tickets_user_project_fk"));
    assert.ok(exchangeForeignKeys.includes("exchanges_user_client_fk"));
    assert.ok(exchangeForeignKeys.includes("exchanges_user_project_fk"));
    assert.ok(exchangeForeignKeys.includes("exchanges_user_ticket_fk"));
    assert.ok(exchangeForeignKeys.includes("exchanges_user_synced_email_account_fk"));
    assert.ok(exchangeParticipantForeignKeys.includes("exchange_participants_user_exchange_fk"));
  });
});

function columnName(column: object): string {
  if ("name" in column && typeof column.name === "string") {
    return column.name;
  }
  return "";
}

function foreignKeyName(foreignKey: object): string {
  if ("getName" in foreignKey && typeof foreignKey.getName === "function") {
    return foreignKey.getName();
  }
  if ("name" in foreignKey && typeof foreignKey.name === "string") {
    return foreignKey.name;
  }
  return "";
}
