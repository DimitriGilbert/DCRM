import { TRPCError } from "@trpc/server";

import type { RequestAuth } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";
import type { EntityTagInput } from "../../crm/types.js";

type AuthenticatedCrmContext = {
  readonly auth: RequestAuth;
  readonly crmRepository: CrmRepository;
};

export function tagNotFound(): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message: "Tag not found." });
}

export async function assertEntityCanBeTagged(ctx: AuthenticatedCrmContext, input: Omit<EntityTagInput, "userId">) {
  if (input.entityType === "client") {
    const client = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: input.entityId });
    if (client && !client.deletedAt) {
      return;
    }
  }
  if (input.entityType === "project") {
    const project = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.entityId });
    if (project && !project.deletedAt) {
      return;
    }
  }
  throw new TRPCError({ code: "NOT_FOUND", message: "Taggable entity not found." });
}
