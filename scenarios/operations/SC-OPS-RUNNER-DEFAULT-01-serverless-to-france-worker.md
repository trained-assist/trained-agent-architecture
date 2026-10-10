# Telegram Agent Run through Cloudflare Runner API with France primary and GHA backup

- **Scenario ID:** OPS-RUNNER-DEFAULT-01
- **Status:** target; implementation and sandbox acceptance pending
- **Implementation:** existing CP→Runner foundation [Runner API PR #227](https://github.com/trained-assist/ai-agent-runner/pull/227) / [Control Plane PR #181](https://github.com/trained-assist/trained-assist-control-plane/pull/181); failover implementation [Runner #264](https://github.com/trained-assist/ai-agent-runner/issues/264), GHA Agent Run worker/config integration [gha-compute-cluster #1](https://github.com/vovalikessmoothy-png/gha-compute-cluster/issues/1)
- **Actors:** Telegram gateway, Control Plane, Serverless Runner API, France execution worker, sandbox operator/acceptance agent
- **Boundary:** the Control Plane submits an authenticated run to the Cloudflare Runner API. The API admits and places the run, trying France first and GHA only after a verified pre-admission refusal. The Control Plane never calls a physical worker or launcher.
- **Related contracts:** [Architecture §0/§2/§4.6](../../ARCHITECTURE.md), [Serverless Runner API](../../SERVERLESS-AGENT-API.md), [C04](../../contracts/README.md#c04--placement-и-execution-runner), [Runner mock test](SC-OPS-RUNNER-MOCK-TEST.md)

## Current implementation baseline

The live Cloudflare Runner sandbox currently pins execution to France and has no GHA fallback. Its Telegram UX profile is also coupled to a private placeholder repository that is mounted as a task workspace; this coupling is not part of the target contract and must be removed. The placeholder is to be renamed `vovalikessmoothy-png/gha-env-config` and used only by the GHA runner for non-secret environment/config files, never by CP, Runner API, or France VM. Current `gha-compute-cluster` main contains a generic inference queue/worker, not an Agent Run dispatch adapter or a checkout of that private config repo. Therefore this target is architectural direction, not an implemented or accepted failover path.

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
- A bounded authenticated component probe proves API admission, policy selection of the France worker, worker identity/region, and callback/result reconciliation for one stable attempt ID.
- A deployed Telegram E2E proves one free-only request reaches the France worker and returns the terminal answer; correlated CP/Runner/worker revisions and task/run/attempt IDs are recorded.
- Evidence proves France-first selection, one GHA dispatch only after an explicit pre-admission refusal, and no GHA dispatch after accepted/unknown France outcomes. Duplicate-submit and lost-response probes prove no duplicate execution. GHA worker evidence shows it alone reads the private GHA config repository; France, Runner API and CP have no config-repository binding.
- `mock-test` success is reported separately and is not evidence of worker selection or real agent execution.

