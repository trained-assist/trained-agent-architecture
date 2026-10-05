# Connected application migration playbook

Status: proposed execution plan · 2026-10-05. This playbook sequences recruiting and CRM extraction under C14. It is not evidence that legacy behavior, live state or deployment ownership has already been migrated.

## Product goal

**Everything works for the agent's user across the agent and its Connected Web Apps.** The user and the selected user profile are the through-line: an authorized user can continue a supported scenario in the agent or in the relevant web app, find the same profile-owned domain objects, and understand what happened. The app owns its domain state and useful web workspace; the platform owns agent identity/profile and trusted execution context; the agent orchestrates and presents app capabilities. A connected app can fail or be disabled without taking down unrelated agent work.

“Works” is demonstrated per named user scenario, not inferred from a deployed URL or green unit suite. A scenario is done when the agreed end state is reached for the correct profile, the app and agent agree on the same domain object/result, authorization and failure cases pass, and any side effect is either confirmed or clearly reported as unknown/rejected. Overall migration is done only when all agreed priority scenarios pass this bar, every caller/job has moved, and canonical state has one proven owner.

The source-informed initial scenario map and current coverage gaps are in [Connected App User Scenarios](CONNECTED-APP-USER-SCENARIOS.md).

## Critical path

Do the work in this order. Each phase produces reviewable evidence before the next phase can change behavior or ownership.

1. **State the user outcome.** Name the user, selected profile, desired outcome, success signal and unacceptable failure for the scenario. The profile context must stay consistent while the user moves between agent and app. See the C14 “Agent user and profile are the through-line” contract.
2. **Write scenario cards from the user's view.** Describe the trigger and intent; current and target state; whether the user starts/continues in agent, app or both; what data they expect to find; what the agent should do; what the web app should let them inspect/edit; the handoff/result; authorization boundary; and visible behavior for empty, denied, stale, partial, failed and unknown outcomes. Include one happy path and the important variants. Avoid starting from a list of existing tools or endpoints.
3. **Pin today's implementation for those scenarios.** For each scenario, trace source and deployed repo/revision, agent entry/tool, app/UI route, caller/job, stores/writers, provider operations, profile/auth scope and last known activity. Separate source SHA from deployed identity. Mark unknowns explicitly; a local checkout is not proof of production behavior. Existing implementation is evidence to compare against, not the product spec.
4. **Define the minimum connected-app slice and ownership.** Map scenario steps to what the user needs from the app (domain records, page/state, APIs/commands/queries) and what the agent needs (only the capabilities required to orchestrate those steps). Keep the same canonical handler for app and relay; pass trusted principal/profile scope separately from model payload. Map user action → domain command/query → handler → API schema → capability/tool mapping if agent-exposed → existing MCP relay transport. Add a missing method at the domain/API owner only when it is a stable domain operation or necessary workflow boundary. Keep presentation in the app, provider protocol in its integration adapter and MCP↔HTTP transport in the existing relay. Don't create a tool to mirror every screen.
5. **Build reviewed golden examples.** Prefer hand-authored synthetic fixtures. If current records/traces are needed to discover shapes, transform them in a restricted environment with field-aware deletion or irreversible replacement, including names, emails, phones, addresses, provider IDs, free text, attachments, tokens, filenames, embedded metadata and links. Review output independently; remove uncertain fields. Raw extracts and reversible working material stay inside the restricted environment and are securely disposed according to its retention rules after review. Commit only reviewed synthetic data with stable fake IDs and consistent references. A reversible ID map is never committed.
6. **Pin schemas, expected behavior and tests before the move.** Validate fixtures against app-owned schemas. For each scenario, describe semantic expected results/state transitions/side-effect intent and errors rather than brittle timestamps, ordering or generated-prose snapshots. Build the test layers in “Test layers and gates” below, including a differential run of old and new implementations. Fixture safety uses a field allowlist, reviewer signoff and automated scans; regex scans are a signal, not proof of de-identification. Version fixture and expected result together; explain and review changes.
6a. **Prove every use case without Agent Run.** Each scenario has a programmatic UI/API/event/schedule path through its workflow and declared versioned commands/capabilities. Offline CI executes the real domain handler and local MCP facade with a stateful contract-derived mock, synthetic data, disposable storage and controlled time; a forbidden Runner stub asserts zero launch calls. Fixed AI recipes can use fixture outcomes. Track offline, integration and production readiness separately; use [the offline MCP rule in PR #157](https://github.com/trained-assist/trained-agent-architecture/pull/157).
7. **Move the smallest valuable vertical slice.** Choose from scenario value and risk, not code size alone. Start with a low-risk read or deterministic decision that is central to the chosen journey. If the essential value is a mutation, first move/test its domain decision with a fake provider; enable a real write only after canonical writer, authorization, idempotency, audit and unknown-outcome reconciliation are proven. Avoid dual writers. Pin app/API, capability, platform and relay versions independently.
8. **Prove profile continuity, consumer parity and isolation.** Exercise web/API and agent relay for the same synthetic profile against the same handler; assert same authorized object/revision/result, correct profile isolation, typed compatibility/auth/provider errors and bounded failure handling. Test profile switch/revocation, forged profile refs, stale state and background jobs. A failed app must not stop unrelated agent work.
8a. **HH cold search GCP-exit gate.** For the recruiting user, success means waking up to fresh candidates. The manual search API alone is insufficient: schedule owner, search executor, profile data/credentials, shared candidate and snapshot storage, results page/API routes, and the five-minute background scorer must move together. Keep the 11 legacy jobs paused, reconcile unknown outcomes, preserve public URLs, and accept a full scheduled cycle on a verified non-GCP target before stopping the old VM. Cloud Run is excluded; the RU VM requires read-only capacity/access/data checks first. See HH issue #187 and the merged GCP exit runbook change #154.
9. **Canary, then transfer ownership.** First use a synthetic/test account, then an explicitly approved limited cohort. Compare domain invariants and operational signals with the old path; reconcile every unknown external mutation before retry. Keep a tested rollback target and old read path available. Move canonical reads/writes only after evidence is attached to the migration issue. Retire old code only after all callers, jobs and bindings have migrated and rollback is no longer required.

## First iteration

**Iteration 0 — scenario definition (no production changes):** review and correct the initial [scenario map](CONNECTED-APP-USER-SCENARIOS.md), add owner-confirmed scenarios for any in-scope uncovered capabilities, and select the next end-to-end scenario by user value, frequency, criticality, agent↔web handoff, data risk and tractability. For each scenario, include the profile through-line, current behavior/source trace, desired outcome, minimum app-owned data/UI/API, agent capability mapping, error paths and acceptance examples. Do not choose a slice merely because its prototype endpoint already exists. Source inspection cannot supply actual user-frequency ranking; mark it unknown until usage evidence or owner input exists.

**Iteration 1 — first scenario works across channels:** implement only the minimum app-owned domain logic and profile-scoped web/API surface required for the selected scenario; connect the agent through the existing capability relay only if the scenario requires agent invocation. Prove it with reviewed synthetic golden fixtures, schema/domain/API tests, legacy-vs-new differential checks, profile authorization/isolation, UI/relay parity, failure/recovery tests and a test-profile walkthrough. Keep live routing and canonical-writer transfer gated until this evidence is reviewed. Then choose the next scenario and repeat.

## Test layers and gates

Every migrated workflow should have these checks before the next phase is accepted:

| Layer | What it proves | Examples |
|---|---|---|
| Fixture/schema | Golden examples are safe and structurally valid | Sanitization guard, schema validation, referential integrity, no secrets/PII patterns |
| Domain unit | Rules are independent of transport/provider | Eligibility, stage transitions, validation, dedupe, stale revision |
| Service/API contract | App handler accepts and returns the pinned schemas | Valid/invalid payloads, authorization, typed errors, readiness/version mismatch |
| Differential behavior | Extracted slice preserves intended legacy behavior | Same fixture through old and new path; compare normalized domain state/results |
| Consumer/relay contract | Agent maps to the same canonical handler without payload drift | Capability mapping, relay serialization, same result as direct API |
| Workflow integration | Multi-step structures and templates remain coherent | State transitions, linked records, rendered templates, provider request intent |
| Failure/recovery | Errors do not corrupt state or cause duplicate side effects | Timeout, retry, `outcome_unknown`, reconcile, duplicate event, rollback |
| UI acceptance | Web client handles real domain states | Empty/loading/error/degraded/stale states; safe rendering of synthetic records |

CI must run the deterministic layers with no live provider, production data or live LLM. External provider smoke tests are a separate opt-in environment and cannot replace contract or golden tests. Test templates as structured render inputs and outputs: assert required sections/fields, substitutions, escaping, and intended side-effect payloads; avoid brittle whole-page or whole-generated-text snapshots.

## Golden fixture rules

- Each fixture has a purpose, source class (fully synthetic or transformed), schema version, reviewer and a short note on which invariants it covers.
- Prefer hand-authored synthetic fixtures. Transform existing material only when it reveals a shape or edge case missing from synthetic data.
- Sanitization is field-aware and fail-closed. Free-text redaction alone is insufficient: inspect nested JSON, HTML, URLs, filenames, comments, attachments, logs, provider metadata and stable identifiers.
- Keep cross-record links internally consistent using deterministic fake IDs; don't preserve source IDs or a reversible ID map.
- Include edge cases deliberately: empty collections, duplicates, missing optional fields, unusual Unicode, stale versions, permission denial, provider timeout, partial/unknown result, and multi-step workflow transitions.
- Never use a fixture generated from a live model response as the sole expected result. Curate expected semantics and assert domain invariants.
- Re-review committed fixtures when schemas grow new free-text, identity, credential or attachment fields.

## Slice completion record

Each migration PR links its issue and records: workflow/scenario IDs; source and deployed revisions; fixture/expectation revisions; old/new normalized outputs; API/schema and capability/relay version tuple; methods added with their owning abstraction and reason; tests run; known differences; canary/rollback target; and the next safe slice. No phase is considered complete from a green unit-test badge alone.

## Initial domain order

- **Recruiting:** inventory vacancy/candidate/application/negotiation state and credential scopes; establish synthetic read contracts; extract a low-risk vacancy/read path; then candidate/application reads with explicit PII scopes. The morning cold-search feature is a mandatory pre-GCP-stop workstream: move schedule owner, worker, profile-bound data/credentials, page/API, background rescoring and public routing together; reconcile paused/unknown legacy occurrences and accept one full scheduled cycle on a verified target. Cloud Run is excluded; the RU VM requires read-only validation. See R-03 and issue #187. Only later enable status mutations, messages or other provider writes with audit and unknown-outcome reconciliation.
- **CRM/Sales:** resolve catalog/site versus Worker/D1 versus sales-skill ownership and canonical writers; establish synthetic catalog/deal/note fixtures; extract catalog/read paths; then one deal/note command at a time with idempotency and reconciliation. Do not copy exhibition generation wholesale into CRM until lifecycle/deployment ownership is evidenced.

The two domains can proceed independently after the shared fixture, versioning and relay rules are agreed. CRM/Recruiting app bindings remain independently disableable for agent startup; the separate HH R-03 cutover is a hard gate only for stopping its legacy GCP VM.
