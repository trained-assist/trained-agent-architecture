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

## Agent execution scenario — BLOCKED by France worker preflight

A single synthetic request asked the agent to return `READY` without tools,
external services or file changes. CP selected the agent route and issued one
continuation. That single Runner attempt terminated before the France worker
accepted it:

- CP task: `ut-c97ff9fb3e2458d240b2`.
- Runner API response: terminal `WORKER_INVALID_REQUEST`,
  `exitReason=preflight_refused`, HTTP 400.
- Safe refusal evidence identifies rejected fields `repository` and
  `resultUrl`; the worker did not accept the run. No artifacts or deliveries
  were created, and no Telegram message was sent.
- The route was called once. No retry or replacement task was submitted.
- CP readiness was rechecked afterward: zero nonterminal tasks remained.

The refusal is confirmed by matching the sanitized rejected paths to the deployed
France worker's validation contract: `repository` is refused when its full name is
absent from `VM_WORKER_ALLOWED_REPOSITORIES`, and `resultUrl` is refused when its
origin is absent from `VM_WORKER_ALLOWED_CALLBACK_ORIGINS`. The contract's exact
validation messages are `repository is not approved on this host` and
`resultUrl is not an approved central API callback URL`. No run body or secret
values were exposed in CP evidence. Before another execution attempt, reconcile
these exact sandbox values on the France worker while preserving sandbox3:

- Repository: `vovalikessmoothy-png/cp-telegram-ux-runner-sandbox`.
- Callback origin:
  `https://trained-assist-runner-api-telegram-ux-v1-sandbox.skillset-apply.workers.dev`.
- Existing sandbox3 repository/origin entries must remain enabled; the France
  VM serves both isolated sandbox Runner API lanes.

The local France SSH aliases/keys available for this session do not authenticate
to the pinned VM2 host, so its live environment file has not been read or changed.
Do not infer that the values are absent from the VM solely from this refusal;
the failed fields prove they were rejected, while only authenticated host
inspection can show its current allowlist values. The terminal task was
reconciled and CP readiness returned zero nonterminal tasks.

## Remaining boundary

The two quick answers and CP → mock Runner contract pass. Real France execution
for the Telegram UX profile remains blocked on the preflight configuration
above. The Telegram ingress and delivery harness remains paused pending the
separate delivery-owner review of the earlier duplicate provider-message-ID
evidence. The CP production target remains preview-only and is not connected to
the Telegram bot.
