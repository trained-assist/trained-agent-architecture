# Epic #253 — карта трёх sandbox сред (Z00.a)

- Дата составления: 2026-10-11; обновлено 2026-10-12 (Среда 2 развёрнута, I05.b).
- Владелец данных: Epic https://github.com/trained-assist/trained-agent-architecture/issues/253
- Статус: baseline проверен вживую; обновлять только изменившиеся данные.
- Правила: не угадывать URLs; не считать lanes независимыми по названию; production не используется как запасной стенд; общие shared downstream требуют claim/release по #185.

## Среда 1 — MCP fixture lane (существующий тестовый воркер)

| Поле | Значение (проверено 2026-10-11) |
|---|---|
| Назначение | Z00.c client/transport проверка; базовая линия I00–I04 (machine discovery/invocation) |
| Endpoint | `https://trained-assist-mcp-host-test-160.skillset-apply.workers.dev/mcp` |
| Жив | да — `initialize` → HTTP 200, protocolVersion 2024-11-05 |
| Repo | `trained-assist/trained-assist-mcp-head` (local checkout: /Users/vova/code/trained-assist-mcp-host-sandbox) |
| Worker | `trained-assist-mcp-host-test-160`, main `src/worker.mjs`, workers_dev |
| Bindings | только vars: `MCP_TEST_PRINCIPAL_ID=integration-telegram-ux-v1`, `MCP_TEST_CATALOGUE_VERSION=registry-fixture-catalogue-v1`; **нет D1/KV/DO** |
| Auth | Ed25519 JWK bearer (machine/run mode), заголовок `x-mcp-run-binding`; `tools/list` без подписи → `-32001 Unauthorized` |
| Server/tool fixture | server `trained-assist-registry-test`, tool `registry.fixture_read`, bindingRef `registry-mcp-test-160-read`, scope `registry:fixture-read` |
| Shared downstream | нет (изолированный fixture-воркер) |
| Credentials refs | `MCP_TEST_AUTH_TOKEN`, `MCP_TEST_E2E_PRIVATE_JWK` (scripts/remote-e2e.mjs), `MCP_TEST_RUNNER_PUBLIC_JWK` / `MCP_TEST_E2E_PUBLIC_JWK` (src/worker.mjs) — секреты только в CF dashboard/secret files, не в Git |
| Reset | не применялся; destructive reset не входит в обычный loop |
| Ownership/claim | принадлежит registry-MCP тестовому потоку (issues #8/#11/#14/#16 trained-assist-mcp-host); для Epic #253 используется read-only probe, деплоить изменения — только своей новой ревизией в отдельном воркере/среде |

## Среда 2 — MCP identity lane (развёрнута в Epic #253)

| Поле | Значение |
|---|---|
| Назначение | I05.c: реальный gateway + D1 + personal key; ручной пользователь → персональный ключ → tool по роли → native call → наблюдаемый результат |
| Endpoint | `https://trained-assist-mcp-host-identity.skillset-apply.workers.dev/mcp` (worker `trained-assist-mcp-host-identity`, main `src/worker-unified.mjs`, mode `MCP_MODE=human`) |
| Жив | да — `initialize` → HTTP 200 (проверено 2026-10-12); без ключа `tools/list` → `-32001 Unauthorized` |
| Repo | `trained-assist/trained-assist-mcp-host` |
| Bindings | D1 `MCP_IDENTITY_DB` (trained-assist-mcp-identity) + vars `MCP_TEST_PRINCIPAL_ID`, `MCP_TEST_CATALOGUE_VERSION`, `MCP_MODE=human`; JWK machine-секреты те же refs, что в среде 1 |
| Auth (целевой) | personal key на пользователя (static token фазы A), тот же токен — `apiKey` провайдера Ladder; OAuth — follow-up D |
| Shared downstream | Ladder lane (среда 3) — один user/key на оба входа |
| Reset | только additive test migrations и synthetic users; чужой state не чистить |

## Среда 3 — Ladder lane (shared live)

| Поле | Значение (проверено 2026-10-11) |
|---|---|
| Назначение | Milestone B: список пользователей, права, лимиты, учёт, ACL (I03.a/b, I04.b, I06.a/b/c) |
| Endpoint | `https://llm-ladder.trainedassist.store` (custom domain) |
| Жив | да — без токена → 401 `auth_error` |
| Repo | `trained-assist/trained-assist-llm-ladder` (default branch main) |
| Bindings | D1 `LADDER_TRACE_DB` (trained-assist-llm-ladder-trace), D1 `ZEN_DB` (trained-assist-llm-ladder-zen), DO `LADDER_STATE`; database_id переписываются deploy job перед деплоем |
| Auth | общий `LADDER_TOKEN` (+ `LADDER_TOKEN_PREVIOUS`, `LADDER_TOKENS`); per-user токены — цель Epic #253 |
| Shared downstream | да: один воркер обслуживает все потребители; claim/release по #185 обязателен перед live-пробами |
| Credentials refs | секреты через `wrangler secret put`, в Git только имена |
| Reset | destructive reset запрещён; только scoped additive операции |

## Локальные fixture (без облака)

- `node --test` в `trained-assist-mcp-host` (host.test.js) — контракты createHost/protocol/http без сети.
- fixture server для Z00.c — минимальный MCP endpoint на localhost (создаётся Z00.c), подтверждает client/transport без Cloudflare.
- Session Manager: `http://localhost:3000/claude-sessions`, API `POST /api/sessions/start`, `GET /api/sessions/<id>[/md]`, `POST /api/sessions/<id>/reply`; жив (HTTP 200).

## Проверки при расхождениях

1. Сверять endpoint фактическим `initialize`/HTTP-кодом, не по имени воркера.
2. Перед использованием Ladder lane — проверить claims в #185 и взять claim; после evidence — `RELEASE <lane>`.
3. Среда 2 не разворачивается поверх среды 1: fixture lane остаётся регрессионной  baseline для machine mode.
4. Любой новый секрет — только через secret store; в карту пишутся только refs.
5. Передеплой среды 2: GitHub Action `Deploy Identity Lane Worker` (`workflow_dispatch` на `main`, environment `sandbox`, secret `CF_API_TOKEN`); она же идемпотентно создаёт/находит D1 и применяет additive migrations. Среда 1 деплоится отдельным `Deploy Registry MCP test Worker`.
