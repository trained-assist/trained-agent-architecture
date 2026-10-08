# Sandbox bootstrap review handoff — 2026-10-09

## Executive status

**CP → Runner `mock-test` probe: implementation is reviewable; credential pairing and deployment are still required.** CP PR #148 now has a dedicated sandbox-only mock probe using a separate URL/key/expected-host binding, explicit `mock-test`, fixed idempotency, and a `pong` result check. Runner PR #210 gives the probe its own synthetic tenant/profile, separate from the legacy Telegram UX profile. Latest CI checks are green. No new probe/task was sent and no credential was provisioned by this work.

**A real Telegram → CP → Runner → Worker task remains BLOCKED.** The shared CP records and old Runner admission remain unknown; do not replay/delete/reset them. The Telegram collector-state check is now clean for the known chat, so that is no longer the current blocker for that chat.

## Issues and PRs

| Owner | Issue / PR | Current state and scope |
| --- | --- | --- |
| Architecture | [#231](https://github.com/trained-assist/trained-agent-architecture/issues/231) / [#232](https://github.com/trained-assist/trained-agent-architecture/pull/232) | Issue open; scenario PR draft. Defines paired credentials, separate probes, state reconciliation, evidence, cleanup and rollback. Scenario source and handoff are in this branch. PR head `16cfd411a240592312599150ebec0df1afc11b4d`; checks pass. |
| CP | [#147](https://github.com/trained-assist/trained-assist-control-plane/issues/147) / [#148](https://github.com/trained-assist/trained-assist-control-plane/pull/148) | Issue open; PR open, checks/context pass. Head `0d10734d4ab003e482ee547722ef141d96de0736`. Adds ordinary profile readiness plus `POST /internal/sandbox/runner-mock-probe`: separate mock URL/key/expected host, HMAC auth, explicit `mock-test`, fixed idempotency, status/result `pong`; no CP D1/Workflow task or Worker/model call. Creates one synthetic Runner admission record. New mock bindings have not been provisioned. |
| Runner API contract | [#208](https://github.com/trained-assist/ai-agent-runner/pull/208) | Open, non-draft, head `1070ede19ed32d0c57738e5cf9c4eaf49fe339b6`; checks/probe pass. Adds authenticated sandbox `mock-test` contract. |
| Runner principal isolation | [#209](https://github.com/trained-assist/ai-agent-runner/issues/209) / [#210](https://github.com/trained-assist/ai-agent-runner/pull/210) | Issue open; PR draft, head `f8e8d9b0987f5e6ffbc78470a4a872f6620cdb2a`; checks/probe pass. Based on open #208. Adds hash-only principal provisioning and a separate synthetic tenant/profile. Cross-profile regression proves mock result/status/cancel cannot inspect or change the old Telegram UX admission. Candidate is not deployed. |
| Architecture mock contract | [#229](https://github.com/trained-assist/trained-agent-architecture/issues/229) / [#230](https://github.com/trained-assist/trained-agent-architecture/pull/230) | Scenario PR #230 merged. The real deployed Telegram → CP → Runner `pong` acceptance remains pending. |
| End-to-end/state recovery | [Architecture #190](https://github.com/trained-assist/trained-agent-architecture/issues/190) | Open. Contains the stale CP/Runner records and current operator evidence summarized below. |
| Runner sandbox | [Runner #173](https://github.com/trained-assist/ai-agent-runner/issues/173) | Open. VM2 now has a separately installed API candidate; still reconcile the issue’s declared deployment/ownership contract and avoid treating candidate health as full E2E. |
| Telegram test ingress | [Telegram #402](https://github.com/trained-assist/trained-assist-tg-bot/issues/402) | Open; anonymous seed/SSE/lane lease is a separate future ingress convenience, not required to call the authenticated CP mock diagnostic endpoint. |
| Adjacent CP contracts | [CP #143](https://github.com/trained-assist/trained-assist-control-plane/pull/143), [#144](https://github.com/trained-assist/trained-assist-control-plane/pull/144) | Both open, checks/context pass. Engine selection and RunSpec alignment affect later ordinary task routing; mock diagnostic explicitly selects `mock-test`. |
| Broader rollout/deploy tracking | [Architecture #185](https://github.com/trained-assist/trained-agent-architecture/issues/185), [#220](https://github.com/trained-assist/trained-agent-architecture/issues/220) | Open; sandbox rollout and deploy coverage remain broader work. |

## Latest independently reported live evidence

The following read-only evidence was supplied by the owner on 2026-10-09. It supersedes older comments in #190 that said the collector was unverified or VM2 was not a candidate. No new run, reset, configuration change, restart, or secret-value read was part of that inspection.

| Boundary/resource | Result | Limit |
| --- | --- | --- |
| VM2 `agent-runner-api-mcp-test.service` | **PASS candidate health**. Release `3088bc742c0403ded85dc4d72705b46dfd139c7b`; `/healthz` `ok`; native Worker backend configured; no restart; logs show `runs=1`, `admissions=4`. | This does not show that live CP `RUNNER_API_URL` points here or that CP key authenticates here. |
| VM2 API → native Worker | **PASS auth/reachability**. Read-only status calls for `run_683…`, `run_d26…`, and an unknown ID returned HTTP 200 / `status=unknown`, using protected API env credentials. | `unknown` is not terminal success/failure and does not authorize replay. This verifies the currently used API→Worker token pair but does not identify which stored secret name supplied its value. |
| CP → Runner API | **UNKNOWN**. CP deployment version `56b612d8-798e-4a62-b780-c4d9e8a9bc9a` is confirmed, but deployed URL/key values are not observable. A saved local CP set points at the old Quick Tunnel; that API has a different journal and does not know `run_683…`. | Do not infer the live Worker binding from a local config snapshot. The separate new mock endpoint in PR #148 is designed to establish this boundary after its mock bindings are provisioned and deployed. |
| Runner → MCP Host discovery | **PASS read-only discovery**. HTTP 200 returned pinned `registry.fixture_read` using the Runner test token. | Discovery did not invoke a tool. |
| Telegram `/collector-state` for known chat | **PASS / clear**. HTTP 200 with `buf=[]`, `launching=[]`, `busy=false`, `unresolvedLaunchCount=0`. | A different chat still needs explicit allowlisting/profile mapping. No reset is needed for the inspected chat. |
| Cloudflare names-only inventory | **PASS names-only** on expected account `typeformowner@gmail.com`, ID `d740a05e9442c1d0feacae2dfc673e93`. CP contains `RUNNER_API_URL` and `RUNNER_API_KEY_TELEGRAM_UX`; native Worker inventory has `WORKER_TOKEN_TELEGRAM_UX` and `WORKER_TOKEN_MCP_TEST`. | Values were not read. The dedicated mock bindings `RUNNER_API_URL_TELEGRAM_UX_MOCK_TEST`, `RUNNER_API_KEY_TELEGRAM_UX_MOCK_TEST`, and `RUNNER_API_HOST_TELEGRAM_UX_MOCK_TEST` are not provisioned yet. |

Credential names on the Runner→Worker path are `EXTERNAL_WORKER_URL` and `EXTERNAL_WORKER_TOKEN` in the protected API environment. The live HTTP 200 proves the pair in use authorizes status reads; it does not establish the rotation owner or raw value. The mock probe must use a distinct Runner API principal/key and must not replace the ordinary Telegram UX key.

## Old state: unresolved, but isolated mock does not use it

- CP task `ut-ae3470440c4e3427f947`, run/session `run_d26d2fe8-d6cb-44e2-bf15-6561a8e16ed7`: Workflow is terminated, but CP D1 remains `running/unknown`. Seven other unfinished profile rows map to errored Workflows while D1 retains nonterminal/unknown state.
- Runner admission `run_683d964a-3e4f-4885-a0541dfd8c05`: restore of an old queued admission failed to reattach its legacy MCP binding; Runner marked it `unknown` with `mcp_restore_tool_outcome_unknown`. Its journal remains intact.
- The Quick Tunnel API journal and the VM2 candidate journal differ. VM2's API does not know the old `run_683…`; that is not evidence of terminal outcome.
- CP #148's dedicated mock probe bypasses CP D1/Workflow and uses Runner's synthetic tenant/profile. PR #210's cross-profile regression checks the old Telegram admission stays unchanged and cannot be read/cancelled by the mock principal. Mock mode does not call Worker/model/profile workspace.
- The Runner admission journal and active-run cap remain shared at service level. The reported cap is 200; VM2 showed one run and four admissions, so current inspection did not indicate capacity exhaustion. The mock call will persist one fixed-idempotency synthetic admission and repeats should deduplicate to that record.

Therefore the historical unknown records do **not** by themselves block the isolated `mock-test` diagnostic, once code is reviewed/deployed and its separate key pair exists. They **do** block reuse of the ordinary shared Telegram profile and any assumption that the old real run completed. Do not reset, delete, or retry them.

## Credential readiness matrix

| Hop | Names/owner | Status |
| --- | --- | --- |
| Test principal → CP | `PRINCIPAL_SECRET_TELEGRAM_UX`; operator Keychain copy and CP sandbox Worker secret | Names-only inventory confirms the Worker binding; the two values were not compared. |
| CP → Runner API, ordinary Telegram | `RUNNER_API_URL`, `RUNNER_API_KEY_TELEGRAM_UX`; CP Worker → Runner API registry | Names confirmed. Current deployed endpoint/key pairing remains unknown; keep this credential untouched during mock setup. |
| CP → Runner API, mock probe | `RUNNER_API_URL_TELEGRAM_UX_MOCK_TEST`, `RUNNER_API_KEY_TELEGRAM_UX_MOCK_TEST`, `RUNNER_API_HOST_TELEGRAM_UX_MOCK_TEST`; CP Worker → fixed Runner synthetic tenant/profile registry | Code and names are in CP #148. Values/registry hash have not been paired; provisioning and deploy are the next gate. The host binding pins the exact allowed host before the API key is sent. |
| Runner API → native Worker | `EXTERNAL_WORKER_URL`, `EXTERNAL_WORKER_TOKEN`; protected VM2 API environment → Worker | Authenticated status 200 proves current reachability. The old run outcome remains unknown. Not used by mock-test. |
| Runner → MCP Host discovery | Runner test token → Host `trained-assist-mcp-host-test-160` | HTTP 200 read-only discovery recorded. `tools/call` not tested. Not needed by synthetic `mock-test`. |
| CP → Communication service | `COMMUNICATION_TOKEN`, service binding | Config names exist; live auth not independently probed in this handoff. Not used by mock probe. |
| CP → Ingress Buffer | `INGRESS_BUFFER_TOKEN`, service binding | Contract/config names exist; live artifact auth not probed. Not needed for plain-text mock probe. |
| Runner → Model Ladder | `LLM_LADDER_TOKEN`; GCP Secret Manager is documented source | Not probed and intentionally unused by mock-test. |
| Telegram ingress → Telegram API | `TG_SANDBOX_BOT_TOKEN` on `trained-assist-tg-ux-sandbox` (`@probability_cat_bot`) | Name is declared by the sandbox gateway code/docs. Names-only inventory was reported for the ingress Worker; no value was read. |
| Telegram ingress → CP | `CONTROL_PLANE_SERVICE` binding and Telegram Worker config; native Worker tokens above | Known chat is mapped and collector currently clear. A newly selected chat needs allowlist/profile mapping. Not needed by CP's direct authenticated diagnostic call. |

Secret values were not read or placed in this report. Names-only inventory and an auth response prove different things; the report keeps those claims separate.

## Remaining gates and safe order

1. Review/merge Runner #208 and its dependent #210 through repository policy; #210 must remain based on #208 until intentionally retargeted. Then deploy the signed candidate to the exact VM2 test service using Runner's documented installer/rollback path, not a production service. Verify health and fixed mock identity only; do not submit the CP probe before the matching key is provisioned.
2. Review/merge CP #148. Provision one random mock API key in the approved secure process: send only its SHA-256 hash to the Runner root-only helper and put the raw key only into `RUNNER_API_KEY_TELEGRAM_UX_MOCK_TEST` on the pinned CP sandbox Worker. Set/verify its URL and exact expected-host binding. Keep `RUNNER_API_KEY_TELEGRAM_UX` unchanged. Record secret names and result, never values.
3. Call the CP diagnostic endpoint once with the fixed sandbox caller auth. Expect HTTP 200 with `mock-test`, `succeeded`, `pong`, no CP task/Workflow, no Worker/model call, and one synthetic Runner admission. Verify the admission is in the synthetic tenant/profile and repeat only to confirm idempotent deduplication. This is the safe first end-to-end API-boundary probe.
4. Keep the ordinary Telegram profile blocked until its CP/Runner records are authoritatively reconciled or an independent CP state/Runner/Worker lane is provisioned. The clean collector snapshot removes one blocker for the inspected chat, not the stale CP/Runner records.
5. For actual Worker execution, separately prove the task’s terminal outcome or allocate an isolated execution profile/worker namespace. Do not treat Worker status HTTP 200 with `unknown` as terminal evidence.
6. Only after the intended ordinary path is isolated/reconciled, send one unique Telegram marker through an allowlisted chat and correlate ingress update → CP task/workflow → Runner admission → Worker result → terminal delivery.

Architecture gates: CP/Runner component CI is green; semantic conformity is not yet recorded as `PASS`; the isolated CP → Runner mock probe has not yet been deployed/run; generated Telegram full-stack E2E is pending. Local unit tests and read-only status probes are not staging E2E.

No production mutation occurred. This report records the owner-provided live evidence and the current PR heads; it does not claim all live credentials are paired or that full scenario acceptance has passed.
