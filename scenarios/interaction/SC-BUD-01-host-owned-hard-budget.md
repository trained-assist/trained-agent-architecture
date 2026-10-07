# SC-BUD-01 — Host-owned hard budget for sandbox agent execution

**Status:** target; architecture change #200. Agent execution remains disabled for anonymous sandbox requests until the hard-budget and isolated-Runner gates pass. Related ingress scenario: [SC-SBX-01](SC-SBX-01-anonymous-test-ingress.md). Implementation issues: [ai-agent-runner#182](https://github.com/trained-assist/ai-agent-runner/issues/182), [trained-assist-control-plane#125](https://github.com/trained-assist/trained-assist-control-plane/issues/125), [trained-assist-communication-skills#37](https://github.com/trained-assist/trained-assist-communication-skills/issues/37), [trained-assist-llm-ladder#152](https://github.com/trained-assist/trained-assist-llm-ladder/issues/152), [trained-assist-tg-bot#402](https://github.com/trained-assist/trained-assist-tg-bot/issues/402).

## Actors and goal

A sandbox QA client submits a synthetic task without Telegram chat ID or user credentials. Control Plane routes it and Runner executes it under a platform-owned, finite token/cost budget. The client can observe a truthful terminal result without choosing or increasing the budget.

## Preconditions and trust boundaries

- The request targets an isolated, explicitly enabled sandbox; the production path is unaffected.
- Control Plane selects a versioned budget policy from trusted host/profile configuration. Request JSON, prompt text, and model output cannot choose, raise, or remove it.
- The policy has a stable identity and numeric limits for the complete request. Classification, communication, and agent/provider calls are included in one aggregate maximum, or separately bounded with a stated finite aggregate maximum.
- Before the first paid classification call, Control Plane issues an opaque, signed, expiring capability bound to the durable user-task identity and policy/version. The same allowance is propagated through routing, Communication Skills, and Runner; retries, restarts, and new execution generations cannot mint a fresh allowance.
- The capability is transported only in an authenticated internal credential/header to the budget enforcement service. It is never derived from caller fields, prompt text, trace headers, or model output, and is never placed in prompts, task results, or logs.
- Control Plane also carries the trusted policy identity and numeric limits in the versioned RunSpec and Runner submit contract. Legacy submission paths cannot silently bypass policy for sandbox requests.
- Runner has an actual provider/API enforcement boundary that applies a ceiling before every model invocation. OpenCode CLI environment variables, process timeout, output-size limits, rate limits, and post-hoc usage reports alone are not evidence of a hard cap.
- On the budget-enforced path, the trusted output ceiling is strict: no adapter may raise `max_tokens` to a model/reasoning floor. If a rung's minimum viable output cannot fit, refuse/skip that rung without exceeding the task allowance. Preserve legacy behavior only outside this explicitly budgeted path; the current Ladder intentionally raises low caller limits for reasoning reliability.
- A provider attempt atomically reserves its worst-case permitted usage against the task-wide allowance before invocation. Retries/failover reserve separately; unknown outcomes retain their reservation until reconciled and cannot reopen capacity. Measured usage may reconcile evidence but cannot retroactively permit an over-budget call.
- Input-token enforcement requires a verified tokenizer/model mapping or a provider-enforced input ceiling. Byte/character counts and post-hoc usage are not input-token bounds; unsupported model/provider paths fail closed for this policy.
- No supported enforcement boundary, missing/malformed policy, stale policy version, or mismatch causes a typed refusal before materialization or model invocation.

## Main flow

1. QA submits a bounded synthetic task through the sandbox ingress with no caller-supplied budget authority.
2. Control Plane resolves the fixed sandbox principal/profile and trusted budget policy; it rejects a disabled/missing policy before dispatch.
3. Control Plane emits a RunSpec carrying the policy ID/version and numeric limits. Runner validates the schema and policy compatibility before side effects.
4. The same signed task capability is presented for every classifier, Communication Skills, and agent model call. The enforcement boundary verifies it and atomically reserves/checks the remaining aggregate allowance before provider invocation. Caller or prompt values cannot alter it.
5. If the task finishes under budget, the system returns the result and truthful measured usage for the complete request.
6. If the budget is exhausted, the system prevents further model invocation and returns an explicit budget-exhausted terminal outcome with usage/evidence that does not claim unspent unknown usage as zero.

## Failures, retry, and restart

- Caller budget inflation, omission, malformed values, unknown policy ID/version, provider mismatch, or unsupported enforcement is rejected before model invocation.
- A timeout, lost acknowledgement, provider retry/failover, worker restart, or uncertain provider outcome does not launch an unreserved attempt or reset the aggregate allowance. Reconciliation preserves the original task/capability identity and terminal uncertainty.
- If provider usage cannot be determined after an interrupted call, report usage as unknown and do not claim a zero-cost response.
- No failure path falls back to an unbudgeted legacy Agent/Runner route.

## Acceptance

- **Semantic conformity:** review scenario against implementation revisions; result must be PASS.
- **Component probes:** host-derived policy overrides/ignores caller fields; capability signature, audience, expiry, durable task identity, and policy version are verified; RunSpec and submit projection preserve policy identity/limits; missing, malformed, stale, inflated, and mismatched policies fail before dispatch; concurrent reservations, boundary, retries/failover, unknown outcomes, and exhaustion prove no provider call past the cap; retries/restarts cannot reset or double-spend.
- **Generated E2E:** against a declared isolated dev/test/staging target, submit a synthetic task, observe the actual provider-boundary enforcement, terminal result, usage, and relevant sanitized logs/state. Include classification/communication and agent usage in the aggregate evidence. Local fake-engine tests are not staging E2E.
- Pin implementation revisions, environment contracts, target, sanitized input, observable output, logs/state, and evidence in change PR #200. Do not claim production readiness or enable anonymous execution before the isolated Runner gate passes.

## Current limitations

Runner#182 currently has only approval metadata; OpenCode integration has no verified aggregate provider-boundary cap. CP#125/#126 propagates numeric RunSpec policy fields but does not yet issue the shared signed task capability before classification. Ladder#152 has no verified tokenizer/model mapping for all supported upstream providers; byte-size checks do not satisfy input-token enforcement. The existing SC-SBX-01 accept-only E2E proves ingress/replay only and must not be presented as evidence for this execution scenario.
