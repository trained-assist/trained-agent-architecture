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
6. План development сейчас ведётся в [Implementation and Integration Plan](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) и [Sandbox Plan](SANDBOX-PLAN.md). GitHub Project отложен; никакая development board не является authoritative runtime task/plan state. Issue создаётся в implementation repo при выборе работы; архитектура остаётся reference.
7. Existing VM сперва sandbox, позже может стать production после clean promotion; отдельный sandbox воспроизводится из manifest. Promotion не означает оставление test tenants и credentials в production.
8. Если sandbox сейчас отсутствует, отмечаем gap: owner, construction task, fidelity limitation и acceptance. Только технически недоступный provider режим требует alternative emulator + явного unsupported declaration.

Implementation начинаем с Runner/VM, затем API и artifacts, потом gateways/MCP/fast replies; GTD добавляется после основного сквозного потока. Gate/Watcher развиваются по готовности contracts, не становятся обязательной зависимостью standalone API.

## Источники для transfer fixtures

[Cloudflare R2 signed URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) и [upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/) описывают direct object transfer; [CORS](https://developers.cloudflare.com/r2/buckets/cors/) — browser требования. Выбранный wire protocol и конкретные limits закрепляются implementation contract; здесь не обещается переносимость каждого backend без adapter.

## Стадия 0 для всех репозиториев

До первой implementation iteration настраиваем общий AutoFix/context compression workflow с тонкими профилями каждого repo. AutoFix сначала делает deterministic mechanical fixes, затем при необходимости bounded LLM/OpenCode diagnosis/patch; повторная проверка обязательна, merge/deploy не автоматические. Не создавать GTD для контроля самого AutoFix.

Context compression — compact repo map + task-specific bundle/brief с full-source refs, pinned source revision и cache invalidation. Это рабочая трактовка запроса владельца, не удаление исходников. Entry points, contracts, dependencies/check commands и constraints сохраняются; secrets/generated/log payload исключаются. Agent раскрывает источник при недостатке brief. Новый repo получает тот же onboarding; docs-only profile не обязан проходить application build.

**Каждая iteration имеет собственный Logs acceptance:** какие transitions/errors публикуются, source/scope/Task/Run/reply correlation, retention/TTL и positive/controlled failure fixtures. Каждая implementation карточка ссылается на этот набор и прикладывает sanitized transcript; общая ссылка на logging policy без проверки конкретного этапа недостаточна. AutoFix пишет before/after checks, attempt/rule/version и patch refs; context builder — source version, included/excluded manifest, size/budget и build errors.

## Практический companion и live compatibility

[Sandbox Plan](SANDBOX-PLAN.md) объясняет fixture как подготовленный воспроизводимый сценарий; mock не обязателен. Реальный engine/API vertical slice и provider smoke отдельно от controlled fake failures. [Integration Plan](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) сохраняет текущий live service: новая реализация параллельно, isolated data/endpoints, затем отдельный pilot/cohort cutover с rollback. Ни старые репозитории, ни действующие production deployment сейчас не удаляются/заменяются.
