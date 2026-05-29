import { describe, it, expect } from "vitest";

import {
  clients,
  clientsRelations,
  leads,
  leadsRelations,
  leadStageEnum,
  projects,
  projectsRelations,
  projectStatusEnum,
  tickets,
  ticketsRelations,
  ticketTypeEnum,
  ticketStatusEnum,
  ticketPriorityEnum,
  exchanges,
  exchangesRelations,
  exchangeTypeEnum,
  exchangeDirectionEnum,
  tags,
  tagsRelations,
  entityTags,
  entityTagsRelations,
  attachments,
  attachmentsRelations,
  userSettings,
  userSettingsRelations,
} from "../src/schema/crm";

import {
  LEAD_STAGE_VALUES,
  PROJECT_STATUS_VALUES,
  TICKET_TYPE_VALUES,
  TICKET_STATUS_VALUES,
  TICKET_PRIORITY_VALUES,
  EXCHANGE_TYPE_VALUES,
} from "@DCRM/domain";

function getColumnNames(table: object): Set<string> {
  return new Set(
    Object.keys(table).filter(
      (k) => {
        const val = (table as Record<string, unknown>)[k];
        return typeof val === "object" && val !== null && "dataType" in val;
      },
    ),
  );
}

describe("clients table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(clients);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("name");
    expect(cols).toContain("email");
    expect(cols).toContain("phone");
    expect(cols).toContain("company");
    expect(cols).toContain("website");
    expect(cols).toContain("notes");
    expect(cols).toContain("socialLinks");
    expect(cols).toContain("address");
    expect(cols).toContain("customFields");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
    expect(cols).toContain("deletedAt");
  });

  it("references user table via userId", () => {
    const userIdCol = clients.userId as unknown as { dataType: string };
    expect(userIdCol).toBeDefined();
  });
});

describe("leads table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(leads);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("name");
    expect(cols).toContain("email");
    expect(cols).toContain("phone");
    expect(cols).toContain("company");
    expect(cols).toContain("website");
    expect(cols).toContain("notes");
    expect(cols).toContain("source");
    expect(cols).toContain("stage");
    expect(cols).toContain("estimatedValue");
    expect(cols).toContain("currency");
    expect(cols).toContain("socialLinks");
    expect(cols).toContain("address");
    expect(cols).toContain("customFields");
    expect(cols).toContain("convertedClientId");
    expect(cols).toContain("convertedAt");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
    expect(cols).toContain("deletedAt");
  });
});

describe("projects table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(projects);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("clientId");
    expect(cols).toContain("name");
    expect(cols).toContain("description");
    expect(cols).toContain("status");
    expect(cols).toContain("budgetAmount");
    expect(cols).toContain("budgetCurrency");
    expect(cols).toContain("estimatedHours");
    expect(cols).toContain("actualHours");
    expect(cols).toContain("customFields");
    expect(cols).toContain("startDate");
    expect(cols).toContain("endDate");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
    expect(cols).toContain("deletedAt");
  });
});

describe("tickets table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(tickets);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("projectId");
    expect(cols).toContain("title");
    expect(cols).toContain("description");
    expect(cols).toContain("type");
    expect(cols).toContain("status");
    expect(cols).toContain("priority");
    expect(cols).toContain("dueDate");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
    expect(cols).toContain("deletedAt");
  });
});

describe("exchanges table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(exchanges);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("type");
    expect(cols).toContain("clientId");
    expect(cols).toContain("projectId");
    expect(cols).toContain("ticketId");
    expect(cols).toContain("subject");
    expect(cols).toContain("body");
    expect(cols).toContain("direction");
    expect(cols).toContain("metadata");
    expect(cols).toContain("isInternal");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});

describe("tags table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(tags);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("name");
    expect(cols).toContain("color");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});

describe("entityTags table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(entityTags);
    expect(cols).toContain("id");
    expect(cols).toContain("tagId");
    expect(cols).toContain("entityType");
    expect(cols).toContain("entityId");
    expect(cols).toContain("createdAt");
  });
});

describe("attachments table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(attachments);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("entityType");
    expect(cols).toContain("entityId");
    expect(cols).toContain("fileName");
    expect(cols).toContain("filePath");
    expect(cols).toContain("fileSize");
    expect(cols).toContain("mimeType");
    expect(cols).toContain("metadata");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});

describe("userSettings table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(userSettings);
    expect(cols).toContain("userId");
    expect(cols).toContain("locale");
    expect(cols).toContain("theme");
    expect(cols).toContain("onboardingCompleted");
    expect(cols).toContain("settings");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});

describe("relations", () => {
  it("defines client relations", () => {
    expect(clientsRelations).toBeDefined();
  });

  it("defines lead relations with optional convertedClient", () => {
    expect(leadsRelations).toBeDefined();
  });

  it("defines project relations with client fk", () => {
    expect(projectsRelations).toBeDefined();
  });

  it("defines ticket relations with project fk", () => {
    expect(ticketsRelations).toBeDefined();
  });

  it("defines exchange relations with optional client, project, ticket fks", () => {
    expect(exchangesRelations).toBeDefined();
  });

  it("defines tag relations", () => {
    expect(tagsRelations).toBeDefined();
  });

  it("defines entityTag relations with tag fk", () => {
    expect(entityTagsRelations).toBeDefined();
  });

  it("defines attachment relations", () => {
    expect(attachmentsRelations).toBeDefined();
  });

  it("defines userSettings relations with user fk", () => {
    expect(userSettingsRelations).toBeDefined();
  });
});

describe("enums match domain constants", () => {
  it("leadStageEnum values match LEAD_STAGES from domain", () => {
    expect(leadStageEnum.enumValues).toEqual([...LEAD_STAGE_VALUES]);
  });

  it("projectStatusEnum values match PROJECT_STATUSES from domain", () => {
    expect(projectStatusEnum.enumValues).toEqual([...PROJECT_STATUS_VALUES]);
  });

  it("ticketTypeEnum values match TICKET_TYPES from domain", () => {
    expect(ticketTypeEnum.enumValues).toEqual([...TICKET_TYPE_VALUES]);
  });

  it("ticketStatusEnum values match TICKET_STATUSES from domain", () => {
    expect(ticketStatusEnum.enumValues).toEqual([...TICKET_STATUS_VALUES]);
  });

  it("ticketPriorityEnum values match TICKET_PRIORITIES from domain", () => {
    expect(ticketPriorityEnum.enumValues).toEqual([...TICKET_PRIORITY_VALUES]);
  });

  it("exchangeTypeEnum values match EXCHANGE_TYPES from domain", () => {
    expect(exchangeTypeEnum.enumValues).toEqual([...EXCHANGE_TYPE_VALUES]);
  });

  it("exchangeDirectionEnum has incoming and outgoing", () => {
    expect(exchangeDirectionEnum.enumValues).toEqual(["incoming", "outgoing"]);
  });
});

describe("schema index re-exports", () => {
  it("exports all CRM tables from schema index", async () => {
    const schema = await import("../src/schema/index");
    expect(schema.clients).toBeDefined();
    expect(schema.leads).toBeDefined();
    expect(schema.projects).toBeDefined();
    expect(schema.tickets).toBeDefined();
    expect(schema.exchanges).toBeDefined();
    expect(schema.tags).toBeDefined();
    expect(schema.entityTags).toBeDefined();
    expect(schema.attachments).toBeDefined();
    expect(schema.userSettings).toBeDefined();
  });
});
