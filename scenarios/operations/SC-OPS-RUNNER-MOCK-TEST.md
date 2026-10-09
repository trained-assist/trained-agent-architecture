# Authenticated mock-test through the Runner API

- **Scenario ID:** OPS-RUNNER-TEST-01
- **Status:** target; implementation and sandbox acceptance pending
- **Issue:** [#229](https://github.com/trained-assist/trained-agent-architecture/issues/229)
- **Actors:** Control Plane, Runner API, sandbox operator or acceptance agent
- **Boundary:** an authenticated API caller submits a normal run request and receives a deterministic contract response without starting an Agent.
- **Architecture boundary:** Runner API is a Cloudflare Worker; Control Plane calls only that API. Worker placement and execution are covered separately by [OPS-RUNNER-DEFAULT-01](SC-OPS-RUNNER-DEFAULT-01-serverless-to-france-worker.md).
- **Related work:** Telegram E2E [#190](https://github.com/trained-assist/trained-agent-architecture/issues/190); CP engine delegation [PR #143](https://github.com/trained-assist/trained-assist-control-plane/pull/143); CP RunSpec alignment [PR #144](https://github.com/trained-assist/trained-assist-control-plane/pull/144); Runner API [#202](https://github.com/trained-assist/ai-agent-runner/pull/202).

## Preconditions

1. Runner API exposes the standard authenticated run contract from Cloudflare and declares engine selection in its capabilities.
2. The sandbox API explicitly enables the `mock-test` engine. It is disabled by default and cannot be enabled in production configuration.
3. For this isolated scenario CP may request only the trusted `mock-test` fixture. Ordinary Agent Runs omit physical engine/worker selection; Runner API applies its trusted engine and placement policy. User text cannot select an engine or worker.

## Main flow

1. CP submits a normal Agent API request with `engine.name = "mock-test"` and the same identity, task, limits, and idempotency fields as an ordinary run.
2. Runner API authenticates and authorizes the caller, validates the full request schema and limits, and applies ordinary idempotent admission.
3. Runner API accepts the request and records a deterministic synthetic terminal result, for example `pong` with a `mock-test` marker.
4. CP observes the ordinary receipt, terminal status, result, and replayable events, then returns the synthetic result through the configured sandbox channel.
5. No model/provider, external worker, profile workspace, or repository side effect is invoked.
6. When CP omits `engine`, Runner API selects from its configured and principal-authorized automatic engine chain. CP does not know where a selected worker runs.

## Failure behavior

- Missing, invalid, or under-scoped credentials receive the standard authentication/authorization failure; no receipt or run is created.
- Malformed requests and invalid limits receive the standard validation failure.
- A request for `mock-test` while disabled or in a production deployment is rejected; it never falls back to a real engine.
- Duplicate idempotency requests return the original receipt/result and do not create a second mock run.
- An omitted engine with no eligible automatic chain fails with the standard engine-selection error.

## Acceptance evidence

- Component probes prove auth success/failure, request validation, disabled-mode rejection, idempotency, terminal result and replay, and zero external-worker/model calls.
- Generated E2E proves sandbox Telegram → CP → Runner API `mock-test` → terminal `pong` delivery against deployed revisions.
- A separate free-only real-agent scenario proves automatic selection; a `mock-test` pass is not evidence that a real Agent can execute.
- Production deployment and webhook changes are outside this scenario.

### Sandbox evidence — 2026-10-10

The isolated CP sandbox3 lane was first found on an older CP build. Its mock probe failed closed on the deployed-source mismatch and created no replacement run. After deploying the protected `main` revision `91f34d866904d837b03a4f6d73ff40bd6748538d` through the sandbox3 deployment workflow, the dedicated `sandbox3-cp-mock-probe` workflow passed ([run 38005617050](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38005617050)). The probe returned the deterministic terminal `pong` result through the CP-to-Runner API adapter; its contract reports no CP task, model call, or France worker execution. The workflow's scoped cleanup also passed.

The same CP revision is live in staging and the isolated production Worker. Their exact-SHA deployment smoke checks passed for liveness and anonymous private-read rejection. This records deployment health only; the mock probe is sandbox-only and neither test establishes real Agent execution or authorizes a Telegram route cutover. The full Telegram-to-CP-to-Runner sandbox E2E and free-only real-Agent scenario remain unverified.

### Follow-up deployment evidence — 2026-10-10

After Control Plane PR #202 updated the pinned sandbox VM2 host key, the protected `main` workflow passed all checks and deployed `f3fb0d1463deb4000ae033f486bc03a5d8b22acc` through staging to production ([run 38006376177](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38006376177)). Both deployment smoke steps passed. Independent exact-SHA smokes also passed against both endpoints, each reporting healthy liveness and anonymous private-read HTTP 401. The sandbox Telegram UX preflight passed with the refreshed host pin ([run 38006382927](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38006382927)).

A fresh sandbox3 mock-probe/preflight run for this revision ([run 38006662817](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38006662817)) passed, including its scoped cleanup. Real VM execution is still blocked: the latest VM drift check reports France unreachable and Russia on signed release v0.3.1, and production remains execution-disabled. This evidence does not verify the full Telegram → CP → Runner → Agent user flow.
