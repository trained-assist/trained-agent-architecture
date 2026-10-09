# Sandbox bootstrap review handoff — 2026-10-09

## Executive status

### Latest review and reconciliation — 2026-10-09 00:40 UTC

- The one-click CP bootstrap did pass on retry: workflow `37863096019`, source `d560e05680eca19e67b9eff9ff78153b8b6f32cc`; sanitized artifact reports all bootstrap boundaries `PASS`, including remote D1 migration check, deploy, paired mock credential provisioning, and authenticated CP→Runner probe. The live sandbox `/healthz` currently reports the same `buildSha`. It reuses only the stable mock admission `run_7abdc2d9-86c3-4b3b-b832-2d7e666633ef` (`succeeded / pong`), creates no CP task/Workflow, and makes no Worker/model call. An earlier invocation failed at `sandboxMigrations` with `command_failed:npx`; a later rerun passed, but the earlier failure cause was not captured.
- Runner PR #211 combines the mock-test bootstrap with the already-merged delegated-profile API and is merged as `ab8e7a3da4efa45c2154d67423542a6974576f22`. Its head passed CI and capability probe. Review found a rollback gap in the installer's already-current branch; commit `9e2f103e1818066440e4c484b4c25e295b5e8` restores the prior sandbox EnvironmentFile and restarts from it if enabling mock mode or health verification fails. Local verification passed: typecheck, 67 test files / 852 passed / 3 skipped, shell syntax and diff checks. The service was not restarted.
- A signed API candidate build from merged `main` is queued as workflow run `37865618383`; building the artifact does not install or restart the service.
- Fresh read-only CP D1 evidence for task `ut-d3d9da86f5c09f27be7d` is `failed/finished`, execution `failed`, error class `MCP_ENDPOINT_NOT_ALLOWED` (query at 2026-10-09 00:32 UTC). The related Runner API run is `run_2fbbb5f2-aa68-412e-982f-091d112e0150`. Its last authenticated API status recorded in this handoff was `queued` at 00:24 UTC; the latest VM2 admission-journal inspection still finds the accepted record but no terminal status/event. The API status was not re-read in this turn because the ordinary profile credential was not available through an authorized read-only probe. Therefore the CP/Runner discrepancy remains unresolved; do not restart or install over the shared API service.
- The configured native Worker was queried read-only with its service-held token for that exact run ID and returned HTTP 200 / `unknown`. VM2 still points to release `41d3c06cdb95d0a62bf7525a66c91ad3acdeabf8`; API journal logs show only authenticated GET status/events through 00:23 UTC and no terminal event. This narrows the observation to “Worker has no known record, Runner API admission remains accepted”; it does not prove the queued API admission cannot later dispatch, so it is still unsafe to restart.
- The old admission `run_683d964a-3e4f-4885-a058-a0541dfd8c05` remains unknown. Neither record was retried, cancelled, deleted or reset. No production service or Telegram route changed.
- Signed candidate for merged Runner main is verified: workflow `37865618383`, source `ab8e7a3da4efa45c2154d67423542a6974576f22`, artifact SHA-256 `42adc29e0ed20125c8703d661694c36fca59667e8294132c723cee0f0080ed4a`; GitHub attestation verification passed. It remains uninstalled pending safe reconciliation/isolation.

**CP → Runner `mock-test` probe: PASS in the named sandbox.** The CP endpoint completed an authenticated submit/status/result loop and returned `succeeded / pong`; a second call with the same idempotency key returned the same Runner run. Runner logs show one `accepted` and one `duplicate`. No CP task/Workflow or external Worker/model call was made. The first live request exposed the safe validation path `spec.repository.fullName`: the Runner injected its unrelated default external repository into the internal mock RunSpec. Runner PR #210 head `41d3c06` now omits that binding for `mock-test`; a signed candidate was installed only to `agent-runner-api-mcp-test.service`.

**A real Telegram → CP → Runner → Worker task remains BLOCKED.** Historical CP/Runner unknown records were not read to terminal, replayed, deleted, or reset. The existing CP readiness endpoint still blocks its shared profile at 94 tasks / 55 nonterminal. The direct diagnostic avoids that D1/Workflow lane and does not prove real Worker execution or Telegram delivery. The known chat's collector check was reported clear earlier; no new collector-state read was needed for this mock probe.

**CP's standard main push also deployed its separate production Worker** at commit `d0624cb245e34069238eb18fdd6163f758d13b72`, version `aec04963-f003-4259-a99f-36afe270e16a`. The production config has `PREVIEW_ONLY=true`, `PILOT_ENABLED=false`, and `ROUTER_AGENT_ALLOWED=false`; the protected smoke passed liveness and confirmed unauthenticated private reads return 401. This did not connect the Telegram bot or change its UI/routing.

### Current evidence addendum (2026-10-09)

| Boundary | Result | Evidence / limit |
| --- | --- | --- |
| CP sandbox deploy | **PASS** at Worker version `966a60f3-0e91-41c7-bc70-fe63532267b1`. The Worker is live; liveness is healthy. | Exact target was `trained-assist-cp-telegram-ux-v1-sandbox`. The stock deploy script stopped at read-only readiness with `sandbox_lane_has_nonterminal_task` (94 total / 55 nonterminal), before its legacy intake smoke. The independent mock endpoint remains callable. |
| CP → Runner mock-test | **PASS**, HTTP 200, `succeeded`, answer `pong`, result `succeeded`. | Runner run `run_7abdc2d9-86c3-4b3b-b832-2d7e666633ef`; no CP task/Workflow and no external Worker/model call. The same-key repeat returned the same run; Runner journal recorded `duplicate`. |
| Runner test service | **PASS** at source `41d3c06cdb95d0a62bf7525a66c91ad3acdeabf8`, candidate workflow `37857941797`, installed only to `agent-runner-api-mcp-test.service`. | Runner CI and capability probe passed. The previously unknown Runner admission was not touched. The mock admission is one synthetic tenant/profile record. |
| Validation diagnosis | **Fixed** in Runner PR #210. | CP exposed only `runnerErrorCode` and a sanitized `runnerErrorFields` allowlist; the field was `spec.repository.fullName`. Runner's internal `mock-test` executor now skips the irrelevant `RUNNER_DEFAULT_REPO`. Raw error messages remain hidden by CP. |
| CP code/release | CP PR #149 merged as `d0624cb`; push CI, staging deploy/smoke, and protected production deploy/smoke succeeded. | CP production is a preview-only isolated target, not the Telegram bot. Production Worker version and flags are recorded above. |
| Shared Telegram profile readiness | **BLOCKED**, unchanged at 94 total / 55 nonterminal. | No shared row, Workflow, Runner admission, or collector state was reset, deleted, or replayed. |
| Real Telegram UX | **NOT PROVEN**. | No Telegram message or user-facing run was sent. The old production bot UI/routing remains a separate unresolved rollout result. |

The mock credential was generated in memory and stored only in the dedicated CP sandbox secret; Runner received only its hash in the isolated registry. Evidence contains no credential values. The ordinary Telegram UX Runner key was not replaced.

## Issues and PRs

| Owner | Issue / PR | Current state and scope |
| --- | --- | --- |
| Architecture | [#231](https://github.com/trained-assist/trained-agent-architecture/issues/231) / [#232](https://github.com/trained-assist/trained-agent-architecture/pull/232) | Issue open; scenario PR draft. Defines paired credentials, separate probes, state reconciliation, evidence, cleanup and rollback. Scenario source and this refreshed handoff are in this branch. PR head is updated with this commit. |
| CP | [#147](https://github.com/trained-assist/trained-assist-control-plane/issues/147), [#148](https://github.com/trained-assist/trained-assist-control-plane/pull/148), [#149](https://github.com/trained-assist/trained-assist-control-plane/pull/149), [#152](https://github.com/trained-assist/trained-assist-control-plane/pull/152) | #148/#149/#152 merged. One-click bootstrap workflow `37863096019` passed all recorded boundaries on source `d560e05680eca19e67b9eff9ff78153b8b6f32cc`; deployed sandbox `/healthz` matches that SHA. The stable synthetic mock admission returns `succeeded / pong`; no CP task/Workflow or Worker/model call. CP #147 remains open for real profile reachability and broader readiness. |
| Runner API contract and principal isolation | [#209](https://github.com/trained-assist/ai-agent-runner/issues/209) / [#211](https://github.com/trained-assist/ai-agent-runner/pull/211) | #211 merged as `ab8e7a3`; it combines #208/#210 mock-test and delegated-profile support, hash-only synthetic principal provisioning, and omission of the external default repository for mock-test. CI and capability probe pass. Existing sandbox service still runs the earlier `41d3c06` candidate. Signed main candidate `ab8e7a3` is built and verified (run `37865618383`) but not installed because the accepted Runner admission has no terminal evidence. |
| Architecture mock contract | [#229](https://github.com/trained-assist/trained-agent-architecture/issues/229) / [#230](https://github.com/trained-assist/trained-agent-architecture/pull/230) | Scenario PR #230 merged. The real deployed Telegram → CP → Runner `pong` acceptance remains pending. |
| End-to-end/state recovery | [Architecture #190](https://github.com/trained-assist/trained-agent-architecture/issues/190) | Open. Contains the stale CP/Runner records and current operator evidence summarized below. |
| Runner sandbox | [Runner #173](https://github.com/trained-assist/ai-agent-runner/issues/173) | Open. VM2 now has a separately installed API candidate; still reconcile the issue’s declared deployment/ownership contract and avoid treating candidate health as full E2E. |
| Telegram test ingress | [Telegram #402](https://github.com/trained-assist/trained-assist-tg-bot/issues/402) | Open; anonymous seed/SSE/lane lease is a separate future ingress convenience, not required to call the authenticated CP mock diagnostic endpoint. |
| Adjacent CP contracts | [CP #143](https://github.com/trained-assist/trained-assist-control-plane/pull/143), [#144](https://github.com/trained-assist/trained-assist-control-plane/pull/144) | Both open, checks/context pass. Engine selection and RunSpec alignment affect later ordinary task routing; mock diagnostic explicitly selects `mock-test`. |
| Broader rollout/deploy tracking | [Architecture #185](https://github.com/trained-assist/trained-agent-architecture/issues/185), [#220](https://github.com/trained-assist/trained-agent-architecture/issues/220) | Open; sandbox rollout and deploy coverage remain broader work. |

## Earlier independently reported live evidence (2026-10-09, partly superseded)

The following read-only evidence was supplied by the owner before the CP→Runner mock endpoint was deployed. It remains useful for Worker/MCP boundaries and old-state limits; its CP→Runner UNKNOWN row and “mock bindings not provisioned” wording are superseded by the current evidence addendum above.

| Boundary/resource | Result | Limit |
| --- | --- | --- |
| VM2 `agent-runner-api-mcp-test.service` | **PASS candidate health**. Release `3088bc742c0403ded85dc4d72705b46dfd139c7b`; `/healthz` `ok`; native Worker backend configured; no restart; logs show `runs=1`, `admissions=4`. | This does not show that live CP `RUNNER_API_URL` points here or that CP key authenticates here. |
| VM2 API → native Worker | **PASS auth/reachability**. Read-only status calls for `run_683…`, `run_d26…`, and an unknown ID returned HTTP 200 / `status=unknown`, using protected API env credentials. | `unknown` is not terminal success/failure and does not authorize replay. This verifies the currently used API→Worker token pair but does not identify which stored secret name supplied its value. |
| CP → Runner API, ordinary Telegram key | **UNKNOWN** in this earlier inspection. The current separate mock credential path is now verified by the live synthetic probe above. | The ordinary key/URL pairing was not used or changed by the mock probe. |
| Runner → MCP Host discovery | **PASS read-only discovery**. HTTP 200 returned pinned `registry.fixture_read` using the Runner test token. | Discovery did not invoke a tool. |
| Telegram `/collector-state` for known chat | **PASS / clear**. HTTP 200 with `buf=[]`, `launching=[]`, `busy=false`, `unresolvedLaunchCount=0`. | A different chat still needs explicit allowlisting/profile mapping. No reset is needed for the inspected chat. |
| Cloudflare names-only inventory | **PASS names-only** on expected account `typeformowner@gmail.com`, ID `d740a05e9442c1d0feacae2dfc673e93`. | The mock key is now paired and used only by the dedicated CP sandbox binding; values were not read or reported. |

Credential names on the Runner→Worker path are `EXTERNAL_WORKER_URL` and `EXTERNAL_WORKER_TOKEN` in the protected API environment. The live HTTP 200 proves the pair in use authorizes status reads; it does not establish the rotation owner or raw value. The mock probe must use a distinct Runner API principal/key and must not replace the ordinary Telegram UX key.

## Old state: unresolved, but isolated mock does not use it

- CP task `ut-ae3470440c4e3427f947`, run/session `run_d26d2fe8-d6cb-44e2-bf15-6561a8e16ed7`: Workflow is terminated, but CP D1 remains `running/unknown`. Seven other unfinished profile rows map to errored Workflows while D1 retains nonterminal/unknown state.
- Runner admission `run_683d964a-3e4f-4885-a0541dfd8c05`: restore of an old queued admission failed to reattach its legacy MCP binding; Runner marked it `unknown` with `mcp_restore_tool_outcome_unknown`. Its journal remains intact.
- The Quick Tunnel API journal and the VM2 candidate journal differ. VM2's API does not know the old `run_683…`; that is not evidence of terminal outcome.
- CP's dedicated mock probe (CP #148/#149) bypasses CP D1/Workflow and uses Runner's synthetic tenant/profile. PR #210's cross-profile regression checks the old Telegram admission stays unchanged and cannot be read/cancelled by the mock principal. Mock mode does not call Worker/model/profile workspace.
- The Runner admission journal and active-run cap remain shared at service level. The reported cap is 200; before the probe VM2 showed one run and four admissions. The mock call added one fixed-idempotency synthetic admission; the repeat deduplicated to it.

Therefore the historical unknown records do **not** block the isolated `mock-test` diagnostic, which has now passed on a distinct synthetic principal. They **do** block reuse of the ordinary shared Telegram profile and any assumption that the old real run completed. Do not reset, delete, or retry them.

## Credential readiness matrix

| Hop | Names/owner | Status |
| --- | --- | --- |
| Test principal → CP | `PRINCIPAL_SECRET_TELEGRAM_UX`; operator Keychain copy and CP sandbox Worker secret | Names-only inventory confirms the Worker binding; the two values were not compared. |
| CP → Runner API, ordinary Telegram | `RUNNER_API_URL`, `RUNNER_API_KEY_TELEGRAM_UX`; CP Worker → Runner API registry | Names confirmed. Current deployed endpoint/key pairing remains unknown; keep this credential untouched during mock setup. |
| CP → Runner API, mock probe | `SANDBOX_RUNNER_MOCK_TEST_URL`, `RUNNER_API_KEY_TELEGRAM_UX_MOCK_TEST`; CP Worker → fixed Runner synthetic tenant/profile registry | Dedicated URL and key are paired; live `pong` and idempotent duplicate verified. The URL is code-pinned and validated against the sandbox endpoint. The ordinary Telegram UX key remains unchanged. |
| Runner API → native Worker | `EXTERNAL_WORKER_URL`, `EXTERNAL_WORKER_TOKEN`; protected VM2 API environment → Worker | Authenticated status 200 proves current reachability. The old run outcome remains unknown. Not used by mock-test. |
| Runner → MCP Host discovery | Runner test token → Host `trained-assist-mcp-host-test-160` | HTTP 200 read-only discovery recorded. `tools/call` not tested. Not needed by synthetic `mock-test`. |
| CP → Communication service | `COMMUNICATION_TOKEN`, service binding | Config names exist; live auth not independently probed in this handoff. Not used by mock probe. |
| CP → Ingress Buffer | `INGRESS_BUFFER_TOKEN`, service binding | Contract/config names exist; live artifact auth not probed. Not needed for plain-text mock probe. |
| Runner → Model Ladder | `LLM_LADDER_TOKEN`; GCP Secret Manager is documented source | Not probed and intentionally unused by mock-test. |
| Telegram ingress → Telegram API | `TG_SANDBOX_BOT_TOKEN` on `trained-assist-tg-ux-sandbox` (`@probability_cat_bot`) | Name is declared by the sandbox gateway code/docs. Names-only inventory was reported for the ingress Worker; no value was read. |
| Telegram ingress → CP | `CONTROL_PLANE_SERVICE` binding and Telegram Worker config; native Worker tokens above | Known chat is mapped and collector currently clear. A newly selected chat needs allowlist/profile mapping. Not needed by CP's direct authenticated diagnostic call. |

Secret values were not read or placed in this report. Names-only inventory and an auth response prove different things; the report keeps those claims separate.

## Remaining gates and safe order

1. Keep signed candidate `ab8e7a3` uninstalled until the historical accepted Runner admission below is terminally reconciled or the candidate moves to a genuinely separate API journal/service.
2. Record semantic conformity for architecture #231 as `PASS` only after independent review of the latest scenario/handoff and component contracts. The existing handoff must not be treated as acceptance merely because CP→Runner mock passes.
3. Reconcile the ordinary Telegram profile's CP task/workflow and Runner records by authoritative stable-ID reads or provision a genuinely separate CP state + Runner/Worker lane. Current CP D1 says `ut-d3d9da86f5c09f27be7d` failed with `MCP_ENDPOINT_NOT_ALLOWED`, while its Runner run `run_2fbbb5f2-aa68-412e-982f-091d112e0150` last read as queued with no terminal journal event. Do not restart the service, reset, delete, cancel, or replay the accepted work to make readiness green. CP readiness remains 94/55.
4. Prove a real sandbox Worker run using a safe isolated profile/lane, then correlate one Telegram marker through ingress → CP task/Workflow → Runner admission → Worker result → terminal Telegram delivery. The mock `pong` deliberately does not establish this path.
5. Audit the production deployment route. CP `main` now auto-deploys through its protected staging→production workflow; that deployed target is preview-only and not the legacy bot. Any future bot cutover must identify its actual runtime, webhook, and promotion gate rather than infer it from CP liveness.

## Prompt for the next independent review

> Review architecture issue #231 and draft PR #232 plus the owning CP #147/#149, Runner #209/#210 and #208 contracts against the latest evidence in this handoff. Verify the CP→Runner sandbox probe’s credential ownership and target pinning; the Runner fix for `spec.repository.fullName`; the same-idempotency accepted/duplicate evidence; CP sandbox and preview-only production revisions; and whether any acceptance statement overclaims real Telegram→Worker behavior. Reconcile contradictory older text in #190/#231. Give each architecture gate `PASS`, `FAIL`, or `UNCLEAR`, quote the specific evidence/revision that supports it, identify only actionable remaining blockers, and propose the next single safe step. Do not mutate credentials, submit a user task, replay/reset/delete old work, or touch production.

Architecture gates: component CI and CP→Runner `mock-test` sandbox E2E pass. Semantic conformity is not yet recorded as `PASS`; the real Telegram → CP → Runner → Worker E2E is still pending. The production CP preview target has a passing deployment smoke, but that does not constitute bot cutover.

The separate preview-only CP production target was updated by the protected main workflow. No production Telegram bot route, user-facing pilot, webhook, or Telegram credential was changed. This report does not claim full scenario acceptance.
