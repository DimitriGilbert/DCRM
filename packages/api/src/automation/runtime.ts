import { createBullMqHookExecutionQueue, createHookAwareEventService, createHookExecutionProcessor } from "@DCRM/events/hooks";

import { createStructuredAiHookExecutor } from "./ai-hook-executor.js";
import { createRepositoryAiHookModelRunner } from "./model-runner.js";

import type { SecretCrypto } from "@DCRM/crypto";
import type { EventService } from "@DCRM/events";
import type { HookExecutionQueue, HookExecutionRepository } from "@DCRM/events/hooks";

import type { AutomationRepository } from "./repository.js";
import type { CrmRepository } from "../crm/repository.js";

type ProductionHookExecutionQueue = HookExecutionQueue & { readonly close: () => Promise<void> };

let sharedProductionQueue: { readonly redisUrl: string; readonly queue: ProductionHookExecutionQueue } | undefined;

export type CreateHookAwareAiEventServiceOptions = {
  readonly eventService: EventService;
  readonly automationRepository: AutomationRepository;
  readonly executionRepository: HookExecutionRepository;
  readonly queue: HookExecutionQueue;
  readonly idGenerator?: () => string;
  readonly clock?: () => Date;
};

export type CreateProductionAiHookProcessorOptions = {
  readonly eventService: EventService;
  readonly automationRepository: AutomationRepository;
  readonly executionRepository: HookExecutionRepository;
  readonly crmRepository: CrmRepository;
  readonly secretCrypto: SecretCrypto;
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
};

/** Wraps API/app event emission so stored AI hooks are persisted and queued from the real event context. */
export function createHookAwareAiEventService({
  eventService,
  automationRepository,
  executionRepository,
  queue,
  clock,
  idGenerator,
}: CreateHookAwareAiEventServiceOptions): EventService {
  return createHookAwareEventService({
    eventService,
    hookRepository: automationRepository.hooks,
    executionRepository,
    queue,
    ...(clock ? { clock } : {}),
    ...(idGenerator ? { idGenerator } : {}),
  });
}

/** Creates the production hook job processor that runs structured AI hooks through BYOK providers. */
export function createProductionAiHookProcessor({
  eventService,
  automationRepository,
  executionRepository,
  crmRepository,
  secretCrypto,
  clock,
  idGenerator,
}: CreateProductionAiHookProcessorOptions) {
  return createHookExecutionProcessor({
    eventService,
    hookRepository: automationRepository.hooks,
    executionRepository,
    executor: createStructuredAiHookExecutor({
      automationRepository,
      crmRepository,
      eventService,
      runner: createRepositoryAiHookModelRunner({ automationRepository, secretCrypto }),
      ...(clock ? { clock } : {}),
      ...(idGenerator ? { idGenerator } : {}),
    }),
    ...(clock ? { clock } : {}),
  });
}

export function createProductionHookExecutionQueue(redisUrl: string): ProductionHookExecutionQueue {
  if (sharedProductionQueue?.redisUrl === redisUrl) {
    return sharedProductionQueue.queue;
  }

  const queue = createBullMqHookExecutionQueue({ connection: { url: redisUrl } });
  sharedProductionQueue = { redisUrl, queue };
  return queue;
}
