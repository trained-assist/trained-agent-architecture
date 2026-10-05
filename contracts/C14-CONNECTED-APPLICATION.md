# C14 — Connected Application ↔ Platform

Status: proposed contract · 2026-10-05. This contract defines the boundary between an independently released domain application and the Trained Assist platform. It does not claim that the runtime adapter, service registration or production applications exist yet.

## Ownership and dependency direction

- The platform owns and versions the platform-facing envelope: trusted tenant/profile context, capability registration and invocation lifecycle, platform correlation IDs, credential resolution rules, normalized outcomes, readiness states and observability requirements.
- A connected application owns its domain API, canonical records, domain schemas, policies, UI and deterministic validation. It publishes a versioned service manifest and implements the platform-facing envelope. It does not import the agent/core as a library or write the platform Task Store.
- The agent/runtime consumes a registered application through a versioned binding/adapter. Core code does not import an application's private schemas, storage, routes or workflow rules.
- When a connected-app capability is exposed to the Trained Assist Agent, use the existing versioned capability-relay boundary (agent issue #2061): UI/API and agent relay call the same canonical application handler. The relay is a transport adapter only; do not add a second business implementation or an independent tool registry for the same capability. This contract does not require every UI route to be an agent capability.
- The Credential Broker or approved integration owner resolves provider credentials and scopes. A model never receives credentials or chooses a principal. Provider protocol and adapter ownership remains under C10 / the Integration Gate.
- `userTaskId` and `runId` correlate work only. Application domain state remains authoritative in the application; task/run state remains authoritative in the platform.

## Service manifest and compatibility

An application manifest is machine-readable JSON validated by a checked-in schema. It contains at least:

| Field | Contract |
|---|---|
| `serviceId` | Stable registered identity; unique within the registry. |
| `release` | Immutable application release/source revision and environment. |
| `platformContractRange` | Supported platform envelope versions, using an agreed bounded range. |
| `domainApiVersion` | Version of the application's own API. |
| `capabilities[]` | Stable capability ID, version, required/optional flag, input/output schema refs, effect class, required scopes, and handler/API operation ref. |
| `readiness` | `ready`, `degraded`, `blocked` or `unavailable`, with a safe typed reason and checked release/version tuple. |
| `compatibility` | Deprecated IDs/versions and explicit replacement mapping; aliases map to the same registered capability. |

At registration and deployment, the platform validates the manifest and performs a bounded readiness/compatibility handshake. It resolves and pins one platform contract version, one domain API version and concrete capability versions to the application binding/release. The selected tuple is visible in diagnostics. An invocation uses that pinned tuple; it does not silently fall back to a different schema or handler. A release changing a pinned tuple requires a new binding revision or an explicit compatible migration.

These versions are separate dimensions: platform-facing C14 contract, application domain API, capability implementation, application release, and (where the agent relay is used) capability-relay transport contract. In particular, the relay's integer contract version does not replace the application's domain API/capability versions. The platform binding pins the exact supported tuple and tests mismatches independently.

An unsupported required platform/API/capability version marks only that application binding `blocked`; an absent optional capability disables only workflows that require it. The platform returns a typed compatibility error with expected and observed versions. Other applications, capabilities and platform tasks remain available. Recovery requires a compatible application release or a platform compatibility adapter, followed by a successful handshake. Renaming a transport/MCP entry alone is not recovery.

Readiness endpoints expose no secrets or private domain records. Public liveness is not proof of authenticated readiness: the platform checks the actual binding, granted scopes and required operations using its trusted service identity.

## Invocation, effects and failures

The platform invocation envelope supplies a registered `serviceId`/binding, pinned versions, capability ID, typed payload or authorized reference, trusted tenant/profile scope, `operationId` for mutations and available task/run/event correlation. The application validates both envelope and domain invariants before applying a command. Claims supplied in model-generated text are never trusted as authorization.

Outcomes are typed: `completed`, `accepted`, `rejected`, `failed`, `outcome_unknown`, `blocked` or `unavailable`. A successful response identifies the domain object/revision or returns a bounded result; it must not claim a mutation merely because a request was sent. Domain writes use an idempotency key and revision/concurrency check. An unknown result for an external mutation is reconciled before retry, following C10. Analysis retries never imply mutation retries.

Timeouts, concurrency limits, circuit state and retries are scoped to the application binding/capability. Reads may use bounded retries under their declared policy. A failed/down/malformed app produces a typed binding/workflow outcome; it does not crash the agent, cause an unbounded self-healing loop, silently route to another principal, or replay a write. The platform can continue unrelated work. User-facing policy may offer manual retry or another supported route, but the failed domain action is not represented as complete.

AI output is a proposal. The application validates the output against the domain API, captured source revisions and its policy before accepting a domain command. A stale result returns a typed conflict/stale outcome; it is not silently applied. Drafting a message is separate from sending it.

## Release, canary and rollback

1. Publish a new platform contract/compatibility adapter additively while old pinned versions remain served.
2. Application CI validates its manifest and domain API against every supported platform version and the next candidate version, with synthetic fixtures and controlled failure cases.
3. Release the application with old/new compatibility where needed. Deploy it without moving the canonical writer or changing live routing.
4. Create a new binding revision and move a test account/canary cohort. Observe readiness, typed failures, latency, idempotency, version tuple and domain invariants.
5. Promote only after evidence is attached to the linked issue. Keep the previous application release, API schema and handler readable for rollback. Do not route an in-flight mutation across versions until its outcome is reconciled.
6. Deprecate then remove an old contract/capability only after all registered consumers have migrated and their CI/evidence is recorded. A failed app can be disabled at its binding without disabling the platform.

Every cross-repository migration has a linked issue/release matrix naming producer and consumer revisions, contract/API versions, owner, canary, rollback target and retirement evidence. There is no assumption of an atomic multi-repository release.

## Required conformance checks

Each application repository checks, without a live LLM/provider:

- manifest/schema validity, supported-version intersection and missing required/optional capabilities;
- independent mismatch behavior for platform envelope, domain API, capability and relay contract versions;
- readiness behavior for ready/degraded/blocked/unavailable, including app-scoped failure isolation;
- authorization scope and tenant/profile isolation using synthetic principals;
- domain invariants, stale revision/concurrent update, duplicate command and duplicate/out-of-order event behavior;
- timeout, malformed response, unknown mutation outcome and reconciliation-before-retry;
- AI-stub output validation and redaction of credentials/private values from prompts and logs;
- browser UI rendering with synthetic data, loading/empty/error/degraded/stale states;
- consumer contract tests against the pinned adapter/manifest version.
- for any capability exposed to the agent, REST/UI and the agent relay reach the same handler and return the same capability result/schema.

Live provider/LLM smoke is a separate, explicitly scoped check. Synthetic fixtures, mocks and schema validation are not represented as proof of external connectivity or model quality.
