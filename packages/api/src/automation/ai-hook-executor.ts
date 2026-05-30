import { executeStructuredAiHook } from "@DCRM/ai";
import { emitHookWriteEvent } from "@DCRM/events/hooks";
import { z } from "zod";

import type { AiFieldWriter, AiHookExecutionContext, AiHookModelRunner, ApplyAiFieldChangesInput, JsonObject, JsonValue, StoreAiInsightInput } from "@DCRM/ai";
import type { CoreEventType, EventEntityReference, EventService } from "@DCRM/events";
import type { HookExecutionContext, HookExecutor, HookDownstreamEventPolicy } from "@DCRM/events/hooks";

import type { AutomationRepository } from "./repository.js";
import type { CrmRepository } from "../crm/repository.js";

export type CreateStructuredAiHookExecutorOptions = {
  readonly automationRepository: AutomationRepository;
  readonly crmRepository: CrmRepository;
  readonly eventService: EventService;
  readonly runner: AiHookModelRunner;
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
};

const clientUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

const leadUpdateSchema = clientUpdateSchema.extend({
  source: z.string().nullable().optional(),
  estimatedValueAmount: z.string().nullable().optional(),
  estimatedValueCurrency: z.string().nullable().optional(),
});

const projectUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    budgetAmount: z.string().nullable().optional(),
    budgetCurrency: z.string().nullable().optional(),
    estimatedHours: z.string().nullable().optional(),
    actualHours: z.string().nullable().optional(),
  })
  .strict();

const ticketUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
  })
  .strict();

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), jsonValueSchema);

/** Creates the hook runtime executor for stored structured AI hook subscriptions. */
export function createStructuredAiHookExecutor({
  automationRepository,
  crmRepository,
  eventService,
  runner,
  clock = () => new Date(),
  idGenerator = () => crypto.randomUUID(),
}: CreateStructuredAiHookExecutorOptions): HookExecutor {
  return {
    async execute(context) {
      if (context.hook.type !== "ai") {
        return { skipped: true, reason: "unsupported_hook_type" };
      }
      if (context.hook.userId !== context.event.userId) {
        throw new Error("AI hook execution user mismatch.");
      }

      const result = await executeStructuredAiHook({
        context: toAiHookExecutionContext(context),
        runner,
        insights: createRepositoryInsightStore(automationRepository, clock),
        fieldWriter: createCrmFieldWriter({ crmRepository, eventService, context, clock }),
        clock,
        idGenerator,
      });

      return {
        insightId: result.insightId,
        writeBehavior: result.writeBehavior,
        proposedChanges: result.proposedChanges,
        ...(result.appliedChanges ? { appliedChanges: result.appliedChanges } : {}),
      };
    },
  };
}

function createRepositoryInsightStore(automationRepository: AutomationRepository, clock: () => Date) {
  return {
    async create(input: StoreAiInsightInput) {
      await automationRepository.aiInsights.create({
        id: input.id,
        userId: input.userId,
        providerId: input.providerId,
        hookExecutionId: input.hookExecutionId,
        entityType: input.entity?.type ?? null,
        entityId: input.entity?.id ?? null,
        title: input.title,
        content: input.content,
        structuredOutput: input.structuredOutput,
        metadata: input.metadata,
        now: clock(),
      });
    },
  };
}

function createCrmFieldWriter(input: {
  readonly crmRepository: CrmRepository;
  readonly eventService: EventService;
  readonly context: HookExecutionContext;
  readonly clock: () => Date;
}): AiFieldWriter {
  return {
    async apply(changesInput) {
      const appliedChanges = await applyCrmChanges({ ...input, changesInput });
      await emitHookWriteEvent({
        eventService: input.eventService,
        context: input.context,
        event: {
          type: updatedEventTypeForEntity(changesInput.entity.type),
          userId: changesInput.userId,
          entity: toEventEntityReference(changesInput.entity),
          payload: { appliedChanges, ai: { hookId: changesInput.provenance.hookId, hookExecutionId: changesInput.provenance.hookExecutionId } },
          changes: { after: appliedChanges },
        },
        downstreamEventPolicy: toHookDownstreamEventPolicy(changesInput.downstreamEventBehavior),
      });
      return appliedChanges;
    },
  };
}

async function applyCrmChanges(input: {
  readonly crmRepository: CrmRepository;
  readonly clock: () => Date;
  readonly changesInput: ApplyAiFieldChangesInput;
}): Promise<JsonObject> {
  const { crmRepository, clock, changesInput } = input;
  const now = clock();
  switch (changesInput.entity.type) {
    case "client": {
      const fields = clientUpdateSchema.parse(changesInput.changes);
      const updated = await crmRepository.clients.update({ userId: changesInput.userId, id: changesInput.entity.id, fields, now });
      if (!updated) {
        throw new Error(`Client not found for AI field write: ${changesInput.entity.id}`);
      }
      return fields;
    }
    case "lead": {
      const fields = leadUpdateSchema.parse(changesInput.changes);
      const updated = await crmRepository.leads.update({ userId: changesInput.userId, id: changesInput.entity.id, fields, now });
      if (!updated) {
        throw new Error(`Lead not found for AI field write: ${changesInput.entity.id}`);
      }
      return fields;
    }
    case "project": {
      const fields = projectUpdateSchema.parse(changesInput.changes);
      const updated = await crmRepository.projects.update({ userId: changesInput.userId, id: changesInput.entity.id, fields, now });
      if (!updated) {
        throw new Error(`Project not found for AI field write: ${changesInput.entity.id}`);
      }
      return fields;
    }
    case "ticket": {
      const fields = ticketUpdateSchema.parse(changesInput.changes);
      const updated = await crmRepository.tickets.update({ userId: changesInput.userId, id: changesInput.entity.id, fields, now });
      if (!updated) {
        throw new Error(`Ticket not found for AI field write: ${changesInput.entity.id}`);
      }
      return fields;
    }
    default:
      throw new Error(`AI direct field writes are not supported for entity type: ${changesInput.entity.type}`);
  }
}

function toAiHookExecutionContext(context: HookExecutionContext): AiHookExecutionContext {
  return {
    event: {
      id: context.event.id,
      type: context.event.type,
      userId: context.event.userId,
      source: context.event.source,
      ...(context.event.entity ? { entity: context.event.entity } : {}),
      payload: toAiJsonObject(context.event.payload),
      ...(context.event.changes ? { changes: toAiJsonObject(context.event.changes) } : {}),
      createdAt: context.event.createdAt,
    },
    hook: {
      id: context.hook.id,
      userId: context.hook.userId,
      name: context.hook.name,
      config: toAiJsonObject(context.hook.config),
    },
    execution: {
      id: context.execution.id,
    },
  };
}

function toHookDownstreamEventPolicy(value: ApplyAiFieldChangesInput["downstreamEventBehavior"]): HookDownstreamEventPolicy {
  return value === "emit" ? "emit_hooks" : "suppress_hooks";
}

function updatedEventTypeForEntity(entityType: ApplyAiFieldChangesInput["entity"]["type"]): CoreEventType {
  switch (entityType) {
    case "client":
      return "client.updated";
    case "lead":
      return "lead.updated";
    case "project":
      return "project.updated";
    case "ticket":
      return "ticket.updated";
    default:
      throw new Error(`AI direct field write events are not supported for entity type: ${entityType}`);
  }
}

function toEventEntityReference(entity: ApplyAiFieldChangesInput["entity"]): EventEntityReference {
  switch (entity.type) {
    case "client":
    case "lead":
    case "project":
    case "ticket":
      return { type: entity.type, id: entity.id };
    default:
      throw new Error(`AI direct field write entities are not supported for entity type: ${entity.type}`);
  }
}

function toAiJsonObject(value: unknown): JsonObject {
  return jsonObjectSchema.parse(value);
}
