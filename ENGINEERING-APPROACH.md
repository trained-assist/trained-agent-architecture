# Engineering Approach — Sandbox Driven Development

Статус: target approach / draft · 30.09.2026. Основание: планирование implementation после архитектуры v0.4. Это новая текущая спецификация; прежние неопубликованные draft не используются как принятые правила.

Разработка должна позволять AI-агенту самостоятельно пройти от требования до проверяемого результата в воспроизводимой среде. Каждая новая вертикальная функция включает sandbox способ запуска, positive scenario, controlled failure и наблюдаемый результат. Если sandbox можно реализовать, его реализация входит в работу, а не остаётся внешним условием «когда-нибудь дадут доступ».

Sandbox — среда разработки/проверки. Agent clean room — runtime граница доступа каждого Agent Run. Sandbox VM может запускать много clean rooms; эти термины не взаимозаменяемы. Production данные/credentials не должны быть fixture. Реальные test-account smokes дополняют emulator tests и проверяют расхождение, а не заменяют воспроизводимую проверку.

## Практика

| Компонент | Sandbox | Acceptance / известный пробел |
|---|---|---|
| Runner | Имеющаяся VM, отдельные roots/config + fake engine adapter, затем real OpenCode | setup/teardown, cancel tree, limits, restart, logs. Готовая реализация Runner ещё не подтверждена |
| LLM/model gateway | Deterministic response/fault fixtures + free-only live profile | schema/timeouts/429/auth/usage; provider квота не означает unlimited runs |
| API | Внешний CLI/client, test keys/scopes, durable store | duplicate/reconnect/replay/cancel/result; без GTD/TG/Web |
| Object storage | S3-compatible fixture, отдельный R2 bucket для cloud smoke | direct transfer, CORS, expiry, multipart/resume, export/cleanup |
| Web/Cloudflare | Отдельные Workers/origins и bindings D1/KV/R2, deployment manifest | user workflow и errors; lifecycle test ресурсов ещё нужно реализовать |
| Telegram | Update/delivery emulator, затем separate test bot/chat | bot fixture проверяет contract; real smoke проверяет provider/webhook delivery |
| MCP | stdio/remote server fixtures, scoped handler bindings | handshake/readiness/tool invocation/cleanup, effect receipts |
| HH/CRM | Provider emulators, sanitized recorded contracts; безопасный test account при наличии | API differences и auth expiry; доступность provider sandbox не предполагается |
| GTD/schedule | Virtual clock, synthetic CI/wait/input | opt-in, deadlines, no LLM sleeping/polling, outbox replay |
| Error Watcher | Registered errors/storm fixtures, fake issue/report sinks | profile/reply context, suppression expiry/reopen/self-loop |
| RU/EU workers | Two-worker fixtures до подключения существующих workers | placement/capabilities/fencing; data residency decision отдельно |

## Правила приёмки

1. Reproducible setup manifest содержит software versions, config refs, resource namespaces и teardown. Secrets — refs/bindings; не значения в Project.
2. Реальный vertical slice проходит тот же публичный contract, что внешний клиент. Tests не обходят API через внутренний вызов и затем не называют это external workflow.
3. Errors и main events выполняют [Observability contract](OBSERVABILITY-AND-ERROR-CONTRACT.md). TTL cleanup проверяется ускоренным clock, active state/outbox не стирается.
4. Негативные scenarios задаются fault injection, а не надеждой на случайный сбой бесплатной модели. Live runs имеют budget/concurrency/deadline caps, paid fallback off.
5. Evidence: pinned commit/PR, setup/config version, sanitized transcript, Task/Run IDs, artifact manifest/hash и cleanup/recovery outcome.
6. GitHub Projects содержит evolving plan и acceptance evidence, не authoritative runtime task/plan state. Issue создаётся в implementation repo при выборе работы; архитектура остаётся reference.
7. Existing VM сперва sandbox, позже может стать production после clean promotion; отдельный sandbox воспроизводится из manifest. Promotion не означает оставление test tenants и credentials в production.
8. Если sandbox сейчас отсутствует, отмечаем gap: owner, construction task, fidelity limitation и acceptance. Только технически недоступный provider режим требует alternative emulator + явного unsupported declaration.

Implementation начинаем с Runner/VM, затем API и artifacts, потом gateways/MCP/fast replies; GTD добавляется после основного сквозного потока. Gate/Watcher развиваются по готовности contracts, не становятся обязательной зависимостью standalone API.

## Источники для transfer fixtures

[Cloudflare R2 signed URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) и [upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/) описывают direct object transfer; [CORS](https://developers.cloudflare.com/r2/buckets/cors/) — browser требования. Выбранный wire protocol и конкретные limits закрепляются implementation contract; здесь не обещается переносимость каждого backend без adapter.
