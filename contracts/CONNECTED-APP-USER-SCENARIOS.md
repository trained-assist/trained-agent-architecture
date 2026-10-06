# Connected Web Apps — user scenario map

Status: source-informed scenario baseline · 2026-10-06. This describes workflows visible in inspected source and a target experience for the agent's user. It is not proof every path is deployed or currently used. Scenario priority by frequency/value must be confirmed from product usage; the current code alone does not provide that evidence.

## Product outcome and shared contract

The user and the selected profile are the through-line. The user can work through the agent, open a connected web app to inspect or edit richer domain state, and return to the agent; supported handoffs resolve to the same authorized profile and canonical domain object. The app provides a useful workspace around the user's work. The agent remains the user's conversational coordinator and invokes only app capabilities needed by the scenario.

The target authority and separate browser, agent-relay and schedule handoffs are specified in [CONNECTED-APP-IDENTITY-TARGET.md](CONNECTED-APP-IDENTITY-TARGET.md).

Every scenario below inherits these rules:

1. The Agent identity/profile authority authenticates the agent user, owns user-to-profile membership and the active profile selection, and supplies a short-lived trusted principal/profile assertion. The Control Plane brokers app-specific grants and tokens from that assertion. The model and browser cannot choose or override identity fields.
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

**Acceptance examples:** no active vacancy asks the user to choose; stale cached data is labeled; a response not found live is not silently presented as current; a deleted/other-profile vacancy is inaccessible; observed pages deduplicate repeated HH IDs and disclose incomplete/best-effort pagination; the UI and agent agree on candidate state/revision without claiming a gap-free provider snapshot.

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

**Journey:** recruiter configures a cold-search schedule for a vacancy → at its local scheduled time the worker searches HH using that profile's token, ATS criteria and saved queries → persists the collected and deduplicated candidate pool in one atomic snapshot before marking its IDs seen → the user opens the existing `/hh/proactive` page and sees newly discovered candidates with search freshness, counts and an explicit assessment status → a bounded background scorer evaluates pending candidates in the same store → the user can also start a manual search or update candidate query/comment/status/import through `/api/hh/proactive/*`.

**Minimum app responsibilities:** profile/vacancy-scoped schedule definitions and timezone; one scheduler owner; durable unique occurrence `(legacy_job_id, scheduled_at)`, lease/no-overlap and coalesced missed runs; HH execution worker and credential boundary; versioned vacancy criteria, comments and query cache; profile-bound seen IDs, shared candidates with vacancy-specific review state, and snapshots; resumable status/results; the existing page and needed API actions; a durable, bounded assessment backlog with `assessment_pending`, completed and typed failure states; coordinated background rescoring; audit and reconciliation for uncertain runs. Scheduled and manual paths must call the same canonical search handler and write the same data model. A candidate may appear under more than one vacancy; legacy candidates without vacancy IDs require an explicit import decision.

**Acceptance examples:** the user sees newly found candidates after a scheduled run while previously accumulated candidates and vacancy-specific review state remain visible; the latest snapshot supplies search freshness, query/page coverage, counts and a separate assessment progress/failure indicator; the page/API/manual search retain their public paths and read/write the same profile-owned results; all pages in the recorded query set are collected within the provider's observable pagination boundary before an atomic discovery snapshot and its seen IDs are committed; a budget stop, provider failure or incomplete window leaves the prior accepted snapshot intact and the attempted run visibly incomplete; assessment limits never silently mark candidates scored or hide pending candidates; a schedule is unique per vacancy and preserves its `Europe/Moscow` timing; duplicate timer delivery or overlapping invocation runs one occurrence; missed runs are coalesced rather than replayed as a burst; a changed comment/query/criteria revision is visible; profile B cannot see A's token, candidates, history or schedule; old unknown outcomes are reconciled before any replay; the five-minute rescore writer is migrated or stopped only after its final delta is reconciled; no required route, worker, schedule or data read calls the retiring GCP host. MCP parity applies to manual-run/result-read only if those operations are declared agent capabilities.

**Cutover gate:** HH cold search must work end to end outside the retiring GCP VM. Legacy schedules remain paused until a new worker, data, credentials and routes are accepted; ambiguous occurrences are reconciled before any replay. The verified target and feature-specific exclusions are owned by [HH #187](https://github.com/trained-assist/trained-assist-hh-skill/issues/187); the independent host gate is [GCP exit #145](https://github.com/trained-assist/trained-agent-architecture/issues/145).

**Source and ownership boundary:** `trained-assist-hh-skill/src/hh-cold-search-cron.js` schedules searches; `hh-proactive-search.js` owns HH calls and candidate state; `hh-routes.js` serves the current page/API; a separate five-minute scorer writes evaluations. The public `/hh/proactive` and `/api/hh/proactive/*` paths must keep working after routing to a verified non-GCP service. Source evidence and migration receipts are tracked in [HH #187](https://github.com/trained-assist/trained-assist-hh-skill/issues/187) and the application PRs linked there. Provider pagination is best effort: deduplicate observed candidates and disclose incomplete windows; do not promise a gap-free snapshot when HH cannot supply one.

**HH-only exit acceptance:** Restore and receipt-bind the owned profile/vacancy/ATS/query/credential and candidate state; quarantine and reconcile ambiguous legacy occurrences before replay. Prove an entire manual search and scheduled occurrence through the same handler/store, atomic discovery snapshot, durable assessment backlog, existing page/API and required agent-exposed capabilities, with source revisions and no GCP call. Search freshness means the recorded query set reached its observable HH pagination boundary and was committed atomically; it does not assert a gap-free HH view or that every candidate has completed ATS assessment. Prove duplicate timer delivery and restart do not repeat effects. Confirm one successful cycle for each required schedule, including the natural full cycle of the rarest cadence, before declaring this path accepted. Controlled-clock recurrence tests and a bounded real timer/provider/restart canary are separate evidence; a proposed shorter equivalent requires the owner's explicit decision. The target must be verified and follow feature-specific owner constraints; see HH #187. CRM readiness does not gate this HH path.

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
| HH scheduled/manual cold search, scoring, seen state, comments/status/import, results page/API and background rescoring | R-03 | Yes — required for GCP exit acceptance | Verified non-GCP target, profile data/credentials, durable schedule dedupe, routing, unknown-outcome reconciliation and background-writer handoff; Cloud Run excluded |
| Client HTML/Markdown/JSON report and v2 evaluation rendering | R-04 | Yes | Unify formats, compose Hermes with report flow, publication/auth and client lifecycle |
| Vacancy creation/edit/publish; candidate documents/interview transcription/evaluation | Not a named scenario yet | No | Confirm whether these are in current must-migrate scope; add cards before extracting their logic |
| Campaign/outbound sales follow-up and other lead automation in `flexi-crm-automation` | Not a named scenario yet | No | Establish current user value/active workflow; do not silently absorb the entire repo |

The map is sufficiently complete for the five outcomes the user named: exhibition catalog use, deal creation, response work, cold search and client report preparation, including key prerequisites, state and failure paths. It is not a complete inventory of every capability in the source repositories: the explicit “not yet” rows and general CRM tools need a product scope decision before claiming all legacy functionality has migrated. No reliable usage-frequency data was found, so scenario order is a risk/tractability proposal, not a measured priority ranking.

**Real web identity is an implementation gate:** a web session must be established by the Agent-owned identity/profile authority and resolved server-side to principal/profile; the Control Plane then brokers a client/audience-bound app session. A browser-supplied profile ID or legacy profile cookie is never proof of identity. Synthetic tests may inject a fake signed-assertion verifier at the external Agent authority boundary; production issuance remains disabled until Agent membership evidence and the CP adapter are reviewed.

## Method ownership rule

The logical operation names above are proposals for app-owned domain API operations, not a demand to create one MCP tool per operation. Add or change a domain method at the app owner when the user scenario needs a stable query/command, authorization rule or invariant that belongs with app data. The agent capability owner maps a subset of those methods to tool names and JSON payload schemas. The existing agent/runtime relay transports that payload unchanged. A UI-only action remains a UI concern; provider-specific HTTP remains in the app integration adapter. The scenario matrix and contract tests prove each mapping and identify a true missing method without turning MCP into the business-logic layer.

## Implementation order and status sources

Each app is migrated and accepted through its own user journey. CRM S-01 catalog reads and S-04 reviewed deal creation have separate source/identity/provider gates. Recruiting R-01 responses, R-02 actions and R-04 reports are independent foundations; R-03 morning cold search is the urgent HH operational path. The agent may consume declared app capabilities, but UI navigation and scheduled execution call app handlers directly. A working app path never requires an Agent Run.

Operational status, receipts and PR chronology live with the owning issues and PRs: [HH #187](https://github.com/trained-assist/trained-assist-hh-skill/issues/187), [GCP exit #145](https://github.com/trained-assist/trained-agent-architecture/issues/145), [CRM Web PRs](https://github.com/flexi-consulting/crm-web/pulls), [Recruiting Web PRs](https://github.com/trained-assist/trained-assist-recruiting-web/pulls) and [Control Plane PRs](https://github.com/trained-assist/trained-assist-control-plane/pulls). Their green offline checks do not establish live provider, identity, routing or scheduled-cycle acceptance. The C14 work order remains [IMPLEMENTATION-AND-INTEGRATION-PLAN.md](../IMPLEMENTATION-AND-INTEGRATION-PLAN.md).

## Test scenarios derived from these journeys

The shared synthetic fixtures cover two principals/profiles, overlapping catalog names, duplicate/unsafe IDs, one private note, one reviewed deal with unknown provider outcome, two vacancies, changed resume/criteria revisions, one prior unknown schedule outcome, seen/candidate/snapshot revisions, and one internal-only report field. Keep all identifiers and content invented; private migration exports remain outside Git.

Test topology for every scenario: real UI/API/event/schedule entrypoint → real domain handler → disposable persistence. Replace only external HH/Weeek/model/network ports, clock and other external dependencies with stateful fakes. Expected outcomes come from independently reviewed invariants and golden fixtures, not output generated by the implementation under test. A fixed model recipe can return a fixture proposal, then the real validator handles it. Block Agent Run launch and external egress with separate assertions.

For each declared **agent-exposed** capability only, add real MCP facade/transport discovery, wire serialization and schema/version validation, then call the same domain handler. Compare object identity, revision, typed result and permitted side effects with its UI/API path. A page filter, browser navigation or timer tick needs its own entrypoint test, not an invented MCP tool. Assert meaningful effect dependencies and counts; avoid brittle exact order for independent provider calls.

Acceptance checks include profile/object isolation; confirmed writes, idempotency and unknown-outcome reconciliation; template structure and escaping; partial provider data; stale revisions; unavailable authorization/provider; and restart. Report domain/offline transport/live integration readiness separately. HH response pagination is best effort: tests can require stable deduplication of observed rows and honest incompleteness, but cannot claim gap-free provider snapshots without provider support.
