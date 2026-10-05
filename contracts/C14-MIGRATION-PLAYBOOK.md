# Connected application migration playbook

Status: proposed execution plan · 2026-10-05. This playbook sequences recruiting and CRM extraction under C14. It is not evidence that legacy behavior, live state or deployment ownership has already been migrated.

## Critical path

Do the work in this order. Each phase produces reviewable evidence before the next phase can change behavior or ownership.

1. **Pin the actual system.** For every source, caller, job, store and deployed process, record repository, branch, commit SHA, release/environment, owner, data read/write scope and observed last activity. Separate source SHA from deployed identity. Trace a user-visible workflow from UI/agent entry through MCP/HTTP, domain logic, provider calls and persistence. Mark unknowns explicitly; local checkout state is not proof of production state.
2. **Write behavior examples before moving code.** Choose a small set of high-value end-to-end scenarios per domain. Capture input shape, relevant pre-state, expected domain result, side effects and error behavior. Keep personally identifying and secret-bearing source material out of GitHub, CI artifacts, prompts and logs.
3. **Build the sanitized golden corpus.** If current records or traces are needed to learn real shapes, transform them in a restricted local environment. Apply field-aware deletion or irreversible replacement to names, emails, phones, addresses, provider IDs, free text, attachments, tokens and embedded metadata. Check derived fields, filenames, logs and cross-record links too. A reviewer verifies the output; any uncertain field is removed. Only the reviewed synthetic fixture is committed. Keep stable fake IDs and internally consistent references so joins, transitions and deduplication can be tested. Never commit a raw sample or a reversible mapping table.
4. **Pin schemas and baseline contracts.** Validate fixtures against app-owned domain schemas. For each scenario, record the old implementation's observable result in a reviewed expected file. Expectations are semantic assertions (objects, state transitions, provider intent), not snapshots of incidental timestamps, ordering, generated prose or secrets. Version fixtures and expectations together; changes require an explanation and domain-owner review.
5. **Map workflows to owned methods.** Produce a workflow-to-handler matrix: user action → domain command/query → application handler → app API schema → capability ID/tool mapping if agent-exposed → MCP relay transport. Identify missing methods by comparing required domain operations with the canonical application API. Add a method at the domain/API owner only when it represents a stable domain query or command needed by more than one client or a necessary workflow boundary. Keep UI navigation/presentation in the app; keep provider protocol in its integration adapter; keep MCP↔HTTP transport in the existing agent relay. Do not create a tool just to mirror each screen or copy business logic into MCP.
6. **Extract one vertical slice at a time.** Start with a low-risk read-only path. Run old and new implementations against the same synthetic scenarios and compare normalized outputs. Then move one mutation only after its canonical writer, authorization scope, idempotency, audit and reconcile behavior are proven. Avoid dual writers. For each slice, publish the app, schema, capability and relay versions independently and pin the consumer tuple.
7. **Prove consumer parity and failure isolation.** Exercise UI/API and agent relay against the same handler. Assert the same domain result/schema, correct principal/tenant scope, typed compatibility/auth/provider errors, bounded timeout/retry behavior, and that one unavailable app does not stop other agent work. Validate against current and candidate consumer versions.
8. **Canary, then transfer ownership.** First use a synthetic/test account, then an explicitly approved limited cohort. Compare domain invariants and operational signals with the old path; reconcile every unknown external mutation before retry. Keep a tested rollback target and old read path available. Move canonical reads/writes only after evidence is attached to the migration issue. Retire old code only after all callers, jobs and bindings have migrated and rollback is no longer required.

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

- **Recruiting:** inventory vacancy/candidate/application/negotiation state and credential scopes; establish synthetic read contracts; extract a low-risk vacancy/read path; then candidate/application reads with explicit PII scopes; only later consider status mutations, messages or provider writes with audit and unknown-outcome reconciliation.
- **CRM/Sales:** resolve catalog/site versus Worker/D1 versus sales-skill ownership and canonical writers; establish synthetic catalog/deal/note fixtures; extract catalog/read paths; then one deal/note command at a time with idempotency and reconciliation. Do not copy exhibition generation wholesale into CRM until lifecycle/deployment ownership is evidenced.

The two domains can proceed independently after the shared fixture, versioning and relay rules are agreed. Neither migration is a prerequisite for agent startup; app bindings remain independently disableable.
