# Reproducible sandbox bootstrap and reachability

- **Scenario ID:** SC-OPS-SANDBOX-BOOTSTRAP
- **Status:** target; implementation gaps remain
- **Issue:** [#231](https://github.com/trained-assist/trained-agent-architecture/issues/231)
- **Related:** deployment coverage [#220](https://github.com/trained-assist/trained-agent-architecture/issues/220), Telegram E2E/recovery [#190](https://github.com/trained-assist/trained-agent-architecture/issues/190), authenticated mock-test [#229](https://github.com/trained-assist/trained-agent-architecture/issues/229)
- **Actors:** test operator, sandbox bootstrap workflow, Control Plane, Runner API, execution Worker, MCP Host, acceptance agent
- **Boundary:** a declared non-production lane goes from unprepared to ready for a specific acceptance scenario, with paired test identity, verified bindings, reconciled state, and traceable evidence.
- **Scope:** test-only identities, credentials, state, routes and resources. Production targets and credentials are rejected.
- **Review handoff:** [implementation map, evidence, credentials and blockers](../../docs/reviews/SANDBOX-BOOTSTRAP-REVIEW-HANDOFF-2026-10-09.md); [2026-10-10 CP Telegram UX quick-answer and France-worker follow-up](../../docs/reviews/CP-TELEGRAM-UX-AGENT-SANDBOX-2026-10-10.md)

## Preconditions

1. Each owning repository declares an Environment Contract for its target and identifies the owner, storage name, acquisition/rotation path, expected endpoint, and safe probe for each required binding.
2. The lane names its Telegram test bot/account if Telegram ingress is in scope, CP Worker and state resources, Runner API and configured execution Worker, and required MCP Hosts. Health endpoints alone do not establish readiness.
3. External credentials that cannot be minted by the system (Cloudflare deploy authority, SSH access, Telegram bot identity, model/provider keys) have been issued for sandbox and are kept in their owning secret stores. No production secret is used as fallback.
4. The bootstrap workflow has narrowly scoped authority to provision the Runner test principal and update only the matching sandbox CP Worker secret. Otherwise it reports the missing authority and stops before partial provisioning.

## Main flow

1. Operator selects a named lane, acceptance scenario and pinned component revisions. Bootstrap verifies target names/accounts against the declared allowlist and records the starting identities.
2. Bootstrap inventories previous CP tasks/workflows, Runner admissions/Workers and ingress collector state by stable task/run/update IDs. It reconciles authoritative terminal outcomes. Accepted, unknown, active, uninspectable or contradictory state blocks reuse; it does not blindly replay, delete, or clear shared state. A separately isolated fresh lane may be provisioned if the contract allows it.
3. Bootstrap creates or rotates a synthetic Runner API principal/key with minimum profile, scope and engine permissions. It writes the key hash to Runner's private registry and the raw key only to the exact owning CP Worker secret. Updates are idempotent. During rotation, the old principal remains valid until the new key authenticates and passes the CP→Runner probe; then the old key is revoked.
4. Bootstrap checks each required external binding by name and owner, then probes the actual boundary independently: Telegram test ingress→CP when required; CP→Runner using authenticated `mock-test`; Runner→configured Worker with its scoped credential; Runner→required MCP Host using read-only discovery. A real free-only Agent/model probe is a separate acceptance scenario.
5. The sandbox is reported `READY` only when every required probe for the selected scenario passes and prior state is reconciled or isolated from this lane. Otherwise it is `BLOCKED` with a safe reason code, boundary, missing binding name/owner, and next recovery action.
6. Bootstrap emits a sanitized evidence artifact containing scenario/source revisions, account/resource/service identities, secret names and optional provider version refs, principal ID/scopes/profile/engine policy, per-boundary status and timings, prior-state reconciliation decisions, TTL/cleanup and rollback handles. It contains no raw credential, password, private key, token, or user payload.
7. Reset/cleanup operates only on resources uniquely owned by this disposable lane after all accepted work is terminal or reconciled and required evidence is retained. Shared D1, Workflows, admission journals and Telegram collector state are never cleared as a generic reset.

## Failure and recovery

- A target identity that is production, ambiguous, or outside the allowlist fails before credential/resource mutation.
- Missing external credentials are not fabricated. Report the exact binding name, owner and acquisition path without exposing its value.
- Partial secret synchronization leaves both old/new credentials valid where possible, reports the exact completed side, and provides a retry/rollback path. It must not report ready until both verifier and consumer agree.
- A failed auth/reachability probe reports the first failing boundary separately from liveness and downstream checks. Do not infer reachability from a configured URL or secret name.
- Unknown/nonterminal task state blocks lane reuse; reconcile by stable IDs or allocate a separately isolated lane. Do not use a reset to hide an unknown side effect.
- Expired or rotated credentials produce a binding-specific failure and a documented rotation operation; no silent production fallback is permitted.
- Cleanup and rollback are scoped to the lane ID. A retry is idempotent and preserves evidence from the previous attempt.

## Acceptance assertions

- Generated sandbox credentials are scoped, paired between CP and Runner, stored only in owning secret stores, absent from logs/artifacts/chat, and verified with both allowed and denied authentication probes.
- Each selected service boundary has its own authenticated/semantic probe; a generic `/health` result cannot mark the lane ready.
- The selected Telegram test message (when in scope) is correlated through gateway, CP task, Runner run and terminal delivery; the first acceptance can terminate at `mock-test`/`pong` without a model call.
- Worker and MCP probes use only the fixture/test credentials and declared read-only operations; a real Agent/model acceptance is reported separately.
- Prior state is reconciled by IDs or isolated from the new lane. Unknown and active state is visible and cannot be reported as reset.
- A sanitized evidence artifact is sufficient for another operator to identify deployed revisions, missing boundary, credential destinations by name, and safe next action without accessing secret values.
- Repeating bootstrap is idempotent. Rotation is verified before old key revocation. Failed bootstrap has a bounded rollback and is reported `BLOCKED`.
- Cleanup removes only lane-owned synthetic principals/data/resources after runs are terminal and evidence is retained. Production routes, profiles, stores and credentials remain unchanged.

## Implementation ownership

- Runner owns test principal validation, key-hash registration, sandbox API deployment/readiness and Worker-facing probes.
- Control Plane owns its sandbox Runner key binding, profile/engine policy and CP→Runner probe.
- Telegram gateway owns test bot identity, ingress configuration and collector-state inspection when Telegram ingress is selected.
- MCP/Worker owners declare their scoped test bindings and safe readiness operations.
- Architecture issue #231 coordinates the cross-repository contract; owning implementation issues must link this scenario and update their Environment Contracts. Do not duplicate component commands or secret values here.

## Current evidence and gaps (2026-10-08)

- Runner sandbox API is installed and its test principal is paired with the CP Worker. Runner issue #173 remains open. Current candidate deployment verifies that a pre-provisioned principal exists; it does not generate and synchronize a new test key.
- Read-only MCP discovery and Worker auth probes have succeeded. They do not prove a full agent run.
- Previous shared CP/Runner executions include unknown/nonterminal state; architecture issue #190 records that the Telegram lane must not be reused or reset until reconciled. No new run should be submitted merely to demonstrate bootstrap.
- Runner `mock-test` implementation is under review in [PR #208](https://github.com/trained-assist/ai-agent-runner/pull/208); the related auth scenario is [architecture #230](https://github.com/trained-assist/trained-agent-architecture/pull/230). The cross-system bootstrap is not yet implemented or accepted.
