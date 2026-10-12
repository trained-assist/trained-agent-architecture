# Telegram Agent Run through Cloudflare Runner API with France primary and GHA backup

- **Scenario ID:** OPS-RUNNER-DEFAULT-01
- **Status:** partial sandbox acceptance; Worker-driven CP→Runner→delivery scenarios pass; real Telegram webhook ingress and placement/failover acceptance remain pending
- **Implementation:** existing CP→Runner foundation [Runner API PR #227](https://github.com/trained-assist/ai-agent-runner/pull/227) / [Control Plane PR #181](https://github.com/trained-assist/trained-assist-control-plane/pull/181); failover implementation [Runner #264](https://github.com/trained-assist/ai-agent-runner/issues/264), GHA Agent Run worker/config integration [gha-compute-cluster #1](https://github.com/vovalikessmoothy-png/gha-compute-cluster/issues/1)
- **Actors:** Telegram gateway, Control Plane, Serverless Runner API, France execution worker, sandbox operator/acceptance agent
- **Boundary:** the Control Plane submits an authenticated run to the Cloudflare Runner API. The API admits and places the run, trying France first and GHA only after a verified pre-admission refusal. The Control Plane never calls a physical worker or launcher.
- **Related contracts:** [Architecture §0/§2/§4.6](../../ARCHITECTURE.md), [Serverless Runner API](../../SERVERLESS-AGENT-API.md), [C04](../../contracts/README.md#c04--placement-и-execution-runner), [Runner mock test](SC-OPS-RUNNER-MOCK-TEST.md)

## Current implementation baseline

The existing OpenCode GHA execution path has a successful direct Runner API execution recorded in [workflow run 37859213470](https://github.com/vovalikessmoothy-png/opencode-gha-runner/actions/runs/37859213470). That proves one bounded Agent Run reached a terminal answer through the worker gateway and GHA job. It does not prove a raw GHA invocation independent of the gateway, the current Cloudflare Runner integration, or the Telegram/CP queue path. The live Cloudflare Runner sandbox currently pins execution to France and has no GHA fallback. The private `gha-env-config` repository is outside the accepted task-workspace contract; only the GHA execution context may read it, and only as non-secret runtime configuration. Neither CP, Runner API, nor France VM may know or read it. Do not implement a second OpenCode GHA worker: use the existing worker path and verify it in stages below.

## Ordered execution gates

Run and record these gates in order. A passing later gate cannot replace evidence for an earlier boundary:

1. **Direct GHA execution:** run a bounded synthetic task directly on the intended GHA execution path, without Control Plane, Runner API, or task queue. Verify the task workspace is separate from the runner/config checkout, the configured model responds, and the run reaches a terminal result with cleanup.
2. **GHA worker API:** submit the same class of synthetic task directly to the existing authenticated GHA worker API, bypassing the Control Plane queue. Verify idempotent receipt, status/result retrieval, cancellation/reconciliation behavior, and that only the GHA worker reads `gha-env-config`.
3. **Control Plane queue:** submit a user-shaped task through Telegram → CP task/queue → Cloudflare Runner API. Verify task/run/attempt correlation, result delivery, and queue cleanup.
4. **Placement/failover:** with the previous gates passing, verify France success is primary; one GHA dispatch follows a typed pre-admission France refusal; France acceptance, timeout, lost response, and unknown outcome never launch a second worker.

## Historical sandbox evidence (2026-10-10)

This snapshot predates the current sandbox3 evidence below. Its statements
about absent live admission and execution are historical.

- CP sandbox3 is deployed at `a853df9d8a8a4b8d45d5098a7c5c3077fd357260`; its `RUNNER_API_SERVICE` binding and URL target the dedicated Cloudflare Runner API Worker `trained-assist-runner-api-sandbox3`.
- The live Runner API health response reports Cloudflare Worker placement and `eu-vm-agent-run`. Its API admission and France execution are not yet verified for the sandbox3 profile.
- `trained-assist-runner-api-cp-sandbox3` is a separate mock-only endpoint for the CP contract probe. That probe returned `pong` with no CP task and no model/worker call. It is not evidence for this scenario's main flow.
- At that 2026-10-10 snapshot, the sandbox3 execution flags were disabled and no task was submitted. Later evidence below supersedes that state: the isolated profile is enabled and bounded sandbox Runs now pass through the deployed CP → Cloudflare Runner API path.
- Cross-repository checkpoint and workflow evidence: [architecture #185](https://github.com/trained-assist/trained-agent-architecture/issues/185), [CP #159](https://github.com/trained-assist/trained-assist-control-plane/issues/159), [CP PR #218](https://github.com/trained-assist/trained-assist-control-plane/pull/218), [CP PR #219](https://github.com/trained-assist/trained-assist-control-plane/pull/219).

## Latest sandbox evidence (2026-10-12)

The isolated CP/Runner auth and delegated-profile preflight passed in [run
38183877096](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38183877096).
Worker-driven scenarios then passed through the deployed gateway handler → CP
→ Cloudflare Runner API → execution → Telegram outbound delivery:

- `history`: [run 38184012532](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38184012532), two distinct successful runs, follow-up recalled prior-turn data, and both answers had Telegram provider receipts.
- `retry-mid-run`: [run 38184339598](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38184339598), duplicate update replayed during active execution produced exactly one task, one execution, and one delivery.
- `file-intake`: [run 38184624993](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38184624993), the controlled file fixture passed media intake, artifact/manifest persistence, Runner processing and one Telegram delivery. Telegram `getFile` bytes were mocked.
- `playwright-artifact` capture: [run 38228110321](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38228110321), one successful Runner execution returned the requested Example Domain title/marker and persisted manifests for `browser-check.md` and `browser-proof.png`. The harness did not download artifact bytes, so screenshot validity and artifact delivery are not yet established by this run.
- `playwright-artifact` Telegram delivery: [run 38228860714](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38228860714), one successful Runner execution persisted both artifact manifests and the sandbox Intake owner sent `browser-check.md` and `browser-proof.png` once each to the pinned sandbox chat, with a provider message ID for each. This run's communication selector timed out and correctly fell back to Agent execution; the Agent task completed and artifacts were sent. The artifact bytes were not fetched and inspected after export, so screenshot validity remains unverified.

The E2E runs began and ended with empty CP and Telegram Intake state and
restored the normal sandbox delivery policy. The Worker harness does not
exercise the real Telegram webhook; the file fixture also does not prove an
actual Bot API `getFile` request. The CP execution record's `cloudflare-workflows`
value identifies orchestration, not physical worker placement. Per-run France
identity, France-first refusal semantics, and GHA failover remain unproven.
Current CP sandbox3 configuration has `PREVIEW_ONLY=false`,
`PILOT_ENABLED=true`, `ROUTER_AGENT_ALLOWED=true`, with the pilot cohort scoped
to `integration-sandbox3-v1`; this supersedes the disabled-gate statement in
the historical 2026-10-10 snapshot above.
See the [sanitized acceptance record](../../docs/reviews/SANDBOX3-E2E-ACCEPTANCE-2026-10-12.md).

The signed candidate at [Runner workflow 37865618383](https://github.com/trained-assist/ai-agent-runner/actions/runs/37865618383)
targets legacy `agent-runner-api-sandbox`; its VM installer workflow is disabled
and retired. It is not a candidate for the Cloudflare Worker API in this
scenario and must not be installed into a VM or substituted for that Worker.

## Preconditions

1. The Runner API is deployed as a Cloudflare Worker with durable receipt/admission state and authenticated worker callbacks.
2. The CP Runner binding points to that Cloudflare Runner API endpoint only. CP configuration/secrets contain no France VM URL/token and no GHA gateway/workflow URL/token.
3. Trusted Runner API policy selects the existing France worker first for ordinary Telegram Agent Runs. It may select GHA only when France explicitly refuses before admission; timeout, lost response, accepted receipt, or unknown state never trigger a second execution.
4. The private GHA environment/config repository is read only by the GHA worker from its own trusted GitHub execution context. Neither CP, Runner API nor France VM knows its URL, token or contents; it is not the run's source repository/workspace.
5. The France worker exposes the authenticated Runner worker contract, reports its worker identity/region/release, and supports the required engine, isolation, persistence and cancellation policy.
6. The test profile is isolated, free-only, and has a known admission/run journal and Telegram delivery target.

## Main flow

1. The allowlisted user sends a unique free-only text request to the sandbox Telegram bot.
2. Telegram gateway submits it to the sandbox Control Plane. CP records the user task and starts one attempt through the Serverless Runner API contract.
3. CP sends one authenticated Run request to the Cloudflare Runner API, with stable task/run/attempt IDs, trusted profile/policy references, limits and idempotency key. CP does not send a VM address or launcher name.
4. Runner API authenticates and authorizes CP, applies idempotent admission, selects the France worker under trusted policy, and dispatches the attempt through its worker adapter.
5. France worker records the attempt identity, starts one Agent clean room/engine, and reports progress and terminal result to Runner API through authenticated callbacks/status updates. If it refuses before admission, Runner API may dispatch the same not-started attempt to GHA, which reports through the same contract.
6. Runner API returns/replays status, result and artifact references to CP. CP commits the terminal task state and the Telegram gateway delivers the answer.

## Failure behavior

- A missing or invalid CP API credential fails at the Cloudflare Runner API boundary; it does not reach the France worker.
- If France refuses before admission, Runner API records the refusal and may attempt GHA once. If France times out, accepts, or its state is unknown, Runner API reconciles that same attempt and does not start a second worker.
- A timeout after dispatch remains unknown until the same worker attempt is reconciled; no new run is created automatically.
- Duplicate CP submission with the same idempotency key returns the original receipt and does not start a second worker process.
- Any direct CP request to a VM, GHA gateway/workflow, or worker-specific endpoint is an architecture violation and fails deployment/configuration review.

## Acceptance evidence

- Source/config audit of the deployed CP proves its only Agent Run destination is the Cloudflare Runner API; CP bindings/secrets contain no worker or launcher endpoint/credential.
- Runner API deployment evidence proves Cloudflare Worker runtime and durable admission/status bindings.
- Gate 1 records the exact GHA repository/workflow/revision, synthetic task ID, model, terminal answer, artifact/workspace boundary, and cleanup.
- Gate 2 records the API endpoint/revision, idempotency key, accepted receipt, terminal result, cancellation/reconciliation probes, and isolated config-repository read evidence.
- Gate 3 records the CP/Runner revisions and correlated task/run/attempt IDs, terminal Telegram delivery, and queue cleanup.
- Gate 4 proves France-first selection, one GHA dispatch only after an explicit pre-admission refusal, and no GHA dispatch after accepted/unknown France outcomes. Duplicate-submit and lost-response probes prove no duplicate execution. France, Runner API and CP have no config-repository binding.
- `mock-test` success is reported separately and is not evidence of worker selection or real agent execution.

