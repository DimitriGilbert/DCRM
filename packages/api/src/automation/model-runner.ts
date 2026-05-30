import { generateStructuredAiHookWithTanStack } from "@DCRM/ai";

import type { AiHookModelRunner, StructuredAiGenerator } from "@DCRM/ai";
import type { SecretCrypto } from "@DCRM/crypto";

import type { AutomationRepository } from "./repository.js";

export type CreateRepositoryAiHookModelRunnerOptions = {
  readonly automationRepository: AutomationRepository;
  readonly secretCrypto: SecretCrypto;
  readonly generateStructured?: StructuredAiGenerator;
};

/** Creates the production model boundary for stored AI hooks and user-owned provider keys. */
export function createRepositoryAiHookModelRunner({
  automationRepository,
  secretCrypto,
  generateStructured = generateStructuredAiHookWithTanStack,
}: CreateRepositoryAiHookModelRunnerOptions): AiHookModelRunner {
  return {
    async generateStructured(request) {
      const provider = await automationRepository.aiProviders.getDecrypted({
        userId: request.userId,
        id: request.providerId,
        crypto: secretCrypto,
      });

      if (!provider || !provider.enabled) {
        throw new Error(`AI provider not found for hook execution: ${request.providerId}`);
      }

      return generateStructured({ provider, request });
    },
  };
}
