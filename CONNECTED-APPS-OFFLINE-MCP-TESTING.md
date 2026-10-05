# Connected Applications: автономность и тестирование через MCP без Agent Run

Статус: требование владельца к целевой архитектуре · 06.10.2026. Этот документ задаёт правило; наличие offline harness и полнота покрытия в конкретном продукте подтверждаются evidence отдельно.

Продолжение модели слоёв из [PR #149](https://github.com/trained-assist/trained-agent-architecture/pull/149). Связанные правила: [Capability Catalog](CAPABILITY-CATALOG-AND-FAST-REPLIES.md), [Engineering Approach](ENGINEERING-APPROACH.md), [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md).

## 1. Главный инвариант: Agent-optional application

**Каждый продуктовый use case Connected Application должен иметь явный программный путь выполнения без Agent Run. Ни одна функция продукта не может быть доступна только через диалог с агентом или его автономный tool loop.**

Агент помогает подключить сервис, заполнить настройки, объяснить действия и выполнить команды от имени пользователя. Приложение после настройки работает самостоятельно: UI, API, webhook и расписание вызывают зарегистрированные операции и заданные workflows.

Примеры: получить отклики, оценить кандидата, подготовить/отправить сообщение, обновить этап, запустить мониторинг, распознать визитку, создать контакт/сделку, посмотреть статус. Нельзя требовать «напиши агенту» вместо программного действия. Асинхронный сценарий имеет start/status/result/cancel или эквивалентный явный контракт, а не требует живой сессии.

Настройка также имеет typed commands/forms/API: агент удобен, но не является единственным способом подключить credentials или исправить mapping.

**Без Agent Run не означает без AI.** Сопоставление, распознавание и next message могут использовать фиксированные LLM recipes через инструменты. Продукт запускает recipe с явными входами/выходами, без автономного планирования и clean room. Offline tests подставляют ответы AI; качество настоящей LLM проверяется отдельным eval. Agent mode допустим как дополнительный помощник; не является обязательной реализацией функции приложения.

## 2. Инструментарий и явные контракты

Для каждой продуктовой операции есть stable capability/command ID, версия, input/output schema, documented errors, effect/readiness и implementation binding. Все операции, необходимые приложению, доступны через MCP facade в соответствующем scope; UI/API могут использовать те же handlers напрямую через общий command port. Дублировать бизнес-логику ради MCP не нужно.

Состав методов задан в исходниках/versioned manifests, не создаётся LLM по ходу выполнения. Code generation из явных schemas допустима и проверяется в CI; names/args не выводятся из свободного текста.

Приложению виден весь **его declared dependency set**: собственные commands и используемые shared/provider capabilities, включая необходимую информацию о недоступности. Не требуется отдавать ему весь платформенный каталог или чужие credentials. В production проверяются scopes; в тестах проверяется и denial.

Компактная группа CRM/Recruting и lazy disclosure не скрывают контракт от тестового клиента: он умеет раскрыть полную схему каждой declared operation. Документ CRM Notes не заменяет executable command.

Для каждого use case хранится mapping:
useCaseId → trigger (UI/API/event/schedule) → workflow/steps → command/capability IDs + versions → state changes → expected result/errors.

Workflow выполняется обычным программным клиентом. Набор MCP методов сам по себе не определяет порядок и условия процесса: эти правила принадлежат Domain layer.

## 3. Offline MCP test harness

Название: **offline contract testing через mock MCP**. Слово «статическое» используем только для проверки схем/ссылок: выполнение приложения с mock — динамический локальный тест.

Стенд запускает тестируемое приложение/его domain handlers локально, использует disposable data store, synthetic fixtures и локальный MCP client/server transport. Production сервисы, внешние accounts, Agent Runner и платные LLM не запускаются. Локальные процессы теста допустимы; «без сервиса» означает без deployed/live dependencies.

### Не подменять тестируемую логику

| Проверка | Реально выполняется | Что заменено |
|---|---|---|
| UI contract/component | UI, view mapping, пользовательские действия | Domain responses для быстрых UI fixtures |
| Domain/workflow | Commands, переходы, валидаторы, хранение приложения | Внешние MCP/provider/AI dependencies |
| MCP facade | Настоящий facade и business handler, реальный локальный MCP round trip | Внешние dependencies handler |
| Full offline use case | UI/API/event entry, Domain layer, facade где он в пути, test data store | HH/CRM/AI, часы и входящие события |
| Provider integration | Настоящий adapter + test account | Только не относящиеся к проверке зависимости |

Если mock заменил и бизнес-handler, и внешнюю зависимость, успешный вызов доказывает только поведение клиента. Это не тест реализации функции.

## 4. Требования к mock MCP

Один источник контрактов: mock загружает descriptors/schema из тех же pinned definitions, что реальный facade. Отдельный вручную поддерживаемый каталог запрещён. Fixture outcomes задаются явно; не получают «идеальный результат» из LLM.

Mock обязан:
- воспроизводить tool discovery, names, аргументы, result/error envelopes и используемые возможности MCP transport;
- валидировать входы/выходы; неизвестный tool, неподходящая версия и непредусмотренный вызов приводят к test failure;
- поддерживать stateful сценарии: созданная сущность затем читается, связи/IDs сохраняются; возврат постоянного success на любой вызов недостаточен;
- фиксировать call journal: method, sanitized args, outcome, ordering и correlation/idempotency IDs;
- моделировать auth missing/expired/denied, invalid input, not found, rate limit, timeout, partial/invalid AI result, stale revision;
- отдельно моделировать «мутация выполнена, ответ потерян»: повтор не создаёт второй контакт/сообщение;
- поддерживать duplicate/out-of-order events, controlled clock/schedule, reproducible seed;
- использовать synthetic credentials/data; unexpected external network egress в offline suite приводит к отказу, а не live fallback.

При protocol error/transport failure и business error должны воспроизводиться разные наблюдаемые outcomes. Если приложение использует resources/prompts или pagination, они тоже покрываются; одного mock tools/call недостаточно.

## 5. Что фиксировать в репозитории приложения

| Артефакт | Содержание |
|---|---|
| Dependency manifest | tool/capability IDs, version constraints/schema digests, mappings, scopes/readiness |
| Use-case inventory | Все продуктовые сценарии и явные entry points без агента |
| Scenario fixtures | Начальное состояние, inputs/events, mock outcomes/faults, expected final state |
| Assertions | Результат, changes, связи, side-effect counts, forbidden calls, recovery/status |
| Harness | Bootstrap/reset/run/teardown, локальный транспорт, mock bindings |
| Evidence | source SHAs, contract digests, test command, результаты и fidelity limits |

Runnable код/fixtures живут в implementation repo; архитектурный repo хранит правило. Не вводить новый универсальный DSL или MCP server на каждый тест, если существующий test runner достаточен.

## 6. CI и критерий готовности

CI выполняет:
1. Static conformance: schemas, mappings, отсутствующие handlers/refs, collisions/version drift.
2. Покрытие всех заявленных dependencies mock-сценариями; сравнение mock descriptors с реальными contracts.
3. Domain и локальные MCP contract tests, включая позитивный путь и релевантные controlled failures.
4. Каждый use case хотя бы один раз через реальный application entry point без агента; критические UI paths — через UI.
5. Проверку agent independence: endpoint/credentials Runner отсутствуют, запуск Agent Run заменён запрещающим stub; ноль launch calls. Любая скрытая зависимость проваливает сценарий.
6. Отчёт покрытия use cases и contract digests; необработанные gaps не объявляются готовностью.

Отсутствие runId не является ошибкой приложения: request/operation/workflow IDs сохраняют трассировку без Agent Run. Доступность агента не включается в readiness обязательных domain функций.

**Offline-ready:** все use cases проходят offline на реальном Domain layer, dependencies/mappings согласованы, controlled failures пройдены, Agent Run не требуется. Это позволяет завершить локальный цикл разработки до появления live сервиса.

**Integration-verified:** дополнительно пройдены реальные adapters/test accounts и AI eval. Mock не доказывает auth провайдера, rate limits, актуальность внешнего API, доставку настоящего сообщения, latency или качество модели.

**Production-ready:** deployment bindings, storage/migrations, observability и release acceptance проверены по общим правилам. Три статуса различаются в отчёте; offline acceptance не заставляет запускать весь живой стек.

## 7. Минимальные сценарии продуктов

Recruiting: неполный профиль → вопросы только о пропусках; полный → готовность к тестовому; согласие → отправка один раз; тестовое → оценка/этап. Дополнительно мониторинг откликов/холодного поиска, остановка, восстановление, звёзды/архив в scope вакансии. Shared communications/matching вызываются прямо как tools/recipes, а не «попросить агента оценить».

Exhibitions: визитка → извлечение → draft/исправление → contact dedup → CRM contact/deal → UI. Проверки повторного импорта, потери ответа CRM, missing credentials и conflicting edits. Фактический перечень сверяется с inventory продукта.

Для расписаний и webhooks тесты подают события/время явно; сценарий не зависит от реального cron или ожидания несколько часов. Durable execution сервиса остаётся программной ответственностью; устойчивость не требует автономного Agent Run.

## 8. Задание агенту декомпозиции

Добавить это правило к заданию из PR #149.

1. Инвентаризировать все use cases обоих приложений, сопоставить с явными MCP methods/workflows. Найти agent-only функции и скрытые launch/session/fs зависимости.
2. Для каждой agent-only функции извлечь typed command или fixed recipe; обеспечить entry point через UI/API/event/schedule и MCP. Не оборачивать весь прежний agent loop в tool с новым названием.
3. Подготовить dependency manifest из существующих definitions, stateful mock MCP, synthetic fixtures и запрещающий Runner stub.
4. Пройти полный offline цикл на реальной бизнес-логике, не на заглушке приложения; добавить failed/duplicate/stale/unknown-mutation outcomes.
5. Сохранить код и tests в отдельных implementation PR; evidence и недостающие live checks — в issues.
6. Приёмка: каждый заявленный продуктовый сценарий выполняется без агента; агент только дополнительный клиент тех же contracts.

Этот документ не подтверждает, что все текущие MCP methods уже эксплицитны или все сценарии покрыты: это проверяется inventory и CI. Новые тестовые процессы не размещать на выводимой GCP VM; использовать локальный/CI offline стенд.
