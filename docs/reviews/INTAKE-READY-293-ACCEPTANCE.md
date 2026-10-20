# SC-INTAKE-READY-01 / #293 acceptance — 2026-10-20

Scope: accumulated Telegram input → Ready → quick answer or explicit agent
continuation. Owning PRs: [TG #784](https://github.com/trained-assist/trained-assist-tg-bot/pull/784),
[CP #366](https://github.com/trained-assist/trained-assist-control-plane/pull/366).
Production promotion is outside this issue's authorization.

## Revisions and environments

- TG candidate: `066d3c9b4b5da0341aa56a5426d576f7c7cc6ad1`.
- CP candidate: `d28ae0d37f1c32bbab82cdef0e83ec061d00d521`.
- Local component and generated failure scenarios: owning repositories' `npm test`
  contracts; workerd/Miniflare, disposable SQLite state and synthetic identities.
- Remote target: existing `tg-sandbox3` gateway, `trained-assist-cp-sandbox3`,
  dedicated sandbox Runner and allowlisted Telegram chat. Contracts: TG
  `README.md` / `.github/workflows/sandbox3-worker-e2e.yml`, CP `AGENTS.md` /
  `wrangler.sandbox3.jsonc`. The shared workflow lock serializes the lane.
- CP candidate is pinned in TG `tools/sandbox3-cp-candidate.txt`. Account, bindings,
  principal scope, empty state and exact deployed revisions are checked before
  input; final cleanup and normal delivery-policy restoration are required.

## Gate 1 — semantic conformity: PASS

Review performed against the scenario, U-07, both implementation diffs, and the
following observable boundaries. This is semantic review, not a substitute for
execution evidence.

| Scenario requirement | Implementation and verification |
|---|---|
| Whole ordered snapshot; no classification while accumulating | TG `IntakeBuffer /ready` freezes input; `runControlPlaneTask` persists the envelope and receipt before `/route continue:false`. Signed-webhook tests assert both ordered input items and zero dispatches before style selection. |
| Quick answer in the same destination, zero Runs | A matching durable terminal task/result is delivered through the Telegram delivery owner with `terminal:<task>:g<generation>` identity. No agent busy receipt or style selection is created. |
| Only a valid agent decision shows four actions | Agent route requires a decision ID and a non-degraded result. Clarify/required-input render the question; degraded/malformed/provider failures retain the draft. Clear consumes no Run. |
| Same task, chosen strategy, at most one Run | Gateway sends decision ID, generation, stable idempotency key and workStyle. CP atomically records `routing.continuation_selected` before dispatch. Competing styles/stale decisions are rejected; each style is asserted in actual Workflow creation parameters. |
| Refused or unknown continuation | A refusal preserves the task/draft and never reports success. A durable pending choice survives lost acknowledgements; retry/status reconciliation targets the old task before any newer snapshot can be admitted. |
| Duplicate/stale callbacks and concurrent append | Ready callback IDs are claimed in durable storage before routing. Style claims are serialized and CP provides durable idempotency. An old classification cannot attach controls to a newer draft; retirement removes only the original item IDs. |
| Restart and timers | Signed-webhook/SQLite tests restart before/after collection and between classification/style choice. Old quiet timers cannot start CP input without an explicit action; failed receipt delivery still retries the collector button without dispatching a task. |

Inspection found and fixed real gaps in the earlier candidate: unconditional
“agent started” after refusal; generic errors instead of clarification; old
classification bound to the latest draft revision; absent durable style binding;
a component test that passed without creating a Workflow; duplicate Ready
webhooks after restart; and quiet-time dispatch bypassing the explicit choice.
U-07 was aligned with the scenario's no-silent-launch requirement for the CP
collector. Explicit text launch and legacy-backend behavior remain separate. Keeping the
old CP timer was considered but rejected: the expired-timer probe demonstrated
a dispatch without the explicit Ready/style choice, including after a failed
classification. The bounded consequence is that idle CP drafts wait for a user
action; legacy automatic launch is unchanged. Conflicting continuation choices
are rejected rather than overwriting the admitted instructions, because the
replay/concurrency probes require one stable execution choice.

## Gate 2 — component verification: PASS

CP `npm run check`: **888 tests**, typecheck and evidence sanitizer passed.
[Protected PR CI](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/39479703541)
passed on the CP candidate. `tests/communication-v1.test.ts` verifies each of
`explore|answer|auto`, zero Runs on the first route, one Workflow/Run with matching
instructions on continuation, duplicate replay, conflicting style and stale generation. A degraded preview is retried on the same task after provider
recovery, with zero Runs until an explicit valid continuation.

TG `NODE_ENV=development npm test`: **1545 tests / 139 files**, and
`npm run check` passed on the final candidate. TG_CI_PENDING. The final generated plan below is
also executable as `NODE_ENV=development npm test -- --run
 tests/existing-ux-extra-input-workerd.test.js` (9 scenarios). Additional focused
fixtures cover timeout, malformed arrays, concurrent style choices, expired
quiet timers, unknown continuation acknowledgements and newest-input preservation.

## Gate 3 — generated E2E plan and results

The plan was derived from changed steps of SC-INTAKE-READY-01:

| Assertion | Target / executable probe | Result |
|---|---|---|
| Quick route completes in Telegram without style selection or Runner execution | Remote `ready-quick`; real gateway, CP and Telegram output | QUICK_RUN_PENDING |
| Agent classification creates no Run before selection; selected style binds to the same task; exactly one successful Run and delivered answer | Remote `ready-agent`; real gateway, CP, Runner and Telegram output | AGENT_RUN_PENDING |
| Two ordered messages survive SQLite restart before/after receipt and between classification/continuation; replay creates no second effect | Local signed webhook → real TG Worker/SQLite → CP fixture → Telegram fixture | PASS (2 scenarios) |
| Clarify, required_input, degraded, malformed and provider failure retain all input and create zero dispatches; duplicate webhook after restart stays inert | Same isolated local boundary, controlled CP responses | PASS (5 scenarios) |
| Append while classification is awaiting its response preserves all three inputs; stale style cannot launch the old decision | Same isolated local boundary, concurrent signed webhook | PASS (1 scenario) |
| Clear after agent classification empties the draft with zero dispatches | Same isolated local boundary | PASS (1 scenario) |

Synthetic local input is a two-message request carrying values 150 and 275;
the append-race adds value 999. Only fake profile IDs and provider responses are
used. Remote agent input asks for a bounded three-step community-event checklist
with a unique marker; quick input asks for the existing capabilities answer.
Assertions inspect task/run counts, persisted choice, output delivery, retained
buffer and final lane state, not only HTTP success.

The local failure scenarios mock CP/Telegram transport; they are not remote
staging results. Remote scenarios enter via the authenticated operator test-update
adapter and verify real Telegram output, not external Telegram webhook ingress.
Per-run physical execution placement and production behavior are not claimed.

Earlier runs on previous candidates are diagnostic evidence only:
[39477614688](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/39477614688)
passed the real agent path and empty final-state/restore gates. Older artifact
`sourceSha` used GitHub's synthetic PR merge SHA; final evidence records both
actual candidate SHAs explicitly and includes the exact CP revision preflight.

## Promotion boundary

Gate 1/2/3 acceptance and Feature Promotion Gate A are distinct from release
Gate B. Gate B still requires merged runtime PRs and their merge revisions.
Both owning runtime pipelines automatically promote main through staging to
production. Issue #293 explicitly says “no production change authorized here”;
no runtime merge, production deploy or production smoke was performed.
The feature remains open until its authorized promotion completes; sandbox
acceptance must not be represented as a production delivery.
