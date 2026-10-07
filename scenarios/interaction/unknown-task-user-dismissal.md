# TG-14 — User dismisses an unresolved task

Status: **scenario change in review**. This supplements TG-06b in [Telegram first-release acceptance](telegram-first-release-acceptance.md): independent work may proceed while the old task remains `unknown`; this scenario adds a user-controlled way to stop waiting for that old task in the active conversation.

Related change issue: [trained-agent-architecture#204](https://github.com/trained-assist/trained-agent-architecture/issues/204). Telegram implementation: [trained-assist-tg-bot#414](https://github.com/trained-assist/trained-assist-tg-bot/issues/414). Definitive Runner rejection/no-admission reconciliation is tracked separately in [trained-assist-control-plane#105](https://github.com/trained-assist/trained-assist-control-plane/issues/105).

## Actor and precondition

A Telegram user has task A whose admission, execution, or stop outcome is `unknown`. Exact task/run/generation identity is retained, and there is no authoritative terminal Runner evidence. The user has a separate draft B or wants to send independent work.

## Scenario

1. The bot tells the user that task A's outcome is unknown and that it may still be executing.
2. The user chooses an explicit task-scoped action to stop waiting for A in this conversation.
3. The bot confirms that A was detached from the active conversation. It does not claim that A was stopped or cancelled.
4. The user may explicitly submit independent task B. B receives its own request/task/run identity and is admitted exactly once without an implicit dependency on A.

## State and safety invariants

- A remains `unknown` and reconciliation-only. Dismissal does not create `stopped`, `cancelled`, or native-exit evidence; it cannot retry or continue A.
- The dismissal records an explicit user decision against A's exact `userTaskId`, `runId` (when known), generation, and stop/admission window. It releases only A's conversation-level hold.
- Any buffered B input is preserved in order and exactly once. B is not auto-launched by dismissal; it needs the user's explicit launch action.
- A's later status/result remains attached to A's task identity. It cannot overwrite B's status or be delivered as B's result. A stale or duplicate dismissal callback cannot affect B or another chat/thread.
- Reconciliation may update A when authoritative evidence arrives, but it never reverses the user's decision to avoid retrying or continuing A.

## Failure cases

- If the callback is stale, duplicated, or names a different task/window, acknowledge that it is no longer current and make no state change.
- If the user asks to stop the remote process, use the normal task-scoped stop flow. Dismissing A from the conversation is not a substitute for stop confirmation.
- If the service cannot durably record the dismissal, keep the hold and tell the user the decision was not saved; do not imply success.

## Acceptance

- Deterministic intake/Task Store fixture: unknown A → user dismisses A → exact dismissal persists across restart → explicit B admission succeeds once; A remains `unknown` and has no retry/continuation.
- Verify stale/duplicate and cross-chat callbacks have zero side effects.
- Deliver a late terminal event for A after B admission and prove it updates only A; B's state and user-visible result remain unchanged.
- Telegram sandbox E2E records Worker/CP/Runner revisions, A/B identities, event sequence, user-visible confirmation, and no duplicate admission. This is not staging acceptance unless the declared staging environment is used.

## Cross-repository ownership

- Architecture owns this target scenario and acceptance evidence.
- `trained-assist-tg-bot#414` owns Telegram controls, durable dismissal receipt, and delivery UX.
- Control Plane owns truthful task status and exact task/attempt reconciliation. Existing `#105` covers definitive Runner rejection; ambiguous transport/dispatch outcomes must remain `unknown`.
