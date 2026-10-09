# Telegram Agent Run through Cloudflare Runner API to the France worker

- **Scenario ID:** OPS-RUNNER-DEFAULT-01
- **Status:** target; implementation and sandbox acceptance pending
- **Implementation:** [Runner API PR #227](https://github.com/trained-assist/ai-agent-runner/pull/227); [Control Plane PR #181](https://github.com/trained-assist/trained-assist-control-plane/pull/181)
- **Actors:** Telegram gateway, Control Plane, Serverless Runner API, France execution worker, sandbox operator/acceptance agent
- **Boundary:** the Control Plane submits an authenticated run to the Cloudflare Runner API. The API admits and places the run, then dispatches it to the France worker. The Control Plane never calls a physical worker or launcher.
- **Related contracts:** [Architecture §0/§2/§4.6](../../ARCHITECTURE.md), [Serverless Runner API](../../SERVERLESS-AGENT-API.md), [C04](../../contracts/README.md#c04--placement-и-execution-runner), [Runner mock test](SC-OPS-RUNNER-MOCK-TEST.md)

## Preconditions

1. The Runner API is deployed as a Cloudflare Worker with durable receipt/admission state and authenticated worker callbacks.
2. The CP Runner binding points to that Cloudflare Runner API endpoint only. CP configuration/secrets contain no France VM URL/token and no GHA gateway/workflow URL/token.
3. Trusted Runner API policy selects the existing France worker by default for ordinary Telegram Agent Runs. GHA is not an implicit fallback.
4. The France worker exposes the authenticated Runner worker contract, reports its worker identity/region/release, and supports the required engine, isolation, persistence and cancellation policy.
5. The test profile is isolated, free-only, and has a known admission/run journal and Telegram delivery target.

## Main flow

1. The allowlisted user sends a unique free-only text request to the sandbox Telegram bot.
2. Telegram gateway submits it to the sandbox Control Plane. CP records the user task and starts one attempt through the Serverless Runner API contract.
3. CP sends one authenticated Run request to the Cloudflare Runner API, with stable task/run/attempt IDs, trusted profile/policy references, limits and idempotency key. CP does not send a VM address or launcher name.
4. Runner API authenticates and authorizes CP, applies idempotent admission, selects the France worker under trusted policy, and dispatches the attempt through its worker adapter.
5. France worker records the same attempt identity, starts one Agent clean room/engine, and reports progress and terminal result to Runner API through authenticated callbacks/status updates.
6. Runner API returns/replays status, result and artifact references to CP. CP commits the terminal task state and the Telegram gateway delivers the answer.

## Failure behavior

- A missing or invalid CP API credential fails at the Cloudflare Runner API boundary; it does not reach the France worker.
- If the France worker is unavailable, Runner API reports a typed unavailable/unknown state and reconciles the same attempt. It does not silently invoke GHA or another launcher.
- A timeout after dispatch remains unknown until the same worker attempt is reconciled; no new run is created automatically.
- Duplicate CP submission with the same idempotency key returns the original receipt and does not start a second worker process.
- Any direct CP request to a VM, GHA gateway/workflow, or worker-specific endpoint is an architecture violation and fails deployment/configuration review.

## Acceptance evidence

- Source/config audit of the deployed CP proves its only Agent Run destination is the Cloudflare Runner API; CP bindings/secrets contain no worker or launcher endpoint/credential.
- Runner API deployment evidence proves Cloudflare Worker runtime and durable admission/status bindings.
- A bounded authenticated component probe proves API admission, policy selection of the France worker, worker identity/region, and callback/result reconciliation for one stable attempt ID.
- A deployed Telegram E2E proves one free-only request reaches the France worker and returns the terminal answer; correlated CP/Runner/worker revisions and task/run/attempt IDs are recorded.
- Evidence shows exactly one France worker admission and no GHA workflow run. Worker-unavailable and duplicate-submit probes prove no fallback and no duplicate execution.
- `mock-test` success is reported separately and is not evidence of worker selection or real agent execution.

