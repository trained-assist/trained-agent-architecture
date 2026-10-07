# SC-SBX-01 — Анонимная accept-only проверка приёма в песочнице

**Статус:** implemented slice; architecture change #197. Scope is limited to bounded accept-only admission and ticket-scoped cursor polling. Full sandbox lanes, idempotency, SSE, and agent execution are not part of this scenario revision. Связанная история: [API-16](../../stories/API.md#api-16-проверить-приём-запроса-в-песочнице-без-учётных-данных). Implementation issue: [trained-assist-tg-bot#402](https://github.com/trained-assist/trained-assist-tg-bot/issues/402).

**Implementation evidence:** trained-assist-tg-bot PR [#412](https://github.com/trained-assist/trained-assist-tg-bot/pull/412), security fix commit `c8552ceaa64c6c61d42d14382dbcf595fe362db3`; deployed Shturman sandbox Worker version `7e447da8-a859-4c23-a38f-d56a41dfb3f2`.

## Актор и цель

Инженер, QA-агент или другой тестовый клиент проверяет HTTP-приём синтетического запроса и наблюдение его квитанции/событий, не зная Telegram chat ID и не используя пользовательскую авторизацию или Cloudflare credentials.

## Предусловия

- Цель — явно изолированный sandbox; endpoint выключен по умолчанию и недоступен на production bindings.
- Платформа выбирает фиксированный sandbox principal/profile. Клиент не задаёт и не повышает полномочия, бюджет или список инструментов.
- Режим этого сценария — `accept-only`: он сохраняет запрос и возвращает квитанцию, но не вызывает классификатор, MCP, модель, Agent Run, Runner или внешнее действие.
- Есть лимиты размера, частоты и времени хранения. Capability не возвращает входной текст. Проверка захвата request body платформенной observability остаётся отдельным privacy evidence gate до принятия сценария.

## Основной поток

1. Клиент отправляет один короткий синтетический текст на sandbox seed endpoint без `Authorization` header.
2. Endpoint проверяет sandbox-only binding, feature flag, body size, request quota и срок хранения до сохранения ввода.
3. При успехе клиент получает request correlation ID и случайный run-scoped read capability. В ответе явно указано `accepted_only`: выполнение агента не запускалось; это не исполняемая задача и не Agent Run.
4. Клиент читает квитанцию с курсором, используя capability. Он видит только собственное событие `accepted_only`; повторное чтение с курсором не создаёт новую запись.
5. Capability другого запроса не раскрывает наличие, вход, результат или ID этой записи. Истёкший capability отказывает.

## Отказы и повтор

- Disabled flag, production binding, malformed/oversized input или исчерпанная квота дают явный отказ; ни один исход не вызывает классификацию или Agent Run.
- Потеря ответа не запускает исполнение. Доступный replay читает только сохранённое событие по capability и курсору; контракт idempotency key для повторного POST этим сценарием не задаётся.
- Capability остаётся ограниченной одной записи и имеет срок действия.

## Граница доказательства

PASS этого сценария доказывает только sandbox API ingress, ограничение доступа к событиям и replay. Это **не** доказывает работу классификатора, MCP, модели, Agent Run, Runner или доставки через Telegram. Настоящее выполнение задачи допускается отдельным изменением только после подтверждённого hard token/cost budget на границе исполнения (включая классификацию/communication), sandbox tool allowlist и развёрнутого изолированного Runner.

## Приёмка

- Semantic review для суженного accept-only/polling контракта: **PASS** — capability случайна, хранится только её SHA-256, связана с одной записью, cross-ticket replay даёт 404; полномочия principal/profile заданы платформой. Независимая проверка: архитектурный PR #198, комментарий от 2026-10-07.
- Component probes проверяют request/body/rate limits, expired/malformed/cross-run capability, production fail-closed, отсутствие classifier/Runner вызовов и нулевой token usage.
- Component probes: PR #412 CI passed; six focused tests include size/rate limits, expiry, cross-ticket isolation, fail-closed production configuration and proof that CP/Runner are not called.
- Generated E2E against isolated sandbox: **PASS for API acceptance/replay only** — deployed Worker version above; POST without chat ID returned 202, ticket-in-body replay returned `accepted_only` with 200, wrong-ticket replay returned 404, receipt reported `executionStarted=false` and `tokenUsage=0`. This is deployed sandbox evidence, not full executor/Runner E2E.
- Privacy evidence: ticket is carried only in a bounded POST body, not URL/headers (including the internal DO request); only Shturman sandbox disables invocation logs while retaining custom logs. Deployed probe after this configuration confirmed the accept/replay contract. This limits the contents of available invocation logs; it does not claim anything about platform-internal processing/retention outside Workers invocation logs.
- В evidence отдельно указано, что SSE, idempotency POST, lane leases/status, Runner execution и Telegram delivery не покрыты.

## Отдельные follow-up границы

SSE transport, idempotent POST keys, aggregate lane status/leases and lease expiry belong to subsequent sandbox-ingress work under #402; they are intentionally excluded from this accept-only slice. Classifier/Runner execution and Telegram delivery remain separate scenarios requiring hard end-to-end budget enforcement and an isolated Runner.
