# CP Telegram UX agent sandbox follow-up — 2026-10-10

This follow-up records the latest live sandbox checks after the canonical
Control Plane → mock Runner API path was paired. It does not authorize Telegram
delivery or production execution.

## Targets and baseline

- CP sandbox Worker: `trained-assist-cp-telegram-ux-v1-sandbox`, deployed build
  `add23c120527b27e7a6d891db9a915bcf2a5e211`.
- Telegram UX Runner API: Cloudflare Worker
  `trained-assist-runner-api-telegram-ux-v1-sandbox`, build
  `721876594a4c7b7893b7e76ffcdfb2bead9c83c6`.
- France execution worker: `eu-vm2-sandbox`, region `eu`, release
  `vm-worker-v0.3.5`, source `dcca4e4b225ad2489748946b5afec6106b337b9d`.
- Authenticated CP sandbox readiness and Runner profile health passed before
  the execution attempt; the CP lane had zero nonterminal tasks and the Runner
  API reported `reachable`.

## Quick-answer scenarios — PASS

The live quick-answer smoke passed both `system_health` (`Работает?`) and
`catalog.brief` (`Какие у тебя функции и что можно подключить?`). For both
tasks, intake replay returned the same task, route replay returned the same
decision and answer, the result was persisted as `done`, and the Task Store
reported zero Runner runs. The smoke made no Telegram delivery.

| Scenario | CP task | First useful reply | Model calls |
|---|---|---:|---:|
| `system_health` | `ut-c515a7d9be50bad86790` | 19.6 s | 2 |
| `catalog.brief` | `ut-2ef29589e767d659b970` | 21.0 s | 2 |

The first-useful-reply measurements come from the persisted routing decisions;
the full smoke protocol took 21.4 s and 22.1 s respectively. These are bounded
free-LLM quick-answer checks, not Runner execution or channel-delivery evidence.

## Production preview smoke — PASS, user route remains disabled

The deployed CP production Worker passed the same protected liveness smoke at
SHA `d3b414880a0796abbe534d037feb44759d038ab3`: `/healthz` returned healthy with
the expected build SHA, and an anonymous request to the private catalogue
endpoint returned 401. The production config still has
`PREVIEW_ONLY=true`, `PILOT_ENABLED=false`, and `ROUTER_AGENT_ALLOWED=false`;
this verifies deployment/auth boundaries only and does not exercise a user task
or connect the Telegram bot.

## Separate sandbox3 mock lane — PASS after exact-SHA redeploy

The isolated CP sandbox3 mock probe first failed closed before admission because
the deployed Worker SHA (`b56d1b5`) differed from the protected-main source SHA
(`d3b4148`); run [38041003753](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38041003753)
created no task or Runner admission. The approved disabled-sandbox deploy then
updated only `trained-assist-cp-sandbox3` from protected main and passed exact-SHA
liveness in [run 38041064585](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38041064585).
The retry passed in [run 38041113888](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38041113888):
the mock contract returned HTTP 200 and `succeeded / pong`, created no CP task,
called no France Worker/model, and the scoped cleanup found zero tagged tasks.
This is an isolated mock-only contract pass; it does not prove real-agent or
Telegram execution.

## Agent execution scenario — allowlists fixed; repository credential still missing

The first single-attempt canary confirmed the France worker's preflight allowlists
were missing the Telegram UX repository and callback origin. The `repository` and
`resultUrl` validation paths mapped to the France worker's exact checks
(`repository is not approved on this host` and
`resultUrl is not an approved central API callback URL`). No run body or secret
values were exposed.

Those two entries were reconciled additively on the existing France VM worker by
CP PRs [#212](https://github.com/trained-assist/trained-assist-control-plane/pull/212)
and [#214](https://github.com/trained-assist/trained-assist-control-plane/pull/214).
The workflow first required zero active runs/reservations, retained the existing
sandbox3 entries, atomically updated the mode-0600 VM environment file, restarted
the same worker release with rollback on failed readiness, and emitted no secret
values. Evidence: [workflow run 38038714434](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38038714434).
It reported one prior repository entry and one callback origin, each increased
to two; the VM remained `eu-vm2-sandbox` on source
`dcca4e4b225ad2489748946b5afec6106b337b9d`, with zero active runs and
reservations. A subsequent CP preflight passed in
[run 38038745344](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38038745344).

The latest read-only sandbox preflight also passed in
[run 38040491635](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38040491635):
authenticated lane readiness and profile health passed, CP had zero nonterminal
tasks, and no Runner admission or CP task was created. Its scoped sandbox3
cleanup found zero tagged tasks and deleted none.

After the quick-answer smoke and production preview promotion, a fresh
read-only canonical preflight passed against main source SHA
`e0ade7a003864886ada0d5a3e4b7c95ba97ba019` in
[run 38042072951](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38042072951).
It verified the canonical Worker remained at expected build SHA
`add23c120527b27e7a6d891db9a915bcf2a5e211`, with zero pending migrations,
zero nonterminal CP tasks, authenticated lane readiness and profile health.
No CP task or Runner admission was created. Its scoped sandbox3 cleanup found
zero tagged tasks and deleted none.

The new CI-gated canonical quick-answer smoke passed after CP PR
[#215](https://github.com/trained-assist/trained-assist-control-plane/pull/215)
merged as `e0ade7a003864886ada0d5a3e4b7c95ba97ba019`. Workflow
[run 38041643090](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38041643090)
verified the deployed canonical sandbox build SHA exactly as
`add23c120527b27e7a6d891db9a915bcf2a5e211` before intake, then ran both
synthetic quick answers. `system_health` and `catalog.brief` each reached
terminal `done`, persisted their answer, and replayed the same intake task and
route decision; neither started an engine run nor sent Telegram delivery. The
health answer used its verified deterministic fallback because the optional
communication writer failed (`writer_failed`); the capabilities answer used
the communication writer successfully. The sanitized artifact contains no
answer text or credentials. This confirms the CP quick-answer path only; it
does not clear the private-repository credential blocker for real agent runs.

The next agent canary then reached the France worker, which accepted exactly one
run and failed before starting the model while cloning the bound private test
repository:

- CP task: `ut-f1fdecb858ccdc04b88c`.
- CP selected `route=agent`, issued one continuation, and recorded one Runner run.
- Terminal result: `REPOSITORY_UNAVAILABLE`,
  `exitReason=preflight_refused`, failure class `preflight`.
- The sanitized worker summary says Git could not read a username for
  `https://github.com`; the run did not start the agent. No artifacts, deliveries,
  or Telegram messages were created.
- Exactly one `/route` admission was made; no retry or replacement task was
  submitted. CP readiness afterward returned HTTP 200 with zero nonterminal tasks,
  and Runner profile health remained `reachable`.

The evidence means the launch had no usable credential to clone the private
repository. A read-only GitHub API probe with the existing local trained-assist
token also returned 404 for this personal-account repository. Runner API PR
[#263](https://github.com/trained-assist/ai-agent-runner/pull/263) has merged as
`05bf86988de5e5919c63d83114c38046375fe91e`. It adds a dedicated
`TELEGRAM_UX_REPOSITORY_READ_TOKEN` Cloudflare secret and includes it only for
this exact principal, profile, and repository in the encrypted launch payload.
It is not persisted in plaintext Durable Object state or installed as a
long-lived France VM environment variable. The secret is optional during
deployment so the Worker can be upgraded while the credential is being created;
live cloning remains blocked until the secret is configured. Sandbox deployment
workflow [run 38039530858](https://github.com/trained-assist/ai-agent-runner/actions/runs/38039530858)
succeeded. Public `/healthz` and `/version` probes returned HTTP 200; the Worker
reports `placement=cloudflare-worker`, `executionWorker=eu-vm-agent-run`, and
build SHA `05bf86988de5e5919c63d83114c38046375fe91e`.

The required input is a fine-grained GitHub credential with Contents: read access
to `vovalikessmoothy-png/cp-telegram-ux-runner-sandbox`, stored as
`TELEGRAM_UX_REPOSITORY_READ_TOKEN` in the `sandbox` environment of
`trained-assist/ai-agent-runner`. After the PR merges, the normal sandbox deploy
will sync it to the Cloudflare Worker secret binding. The VM and agent currently
share a Unix service identity, so a VM-wide Git token would cross the per-profile
boundary. A names-only inventory on 2026-10-10 confirmed this environment secret
is not present yet; no secret values were read.

The reconciled values are:

- Repository: `vovalikessmoothy-png/cp-telegram-ux-runner-sandbox`.
- Callback origin:
  `https://trained-assist-runner-api-telegram-ux-v1-sandbox.skillset-apply.workers.dev`.
- Existing sandbox3 repository/origin entries must remain enabled; the France
  VM serves both isolated sandbox Runner API lanes.

## Remaining boundary

The two quick answers, CP → mock Runner contract, France worker allowlist
reconciliation, CP/Runner readiness checks, and Cloudflare Worker deployment
pass. Real agent execution remains blocked on the profile-scoped
private-repository read credential. The Telegram
ingress and delivery harness remains paused pending the separate delivery-owner
review of the earlier duplicate provider-message-ID evidence. The CP production
target remains preview-only and is not connected to the Telegram bot.
