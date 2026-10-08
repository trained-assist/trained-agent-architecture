# Sandbox bootstrap review handoff — 2026-10-09

## Decision summary

**Overall lane status: BLOCKED for a new full E2E run.** The code and auth plumbing have useful passing evidence, but the shared CP profile and Runner admission contain old unknown work, and the Telegram collector ownership check returns 403. Do not send another task/message through this shared lane until those records are reconciled or a genuinely isolated lane is provisioned.

The architecture contract is in [SC-OPS-SANDBOX-BOOTSTRAP](../../scenarios/operations/SC-OPS-SANDBOX-BOOTSTRAP.md), tracked by [architecture #231](https://github.com/trained-assist/trained-agent-architecture/issues/231) and [draft PR #232](https://github.com/trained-assist/trained-agent-architecture/pull/232). This handoff gathers the implementation slices and observed gates for review. It does not claim that bootstrap acceptance is complete.

## Implementation map

| Owner | Issue / PR | Current state | What it provides |
| --- | --- | --- | --- |
| Architecture | [#231](https://github.com/trained-assist/trained-agent-architecture/issues/231) / [#232](https://github.com/trained-assist/trained-agent-architecture/pull/232) | Issue open; scenario PR draft | Full target contract: credential pairing, independent boundary probes, prior-state reconciliation, sanitized evidence, safe cleanup and rollback. Acceptance remains open. Scenario revision `ed3eb07c45a68f126dace04770fd34d19fd6f149`. |
| Control Plane | [#147](https://github.com/trained-assist/trained-assist-control-plane/issues/147) / [#148](https://github.com/trained-assist/trained-assist-control-plane/pull/148) | Issue open; implementation PR open, CI green | Authenticated read-only `/internal/sandbox/readiness`; fixed principal/profile and intake/read scopes; blocks when that profile has nonterminal D1 tasks. PR head `a423da979c7488463777bcb8e740dec7f7e6e7db`. It does not generate or pair a Runner key and does not probe Runner/Host/Worker. |
| Runner | [#209](https://github.com/trained-assist/ai-agent-runner/issues/209) / [#210](https://github.com/trained-assist/ai-agent-runner/pull/210) | Issue open; draft PR, checks and probe green | Sandbox-only `mock-test` service candidate and root-only hash provisioner for a fixed principal. PR head `252e805196eb3ab640d0e15d1f7cfdf28a6dea92`, based on still-open [Runner API PR #208](https://github.com/trained-assist/ai-agent-runner/pull/208). Not deployed. The helper accepts a hash; it does not generate or deliver the raw API key. |
| Runner mock contract | [Architecture #229](https://github.com/trained-assist/trained-agent-architecture/issues/229) / [#230](https://github.com/trained-assist/trained-agent-architecture/pull/230) | Scenario PR merged; issue acceptance still open | Defines authenticated `mock-test` returning deterministic `pong` without model/worker side effects. Component CI is green in Runner #208; Telegram → CP → Runner `pong` has not been accepted end to end. |

Related active tracking: [architecture #190](https://github.com/trained-assist/trained-agent-architecture/issues/190) (Telegram E2E and stale-state recovery), [architecture #185](https://github.com/trained-assist/trained-agent-architecture/issues/185) (sandbox rollout), [architecture #220](https://github.com/trained-assist/trained-agent-architecture/issues/220) (deployment coverage), [Runner #173](https://github.com/trained-assist/ai-agent-runner/issues/173) (reproducible Runner sandbox), [CP #138](https://github.com/trained-assist/trained-assist-control-plane/issues/138) (safe profile-readiness reasons), and [Telegram #402](https://github.com/trained-assist/trained-assist-tg-bot/issues/402) (anonymous test ingress/feed). CP [#143](https://github.com/trained-assist/trained-assist-control-plane/pull/143) and [#144](https://github.com/trained-assist/trained-assist-control-plane/pull/144) are open, CI-green contract changes for API-owned engine selection and RunSpec alignment; review them alongside any full-stack run because they affect the CP/Runner boundary.

## What has been verified

- CP PR #148: CI `check` and Repository context pass. Local typecheck, focused readiness tests (6 passed), evidence sanitizer, and Wrangler dry-run pass. The full local `npm run check` did not complete cleanly: workerd Workflow tests emitted runtime hang/termination failures.
- Runner PR #210: both checks and sandbox probe pass. Runner PR #208's checks and probe also pass. Those are code/component checks, not a live deployed CP→Runner `pong` test.
- Architecture PR #232's repository gates pass; it remains draft because scenario acceptance evidence is incomplete.
- A prior read-only/operator record in architecture #190 reports, on 2026-10-08, a deployed native Worker sandbox version `dca42ffe-1fa5-42a2-92f6-8639cb098f07`; authenticated Worker status returned 200 for an unknown ID, and Runner → MCP Host discovery returned 200 for pinned `registry.fixture_read`. These probes establish auth/reachability for those specific requests only; the Worker status request did not execute a task, and Host discovery did not invoke a tool.
- Cloudflare identity was checked in this review session: `typeformowner@gmail.com`, account `d740a05e9442c1d0feacae2dfc673e93`. A names-only `wrangler secret list --config wrangler.telegram-ux-v1.jsonc` attempt failed on network connectivity. No secret values were read.

Architecture acceptance gates are not all met: semantic conformity has not yet been recorded as `PASS`; component CI passes but CP→Runner mock-test and some live credential inventory are still unknown; generated Telegram → CP → Runner E2E has not run because the shared lane is blocked. Local tests are not staging E2E.

## Credential and API boundary inventory

| Boundary | Credential/config names found | Evidence and current confidence |
| --- | --- | --- |
| Test client/operator → CP | `PRINCIPAL_SECRET_TELEGRAM_UX`; macOS Keychain service `trained-assist-cp-test-principal-hmac-v1`, account `integration-telegram-ux-v1`; Worker secret with same name | Repository custody and deploy flow are documented. Historical authenticated CP smoke exists. Current live Worker secret inventory could not be fetched; exact current pairing is not independently confirmed here. |
| CP → Runner API | CP Worker secret `RUNNER_API_KEY_TELEGRAM_UX`; Runner sandbox key registry | Historical #190 evidence first recorded `runner_rejected` for a scoped key, then said credentials were repaired and CP pointed at the isolated API. No later explicit successful CP→Runner API request/`pong` is recorded in the inspected evidence. Mark **UNKNOWN; retest required**. The value is not available from Wrangler config, and secret inventory failed. |
| Runner → native execution Worker | Runner's profile-scoped API credential; Worker endpoint and status API | Historical #190 reports version `dca42ffe-1fa5-42a2-92f6-8639cb098f07` and authenticated status HTTP 200. This is a reachability/auth probe only, not a successful new execution. |
| Runner → MCP Host discovery | Runner test token; Host `MCP_TEST_AUTH_TOKEN`, plus Host principal/expiry/public JWK settings | Historical #190 reports HTTP 200 and pinned `registry.fixture_read`. Discovery is verified for that event; actual `tools/call` is not. Host expiry/JWK settings are not fully represented in checked-in deployment config per CP's discovery contract. |
| CP → Host discovery | CP test Host service binding and discovery credential/config | Repository docs declare the boundary, but no independent current live probe was found in the inspected evidence. Do not infer it from Runner → Host success. |
| CP → Communication service | `COMMUNICATION_TOKEN`, `COMMUNICATION_SERVICE` binding | Names/binding are present in CP source/config; live credential presence and auth were not verified. Not required for the pure Runner mock `pong`, but required by the configured communication route. |
| CP → Ingress Buffer | `INGRESS_BUFFER_TOKEN`, `INGRESS_BUFFER` binding | Contract and target names are documented; no live authenticated artifact request was run in this review. This is an attachment/artifact boundary, not needed for plain-text mock readiness. |
| Runner → Model Ladder | `LLM_LADDER_TOKEN` in sandbox allowlist; GCP Secret Manager is the documented canonical source | Config/ownership are documented; actual availability was not probed. This is explicitly outside `mock-test`; needed only for a separately approved real model run. |
| Telegram test ingress → CP | Telegram bot identity/webhook secret and sandbox Worker config | Two ingress bots are documented in #190, but both feed the same CP/D1/Workflow/Runner lane. They are alternate ingress paths, not independent full-stack lanes. |

Secret values were not copied, printed, or compared. `UNKNOWN` means evidence is absent or stale; it is not a claim that the credential is missing.

## Hard blockers before the next task/run

1. **Shared CP state is unresolved.** Architecture #190 identifies task `ut-ae3470440c4e3427f947`, run/session `run_d26d2fe8-d6cb-44e2-bf15-6561a8e16ed7`; its Workflow is Terminated while D1 still shows `running/unknown`. Seven other unfinished profile rows map to Errored Workflows while D1 remains nonterminal/unknown.
2. **Runner admission is unknown.** `run_683d964a-3e4f-4885-a0541dfd8c05` resumed from an old queued admission; MCP restore could not reattach its legacy binding, and Runner marked outcome `unknown` (`mcp_restore_tool_outcome_unknown`). Keep admission/journal intact; no replay or delete.
3. **Telegram collector ownership/occupancy is not verified.** Protected collector-state currently returns 403 for the known test chat, so it cannot prove that input buffer/launch state is empty.
4. **CP→Runner authentication has no current explicit pass evidence.** Earlier mismatch/rejection and later repair notes need a fresh read-only authenticated probe that returns the `mock-test` acceptance/result contract. Do not submit a new run until the prior records above are reconciled or an independent lane is approved.
5. **The key bootstrap code is incomplete.** CP PR #148 is readiness only. Runner #210 stores a supplied hash only. No single operation currently generates one key in memory, synchronizes the hash to Runner and raw key to the exact CP Worker secret, verifies both sides, and safely rolls back partial rotation.
6. **Live secret inventory is unavailable from this review session.** Cloudflare account identity is correct, but Wrangler's names-only secret listing failed on connectivity. Re-run the names-only inventory and each boundary probe once connectivity is available; never retrieve secret values.
7. **No clean independent lane is provisioned.** If shared unknown work cannot be authoritatively reconciled, provision a new disposable profile with separate CP state/Workflow, Runner admission namespace, and Telegram collector mapping. Merely using the second bot does not isolate downstream resources.

Do not clear D1, terminate Workflows to make rows look clean, delete Runner admissions, or retry task IDs above. A new run needs a documented reconciliation outcome or proof that all downstream state is isolated.

## Review and run order

1. Review CP #148 and Runner #210 as component slices; keep Runner #210 based on #208 until its branch relationship is intentionally updated.
2. Reconcile CP/Workflow/Runner/collector state by exact IDs, or authorize a genuinely isolated fresh lane with named resources and owners.
3. Verify names/owners for required external credentials, then run read-only CP→Runner `mock-test`, Runner→Worker auth, and Runner→MCP discovery probes separately. Keep `mock-test` free of model/provider calls.
4. Only after all those gates pass, send one uniquely marked Telegram test through a claimed lane and correlate gateway update → CP task/run → Runner admission → Worker result → terminal Telegram delivery.
5. Attach sanitized evidence and exact revisions to architecture #231/PR #232. Leave architecture PR #232 open until all scenario acceptance gates pass.

No production deployment or secret mutation was made for this review handoff. Earlier sandbox changes above are cited from the dated evidence in architecture #190.
