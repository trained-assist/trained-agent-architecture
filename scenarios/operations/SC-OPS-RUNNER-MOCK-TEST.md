# Authenticated mock-test through the Runner API

- **Scenario ID:** OPS-RUNNER-TEST-01
- **Status:** target; implementation and sandbox acceptance pending
- **Issue:** [#229](https://github.com/trained-assist/trained-agent-architecture/issues/229)
- **Actors:** Control Plane, Runner API, sandbox operator or acceptance agent
- **Boundary:** an authenticated API caller submits a normal run request and receives a deterministic contract response without starting an Agent.
- **Related work:** Telegram E2E [#190](https://github.com/trained-assist/trained-agent-architecture/issues/190); CP engine delegation [PR #143](https://github.com/trained-assist/trained-assist-control-plane/pull/143); CP RunSpec alignment [PR #144](https://github.com/trained-assist/trained-assist-control-plane/pull/144); Runner API [#202](https://github.com/trained-assist/ai-agent-runner/pull/202).

## Preconditions

1. Runner API exposes the standard authenticated run contract and declares engine selection in its capabilities.
2. The sandbox API explicitly enables the `mock-test` engine. It is disabled by default and cannot be enabled in production configuration.
3. The CP selects the engine only from trusted sandbox configuration. User text cannot select an engine.

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
