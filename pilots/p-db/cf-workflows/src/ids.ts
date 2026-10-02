// Stable identifiers for logs, waits and delivery dedup (issue #116).
//
// Every task_events / task_outbox row carries profileId + userTaskId + runId + eventKey, so
// evidence files can be read without guessing which profile/task/attempt a row belongs to.
// PROFILE_ID is deliberately a non-personal sandbox label: these logs are committed to the repo.

export const PROFILE_ID = 'sandbox-pilot';

/** One run == one attempt == one generation (issue #115: a new attempt gets a NEW runId). */
export const runIdFor = (userTaskId: string, generation: number) => `run_${userTaskId}#g${generation}`;

/** Durable wait id. Carries the generation so a stale attempt can never open/consume a newer wait. */
export const waitIdFor = (userTaskId: string, step: string, generation: number) => `${userTaskId}#${step}#g${generation}`;

/**
 * Dedup key of an answer submission. Clients SHOULD pass their own message id as `eventKey`
 * (idempotent retries of the same user message collapse); when absent we derive a stable key from
 * the wait, so a retried submission for the same wait is still accepted exactly once.
 */
export const eventKeyFor = (waitId: string, eventType: string, provided?: string | null) =>
  provided && provided.length > 0 ? provided : `${waitId}#${eventType}`;

/** Context stamped into every log row; never contains credentials or personal files. */
export const logCtx = (userTaskId: string, generation: number, extra: Record<string, unknown> = {}) => ({
  profileId: PROFILE_ID,
  userTaskId,
  runId: runIdFor(userTaskId, generation),
  ...extra,
});