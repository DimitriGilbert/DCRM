import type { DcrmEvent } from "./emitter";

/**
 * Provenance metadata attached to events emitted during hook-driven writes.
 * Tracks the origin of the event to enable loop suppression.
 */
export type ProvenanceMeta = {
  readonly sourceHookExecutionId: string;
  readonly sourceEventId: string;
  readonly emitDownstreamEvents: boolean;
};

/**
 * Current provenance context indicating whether execution is inside
 * a hook-driven write.
 */
export type ProvenanceContext = {
  readonly isActive: boolean;
  readonly meta?: ProvenanceMeta;
};

/**
 * Tracks hook-driven write context. Used to tag events with provenance
 * and enforce loop suppression.
 */
export type ProvenanceTracker = {
  readonly enterHookContext: (meta: ProvenanceMeta) => void;
  readonly exitHookContext: () => void;
  readonly getContext: () => ProvenanceContext;
};

/**
 * Creates a new ProvenanceTracker instance for managing hook-driven
 * write context within a single execution scope.
 */
export function createProvenanceTracker(): ProvenanceTracker {
  let context: ProvenanceContext = { isActive: false };

  return {
    enterHookContext(meta: ProvenanceMeta) {
      context = { isActive: true, meta };
    },
    exitHookContext() {
      context = { isActive: false };
    },
    getContext(): ProvenanceContext {
      return context;
    },
  };
}

/**
 * Determines whether hooks should be dispatched for an event based on
 * its provenance metadata.
 *
 * - Events without provenance (user-initiated) always dispatch hooks.
 * - Hook-driven events only dispatch when emitDownstreamEvents is true.
 */
export function shouldDispatchHooksForEvent(event: DcrmEvent): boolean {
  if (event.provenance === undefined) {
    return true;
  }
  return event.provenance.emitDownstreamEvents;
}
