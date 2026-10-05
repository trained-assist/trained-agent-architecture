# Connected Web Apps — user scenario map

Status: source-informed scenario baseline · 2026-10-06. This describes workflows visible in inspected source and a target experience for the agent's user. It is not proof every path is deployed or currently used. Scenario priority by frequency/value must be confirmed from product usage; the current code alone does not provide that evidence.

## Product outcome and shared contract

The user and the selected profile are the through-line. The user can work through the agent, open a connected web app to inspect or edit richer domain state, and return to the agent; supported handoffs resolve to the same authorized profile and canonical domain object. The app provides a useful workspace around the user's work. The agent remains the user's conversational coordinator and invokes only app capabilities needed by the scenario.

Every scenario below inherits these rules:

1. The platform authenticates the agent user, selects the active profile and supplies opaque trusted principal/profile references and scopes. The model cannot choose or override them.
2. The connected app owns its domain entities and workflow invariants. It does not own a competing agent login/profile. Every request, record, attachment, scheduled job and audit event is bound to the trusted profile context.
3. Web UI and agent relay reach the same application handler. They return the same domain object/revision and typed outcome. UI session and relay identity must resolve to the same profile binding.
4. Handoffs use stable domain object references and operation receipts. Task/run IDs correlate execution; they are not profile identity. Share only the context needed for that step, with an explicit scope.
5. Writes and external effects are visible as pending/accepted/completed/rejected/unknown. The UI/agent never reports success until the domain operation is confirmed; retry of unknown external outcomes requires reconciliation.
6. Profile switch/revocation, tenant mismatch and another user's records fail closed. The user's old profile data must not leak into the new profile.

## Scenario cards

### S-01 — Find an exhibition participant and understand whether it is a target

**User story:** As the agent's sales user, I open an exhibition catalog, find a company, inspect the facts and target status, then continue to a note or deal without losing which event/company I selected.

**Journey:** agent/user selects event → connected catalog opens → search/filter by name/country/target/near-target/revenue/profit or alphabet → company card shows stand, profile/catalog link, site, available financial/legal facts and target rationale → user starts note or deal action → agent can resolve the same event/company.

**Minimum app responsibilities:** versioned event and participant records; stable unique company IDs per event; catalog UI and query; filter definitions; target/near-target/unknown status; clear provenance/freshness for enrichment; safe deep link/object reference. Search and display are profile-authorized if catalog visibility is profile-scoped; public exhibition facts must be explicitly marked public and separated from profile notes/status.

**Acceptance examples:** same event/company appears through UI and agent query; filters produce the expected set; missing enrichment is displayed as unknown rather than invented; duplicate company IDs block action links; switching profiles hides profile-specific notes and statuses while leaving only explicitly public catalog facts.

**Failure variants:** source page/catalog missing; scrape or enrichment unavailable; registry unknown; stale catalog; duplicate/unsafe IDs; no matching company; app unavailable. Report partial data and provenance instead of fabricating a result.

**Current source evidence:** `trained-assist-sales-skill/src/mcp-skills/tools/88-expo-catalog.js`; `src/catalog-template/index.html`; `playbooks/exhibition-catalog-to-sales-site.json`; pipeline state is files (`exhibitors.json`, `enriched.json`, `targets.json`, `ex-array.json`). Current local browser filters persist in localStorage per event; the template itself has no authenticated profile session.

### S-02 — Prepare and publish an exhibition catalog

**User story:** As the sales user, I give the agent an event source and targeting intent, review the participant data/classification, and publish a usable catalog site for customers.

**Journey:** check prerequisites → discover participants source → parse/deduplicate → enrich legal/financial/contact facts → check registry/sanctions → apply profile/event criteria → review border cases → build catalog from template → validate data/links → deploy → inspect live URL and report counts.

Publishing is a separate consequential command. Before deployment, the app must show the exact event, destination/project/account, content revision and visibility; the user confirms it. Return a deployment receipt (release, URL, timestamp, prior release) and support rollback/unpublish with authorization. A build preview is not a publish confirmation.

**Minimum app responsibilities:** event workspace; source/import job and provenance; participant/enrichment schemas; criteria and site configuration; explainable qualification outcomes; deterministic template/build output; validation report; release/deploy identity and URL. Agent capabilities should be domain operations (import, enrich, qualify, build, release/status) only where the agent must orchestrate them; each long job returns status/artifact refs instead of pretending to finish synchronously.

**Acceptance examples:** missing prerequisites stop before side effects; no source page means an explicit blocked result; enrichment outage preserves incomplete records; registry unknown never becomes confirmed safe; no-INN and policy rules are enforced; duplicate IDs block build; report counts reconcile to the generated data; unconfirmed deploy is rejected; deploy receipt identifies exact app release/event/destination and rollback target.

**Current source evidence:** `playbooks/exhibition-catalog-to-sales-site.json` stages gates/discover/scrape/enrich/registry/classify/assemble/site/deploy/report/acceptance; tools in `85-expo.js`, `86-expo-flexi.js`, `87-expo-pipeline.js`, `88-expo-catalog.js`; core `site_deploy` is a separate dependency. Provider availability/real deployed source remains unverified.

### S-03 — Record interest, note, refusal or undo from the catalog

**User story:** While viewing a participant, the sales user records context or a refusal and sees that status consistently on the card and in later agent work.

**Journey:** open participant → add text/audio note, mark reject or undo → receive confirmed receipt → status changes in the card → agent query/history sees the same event and can summarize the timeline.

**Minimum app responsibilities:** profile/event/company scoped prelead; append-only note/event history; explicit status state machine and actor/time/source; audio artifact reference and transcription provenance where supported; retention and consent policy for recorded/transcribed audio; idempotent status command; audit; UI and API share the same handler. Preserve `deal > reject > note` display precedence only if product confirms it remains intended; store underlying events even when one badge wins.

**Acceptance examples:** second identical request does not duplicate a note/status event; one profile cannot see another's private notes; undo produces an auditable transition rather than deleting history; audio/transcription failure preserves a clear pending/failed state; API outage does not optimistically show a saved note.

**Current source evidence:** catalog actions in `src/catalog-template/index.html`; site-predeal-notes Worker routes in `flexi-crm-automation/workers/telegram-deal-bot/src/index.js`; D1/file adapter in `prelead-store.js`. State is split across the static page, browser, Worker/D1 and sales tool operation bindings.

**Logical API operations to define:** `participant.addNote`, `participant.setDisposition`, `participant.getActivity`. These are app domain operations; agent capability exposure is only needed if the user asks the agent to perform/summarize these actions. Audio upload/transcription belongs behind an app media/provider boundary, not as a raw MCP file-system tool.

### S-04 — Create a deal from a selected catalog participant

**User story:** From a specific event/company, the sales user completes the minimum required deal details, reviews them, confirms creation, and sees one resulting CRM deal linked back to the catalog participant and profile.

**Journey:** choose participant → inspect existing notes/identity → collect/validate required fields (source/event, deal type, company INN, contact, title/comment and any required stage) → review → explicit confirmation → create CRM deal → reconcile returned deal ID → link deal to prelead/status → show the result in web and agent. If a step times out, recover/query by operation ID before retry.

**Minimum app responsibilities:** one command handler and input/output schema; authoritative duplicate/idempotency key tied to event+company+operation; validation and typed missing-field errors; CRM provider adapter; operation ledger with `pending/created/unknown/rejected`; verified deal ID before setting `deal` status; retry/reconcile endpoint; audit with profile and actor; stable link from event/company to deal. Provider credentials remain in approved secret/broker flow.

**Acceptance examples:** incomplete details do not create a deal; confirmation is required; repeating a confirmed operation returns the same deal; provider timeout does not create a second deal on retry; status-link failure is repairable without recreating the CRM deal; UI and relay return identical deal ID/state; other profiles cannot query the operation.

**Current source evidence:** catalog deep link in `src/catalog-template/index.html`; `flexi_create_deal` and `flexi_sync_deal_status` in `trained-assist-sales-skill/src/mcp-skills/tools/92-flexi-sales.js`; Weeek create validation in `30-weeek.js`; notes state in `flexi-crm-automation/workers/telegram-deal-bot`. Canonical owner is unresolved: Weeek stores deals, while app-side code keeps operation bindings and prelead status.

**Logical API operations to define:** `deal.createFromParticipant`, `deal.getOperation`, `deal.reconcileOperation`. `createFromParticipant` owns domain validation/idempotency and delegates to the CRM adapter; `get/reconcileOperation` make retry safe. The capability owner can expose one `create_deal_from_catalog` tool mapped to the command and a status/reconcile tool only if the agent needs recovery. Do not recreate generic Weeek CRUD as app-specific MCP tools.

### R-00 — Connect and check the recruiting account

**User story:** The recruiting user securely connects their HH account to the intended agent profile and can verify access or disconnect it without exposing the credential to the model or another profile.

**Journey:** start connect from the agent or recruiting app → authenticate with HH → bind the resulting credential reference to the selected trusted profile → check status/current scopes → refresh/revoke as needed → continue to vacancy/response work.

**Minimum app/platform responsibilities:** credential broker or explicitly owned secret store; OAuth state/CSRF protection; opaque credential ref; profile binding and revocation; status that reports account identity/scopes without token; audit; no token in model context, manifest, logs or fixtures. Do not share a credential merely because two agent profiles belong to the same person.

**Current source evidence:** core intent/connect routes plus HH sibling `hh_connect`/`hh_status`; token is currently stored by core in per-profile files and used by the sibling. This is a product prerequisite but a poor first extraction slice because credential ownership crosses the app/platform boundary.

### R-01 — Select a vacancy and review incoming responses

**User story:** As the recruiting user, I select one of my vacancies, see its current responses and history, and continue reviewing the right candidates under the active profile.

**Journey:** connect/check HH account → list/select vacancy → set it active for the profile → fetch paginated response negotiations → enrich with resume/activity/history and cached state → open review UI or ask the agent for a summary.

**Minimum app responsibilities:** profile-scoped vacancy binding; response/candidate schemas with HH IDs kept as provider refs; current source revision/freshness; pagination; ATS evaluation version; candidate-history and message-draft refs; typed provider/cache errors. HH remains authoritative for negotiation state until a reviewed data-owner decision changes that.

**Acceptance examples:** no active vacancy asks the user to choose; stale cached data is labeled; a response not found live is not silently presented as current; a deleted/other-profile vacancy is inaccessible; pagination has no duplicates or gaps; the UI and agent agree on candidate state/revision.

**Current source evidence:** `trained-assist-hh-skill/src/mcp-skills/tools/90-hh.js` (`hh_set_active_vacancy`, `hh_list_responses`); `hh-routes.js` `/hh/review`; state split among core token/profile files, HH negotiations and local candidate cache/history.

**Logical API operations to define:** `vacancy.list`, `vacancy.selectForProfile`, `response.list`, `response.getReviewContext`. Provider adapter handles HH pagination and provider IDs; profile selection stays a domain binding, not a model-authored user ID. Agent tools may map to list/select/review operations, while normal web navigation remains UI-only.

### R-02 — Evaluate and work an incoming response

**User story:** The recruiting user reviews a candidate against the selected vacancy, understands why the candidate fits or does not, then explicitly chooses the next action.

**Journey:** load response/resume/interaction history → evaluate against versioned vacancy criteria → show evidence, score, concerns and uncertainty → draft response or stage recommendation → user edits/confirms → optionally send message or move negotiation → reconcile provider state and update candidate history.

**Minimum app responsibilities:** versioned evaluation criteria and result schema; preserve source resume revision and evaluator/model/config version; separate assessment from decision; message draft distinct from send; explicit confirmation and allowed actions; idempotent send/move operations with unknown-outcome reconciliation; immutable action history.

**Acceptance examples:** changed resume/config invalidates stale assessment; missing resume/criteria yields incomplete not fabricated score; batch result and single-candidate result use same contract; drafts never send automatically; duplicate confirmation cannot send twice; failed/unknown HH send is reconciled before retry; reject/discard/reply history remains visible.

**Current source evidence:** `90-hh.js` evaluation/list/move tools; batch and draft-review logic; `hh-routes.js` review/send routes. HH negotiation provider state and local ATS/history are distinct.

**Logical API operations to define:** `candidate.evaluate`, `response.draftMessage`, `response.sendMessage`, `response.transition`. Keep `sendMessage` and `transition` explicit confirmed commands with operation IDs; scoring and drafting are separate read/proposal operations. The capability owner should expose only actions available in the selected scenario and scope.

### R-03 — Wake up to fresh candidates (scheduled and manual cold search)

**User story:** In the morning, the recruiting user opens the candidate page and sees fresh candidates found for the right profile and vacancy. The agent can help inspect that same result set. Scheduled and manual searches update one shared candidate history.

**Journey:** recruiter configures a cold-search schedule for a vacancy → at its local scheduled time the worker searches HH using that profile's token, ATS criteria and saved queries → filters and evaluates resumes → persists the full post-filter candidate pool before marking its IDs seen, merges the accumulated candidate store, and writes a dated result snapshot → the user opens the existing `/hh/proactive` page and sees the accumulated vacancy feed with freshness and counts from the latest snapshot → the user can also start a manual search or update candidate query/comment/status/import through `/api/hh/proactive/*` → a separate background scorer updates unscored candidates in the same store.

**Minimum app responsibilities:** profile/vacancy-scoped schedule definitions and timezone; one scheduler owner; durable unique occurrence `(legacy_job_id, scheduled_at)`, lease/no-overlap and coalesced missed runs; HH execution worker and credential boundary; versioned vacancy criteria, comments and query cache; profile-bound seen IDs, shared candidates with vacancy-specific review state, and snapshots; resumable status/results; the existing page and needed API actions; coordinated background rescoring; audit and reconciliation for uncertain runs. Scheduled and manual paths must call the same canonical search handler and write the same data model. A candidate may appear under more than one vacancy; legacy candidates without vacancy IDs require an explicit import decision.

**Acceptance examples:** the user sees newly found candidates after a scheduled run while previously accumulated candidates and vacancy-specific review state remain visible; the latest snapshot supplies freshness and counts; the page/API/manual search retain their public paths and read/write the same profile-owned results; the full candidate pool is durable before IDs are marked seen; a schedule is unique per vacancy and preserves its `Europe/Moscow` timing; duplicate timer delivery or overlapping invocation runs one occurrence; missed runs are coalesced rather than replayed as a burst; a changed comment/query/criteria revision is visible; profile B cannot see A's token, candidates, history or schedule; old unknown outcomes are reconciled before any replay; the five-minute rescore writer is migrated or stopped only after its final delta is reconciled; no required route, worker, schedule or data read calls the retiring GCP host. Offline MCP evidence must also call declared manual-run and result-read operations through the same app handlers once those operations are introduced.

**Cutover gate:** HH cold search is required before the legacy GCP VM can be stopped. As of 2026-10-06, 11 legacy schedule definitions are temporarily paused (10 working-profile definitions and 1 test definition); 8 last outcomes are `unknown`. The pause preserves definitions/history and prevents an accidental catch-up; it is not removal of the feature. Do not blindly run the unknown occurrences. Complete worker, profile data and credentials, schedules, result page/API, background writer, URL routing and rollback; observe at least one successful occurrence for every required vacancy schedule, including a full cycle of the rarest required schedule, on the new target before VM stop. Cloud Run is excluded for this feature. The existing RU VM is only a candidate after read-only resource/access/data checks; if it fails, select another verified target before cutoff. See [HH migration issue #187](https://github.com/trained-assist/trained-assist-hh-skill/issues/187) and [GCP VM exit runbook change #154](https://github.com/trained-assist/trained-agent-architecture/pull/154) (merged).

**Current source evidence:** `trained-assist-hh-skill/src/hh-cold-search-cron.js` and `hh-cold-search-lock.js` implement the schedule/claim path. `hh_proactive_schedule` upserts one `cold-search:<vacancy_id>` job for `hh_proactive_search`; `interval_hours` is converted to a five-field cron with a deterministic per-vacancy offset in `Europe/Moscow`, while the old core cron owns leases/catch-up/history; `hh-proactive-search.js` owns search, seen IDs, all-candidates and snapshots; `hh-eval-job.js` and the five-minute `hh-negotiations.js` background path also write candidate scores; `hh-routes.js` serves `/hh/proactive` and `/api/hh/proactive/*`; the current nginx route is in `trained-assist-agent/infra/nginx/recruiter-assistant.conf`. Those public routes currently proxy to the retiring GCP VM. The legacy web, scheduler, provider, profile files and candidate writers are coupled. The accepted exit runbook uses a separate HH service/worker with a single minute systemd timer on a verified host, not one OS timer per vacancy; a durable occurrence store owns dedupe and recovery.

**Logical API operations to define:** `candidateSearch.scheduleUpsert`, `candidateSearch.scheduleDisable`, `candidateSearch.run`, `candidateSearch.getOccurrence`, `candidateSearch.getResults`, `candidateSearch.updateReview`, `candidateSearch.importCandidate`, and `candidateSearch.reconcileOccurrence`. Scheduled and manual triggers call the same `run` handler. The scheduler delivers an occurrence ID and trusted profile binding; it never carries HH credentials or chooses a profile. Long searches expose stable job IDs, progress and typed outcomes rather than holding an agent invocation open.

### R-04 — Prepare a candidate report for a client

**User story:** The recruiting user assembles a client-ready report from the correct candidate and vacancy, reviews what may be shared, renders a polished artifact and controls who can access it.

**Journey:** select candidate/profile and vacancy → gather source resume, evaluation and relevant notes → draft structured client-facing fields → keep internal evaluation/PII separate from client-visible fields → validate required facts and forbidden content → render preview (HTML/PDF/Markdown as selected) → user reviews/edits/approves → publish/share with explicit audience and access policy → return stable report ref and audit history.

**Minimum app responsibilities:** report schema with internal/client audiences and field-level scopes; candidate/resume source revision; structured draft and edit history; deterministic escaped template renderer; validation and redaction report; preview separate from publication; publication policy/access expiry or password requirement; actor/profile/audience audit; unpublish/revoke; stable report ref for agent/web continuity.

**Acceptance examples:** wrong candidate/vacancy pairing is blocked; internal-only fields never render into client output; forbidden terms/unsafe HTML are rejected/escaped; PII-bearing report cannot publish without explicit audience/access choice; publish failure leaves draft intact; only authorized profile/client can view; update/revoke has auditable result; agent HTML/Markdown/JSON paths agree on the same selected source revision.

**Current source evidence and gaps:** `97-candidate-client-report.js` context/note/HTML tools and `hh-candidate-report.js` render/store; separate `hh_list`/Markdown report in `90-hh.js`; `100-hermes.js` structured assessment JSON; v2 render/download routes in `hh-routes.js`. These are parallel flows; automatic composition/persistence for v2 is unverified. Existing HTML tool publishes by default while password is optional (`97-candidate-client-report.js`), so the new app must require explicit publication policy rather than carry over that default.

**Logical API operations to define:** `report.createDraft`, `report.updateDraft`, `report.preview`, `report.publish`, `report.revoke`. The app owns field scopes, validation, template render and publication access policy. Hermes/LLM returns a proposal to validate; it is not a publish command. Publishing requires an explicit user confirmation, audience and access policy. An agent tool may expose draft/preview; publish should be separately gated.

## Coverage and completeness check

This baseline covers the named user work: sales catalog use and deal creation; recruiting response review/action, scheduled and manual cold search (including the GCP exit gate), and client report preparation. It also records catalog build, participant notes/statuses and required HH account/vacancy selection because they are prerequisites or adjacent steps in those user journeys.

| Existing capability area found in source | Scenario | Included? | Still needs product decision |
|---|---|---:|---|
| Exhibition discovery, scraping, enrichment, registry, qualification, build and deployment | S-02 | Yes | Which stages belong in CRM Web vs specialized provider/job workers; authoritative input repos/deployment |
| Catalog search, filters, participant details, target badges | S-01 | Yes | Which fields are public vs profile-private; criteria ownership |
| Notes, audio, reject/undo, status badge and event history | S-03 | Yes | Keep rejection/undo semantics and badge precedence |
| Catalog deep link → deal form → CRM create → catalog status/recovery | S-04 | Yes | Canonical deal owner (Weeek vs app), required fields and confirmation UX |
| General Weeek contacts/tasks/comments/deal CRUD outside exhibition flow | Adjacent | Partial | Include in migration scope or leave as integration adapter; inventory every caller |
| HH connect/status and token refresh | R-00 | Yes | Credential broker/service delegation; token ownership cannot be inferred from current flow |
| Vacancy selection and response list/review | R-01 | Yes | Profile binding, freshness and cache policy |
| Response list, ATS, draft review, send, rejection/move and reply history | R-01/R-02 | Yes | Which actions are first release; human confirmation and exact stale-data policy |
| HH scheduled/manual cold search, scoring, seen state, comments/status/import, results page/API and background rescoring | R-03 | Yes — required before GCP VM stop | New execution target, profile data/credentials, durable schedule dedupe, routing, unknown-outcome reconciliation and background-writer handoff; Cloud Run excluded, RU VM candidate only after read-only checks |
| Client HTML/Markdown/JSON report and v2 evaluation rendering | R-04 | Yes | Unify formats, compose Hermes with report flow, publication/auth and client lifecycle |
| Vacancy creation/edit/publish; candidate documents/interview transcription/evaluation | Not a named scenario yet | No | Confirm whether these are in current must-migrate scope; add cards before extracting their logic |
| Campaign/outbound sales follow-up and other lead automation in `flexi-crm-automation` | Not a named scenario yet | No | Establish current user value/active workflow; do not silently absorb the entire repo |

The map is sufficiently complete for the five outcomes the user named: exhibition catalog use, deal creation, response work, cold search and client report preparation, including key prerequisites, state and failure paths. It is not a complete inventory of every capability in the source repositories: the explicit “not yet” rows and general CRM tools need a product scope decision before claiming all legacy functionality has migrated. No reliable usage-frequency data was found, so scenario order is a risk/tractability proposal, not a measured priority ranking.

**Real web identity is an implementation gate:** a web session must be established by a trusted platform/app authentication handoff and resolved server-side to principal/profile. A browser-supplied profile ID is never proof of identity. Synthetic tests may inject a fake trusted identity resolver; the production adapter remains unspecified until the platform auth owner approves the binding flow.

## Method ownership rule

The logical operation names above are proposals for app-owned domain API operations, not a demand to create one MCP tool per operation. Add or change a domain method at the app owner when the user scenario needs a stable query/command, authorization rule or invariant that belongs with app data. The agent capability owner maps a subset of those methods to tool names and JSON payload schemas. The existing agent/runtime relay transports that payload unchanged. A UI-only action remains a UI concern; provider-specific HTTP remains in the app integration adapter. The scenario matrix and contract tests prove each mapping and identify a true missing method without turning MCP into the business-logic layer.

## First iteration proposal

Use **S-01 catalog reads** as the first connected/test-account CRM slice. Then use **S-04, catalog participant → confirmed deal → reconciled catalog status**, as the first synthetic cross-layer mutation exercise because it ties the web catalog to the agent and makes duplicate/unknown-result paths testable. Keep the CRM provider behind a fake adapter in deterministic tests; do not use live Weeek credentials or production rows in the new public repo. Synthetic profile A must create and recover exactly one linked deal; profile B cannot see it; UI/API and relay produce the same typed result. This exercise does not authorize a live mutation. The canonical writer decision, trusted web-session binding, explicit confirmation and rollback target must be recorded before any live deal creation moves.

For Recruiting, R-01 synthetic vacancy/response reads establish the low-risk service boundary. R-02/R-04 continue as independently testable foundations. R-03 is the urgent operational path: the morning cold-search experience includes schedules, execution, profile data/credentials, results page/API, background rescoring and public routing, and must be accepted on a verified non-GCP target before the old GCP VM stop. A manual search-job foundation does not meet that gate. Keep the old jobs paused and reconcile unknown occurrences; do not replay them blindly. Offline MCP evidence now includes a fake-clock scheduled workflow through declared contracts, a local MCP round trip with stateful mocked dependencies and Agent Run forbidden, occurrence dedupe and shared manual/scheduled state (Recruiting Web #10–12). This is synthetic contract evidence only. The next R-03 critical path is a durable candidate/seen/snapshot/query model and import, a transaction-safe schedule/job store, trusted identity and HH credentials/provider, the independent scorer, complete public API/link compatibility, and a verified non-GCP worker/timer and routing cycle.

## Current implementation evidence

These draft PRs are foundations against synthetic fixtures. They are not a live cutover and do not close the named journeys:

| Work | Draft PR | Evidence in this iteration | Still missing for scenario completion |
|---|---|---|---|
| C14 boundary and user journeys | [Architecture #150](https://github.com/trained-assist/trained-agent-architecture/pull/150) | Ownership contract, profile through-line, scenario map, test/migration gates | Runtime binding, trusted web session, agreed data owners |
| CRM catalog contract | [CRM Web #2](https://github.com/flexi-consulting/crm-web/pull/2) | Synthetic catalog and versioned read contract | Profile-aware workspace/session binding, legacy data/provider parity |
| CRM intent preparation | [CRM Web #4](https://github.com/flexi-consulting/crm-web/pull/4) | Scoped synthetic API foundation, idempotency and fake status reconciliation | Browser confirmation UX, agent relay parity, real CRM deal receipt/reconcile, canonical writer; not S-04 complete |
| CRM prelead timeline | [CRM Web #5](https://github.com/flexi-consulting/crm-web/pull/5) | Synthetic append-only note/reject/undo events, profile-scoped idempotency and fail-closed routes | Durable canonical store, UI/relay parity, audio consent/retention and trusted profile binding; S-03 foundation only |
| CRM exhibition build pipeline | [CRM Web #7](https://github.com/flexi-consulting/crm-web/pull/7) | Synthetic pre-publication import/dedup/enrichment/registry/qualification, contradictory provider values fail closed, safe source links, deterministic artifact/report | Live source/provider semantics, production HTML/build/deploy/publish, durable store, trusted profile handoff and relay parity; S-02 foundation only |
| CRM catalog HTML preview | [CRM Web #8](https://github.com/flexi-consulting/crm-web/pull/8) | Deterministic synthetic HTML preview from validated artifact, safe links/escaping, CSP and profile-scoped read | Legacy field mapping/accessibility review, browser session binding, deploy/publish, trusted profile handoff and relay parity; S-02 preview only |
| CRM S-01 local MCP contract | [CRM Web #9](https://github.com/flexi-consulting/crm-web/pull/9) | Versioned exhibition participant descriptor, schema-driven test-only JSON-RPC call to the same profile-scoped handler as page/API, synthetic event/participant and private qualification overlay parity | Production relay, trusted web session, live catalog source/provider, deployed compatibility and full S-01 workflow remain unverified |
| CRM confirmed deal create/reconcile | [CRM Web #6](https://github.com/flexi-consulting/crm-web/pull/6) | Synthetic confirmed create, profile-scoped idempotency, unknown reconciliation and link repair through a fake provider | Human confirmation provenance, browser/relay parity, canonical writer, durable ledger and real provider receipt; S-04 foundation only |
| Recruiting service contract | [Recruiting Web #1](https://github.com/trained-assist/trained-assist-recruiting-web/pull/1) | Synthetic vacancy list, manifest/schema/CI foundation | HH provider, trusted identity/credentials, agent binding |
| Recruiting response read | [Recruiting Web #5](https://github.com/trained-assist/trained-assist-recruiting-web/pull/5) | Local profile fixture UI, assigned vacancy, paginated response summaries with fixture revision/freshness | Trusted profile mapping, live response semantics/freshness, relay parity; R-01 foundation only |
| Recruiting candidate evaluation | [Recruiting Web #7](https://github.com/trained-assist/trained-assist-recruiting-web/pull/7) | Synthetic deterministic evidence/gap evaluation pinned to response, resume and criteria revisions; semantic inconsistencies rejected and adapter failures return typed errors | Real ATS policy/evaluator, bounded evaluator timeout, source authority/freshness, persistence/audit, trusted profile binding and relay parity; R-02 foundation only |
| Recruiting cold-search job | [Recruiting Web #8](https://github.com/trained-assist/trained-assist-recruiting-web/pull/8) | Synthetic profile-scoped resumable manual job, tuple-safe idempotency, paging/stale checks, non-retryable forbidden handling, typed fake-provider failures | Does not implement schedules, HH worker/credentials, profile data restore, shared persistent seen/candidate/snapshot stores, background rescoring, `/hh/proactive`/`/api/hh/proactive/*` parity, public routing, or GCP exit; manual-job foundation only |
| Recruiting cold-search schedule occurrences | [Recruiting Web #10](https://github.com/trained-assist/trained-assist-recruiting-web/pull/10) | Synthetic profile/vacancy schedule and fake-clock worker: Moscow interval mapping, unique occurrence claim, missed-run coalescing, unknown quarantine, current criteria at execution and completed multi-page job through the same handler/store as manual search | Test adapter is in memory; no durable store, real HH/credentials/profile-data migration, registered MCP facade/mock round trip, user schedule/page/API route parity, background scorer, public routing, or live cycle on a non-GCP target; domain-offline R-03 foundation only |
| Recruiting R-03 local MCP contract | [Recruiting Web #11](https://github.com/trained-assist/trained-assist-recruiting-web/pull/11) | Versioned Recruiting-owned schedule/occurrence descriptors pinned to relay v1; test-only stdio JSON-RPC discovery/call uses schema validation, fake clock, real schedule handler and stateful synthetic provider with no network egress or Agent Run | No production runtime relay binding or authenticated user schedule routes; page/API parity, durable state, HH/credentials, data restore, background scorer and non-GCP operational cycle remain open; not full offline-ready or GCP exit |
| Recruiting morning candidate page | [Recruiting Web #12](https://github.com/trained-assist/trained-assist-recruiting-web/pull/12) | Synthetic `/hh/proactive` page and selected `/api/hh/proactive/*` routes: profile/vacancy-scoped completed results, schedule enable/disable and manual search through the shared handler/store; retry key and partial-failure behavior tested | Old HMAC links and exact API payload parity, query/comment/status/import/manual-add actions, durable candidate/seen/snapshot state, background scorer, live HH/credentials, nginx cutover and non-GCP schedule cycle remain open |
| Recruiting report preview | [Recruiting Web #6](https://github.com/trained-assist/trained-assist-recruiting-web/pull/6) | Synthetic client allowlist projection, escaped deterministic preview, internal-field leakage tests | Real source revision, profile authorization, edit/persist/review, approved fields, explicit publish/access/revoke; report foundation only |
| Recruiting report draft lifecycle | [Recruiting Web #9](https://github.com/trained-assist/trained-assist-recruiting-web/pull/9) | Synthetic profile-scoped draft/edit/preview/review/publish/revoke; serialized side effects, stable operation IDs and retained unknown outcomes | Trusted identity, approved fields/consent, durable source/audit, live publication policy and reconciliation adapter; R-04 foundation only |

The application PRs are draft foundations; Architecture #150 is merged, and [Architecture #158](https://github.com/trained-assist/trained-agent-architecture/pull/158) is the draft update for the morning schedule and offline MCP rule from [#157](https://github.com/trained-assist/trained-agent-architecture/pull/157). As of 2026-10-06, CRM Web #6–#9 and Recruiting Web #7–#12 have both hosted checks passing on their reviewed heads; Architecture #158 has required checks passing. Independent review found and rechecked fixes for schedule failures in #10, MCP lifecycle/output schema failures in #11, and manual/scheduled idempotency, completion time, resolver failure and concurrent manual retry behavior in #12. Local suites are reported in the PRs. Do not treat a synthetic green suite as proof of provider connectivity, production MCP relay parity, deployed compatibility or scenario completion.

## Test scenarios derived from these journeys

The shared synthetic golden set should have at least two profiles; two events with overlapping participant names; duplicate/unsafe IDs; one profile-private note; a pending/created/unknown deal operation; two vacancies; applied and cold-search candidates; scheduled occurrences for two vacancies (including a prior unknown outcome), requested/effective interval mapping, deterministic spread, `Europe/Moscow`, duplicate ticks, lease expiry and coalesced missed-run cases; seen IDs, a full pool before seen commit, one candidate in two vacancies with distinct review states, accumulated candidate rows, dated snapshots that only supply freshness/counts, comments affecting query revision, background-rescore claims and explicit treatment of legacy rows without vacancy IDs; changed resume/criteria revisions; one internal-only report field; and one publication/access-policy case. Keep schedule IDs, candidate IDs, tokens and all names synthetic; never copy the private legacy export/history into a public fixture. Keep all IDs/emails/names synthetic.

Before a slice is accepted, run:

- **Journey contract:** each card's normal path and required output/state transition.
- **Profile continuity:** web and relay on one profile see the same object/revision; other profile, forged refs, switch and revocation cannot cross scope.
- **Schema/method mapping:** app API payload/result validated; each agent capability maps to the exact canonical operation; transport does not mutate domain payload.
- **Differential behavior:** normalized old and new results agree for intended behavior; documented differences are reviewed rather than copied blindly.
- **Domain side effects:** confirmation, idempotency, provider receipt, unknown outcome reconciliation, status link repair, retry and audit.
- **Workflow structure/templates:** report fields, audience redaction, escaping, catalog links/identity and status precedence are asserted structurally, not via brittle whole-page snapshots.
- **Failure states:** unavailable app/provider, timeout, stale revision, partial data, denied scope and corrupted/missing optional source data return typed outcomes while unrelated profiles/capabilities continue.

No test should require a live HH/Weeek provider or live LLM. Live provider canary is a separate later gate with a dedicated test account and reviewed rollback.
