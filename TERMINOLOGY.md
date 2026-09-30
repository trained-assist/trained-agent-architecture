# Терминология: согласование с OpenLineage

30.09.2026 · согласованный ориентир терминологии: OpenLineage. Маппинг ниже — предложение для Trained Assist; подключение OpenLineage SDK/backend и миграция кода не выполнены.

## Базовые сущности

| Термин | OpenLineage | Trained Assist |
|---|---|---|
| Job | Определённая работа, читающая/создающая datasets; identity = namespace + name | Описание исполняемой операции или шага. Пример: recruiter.cold_search, engineering.review. Не OS-процесс и не вся пользовательская цель |
| Run | Конкретное исполнение Job; один UUID на весь lifecycle | Agent Run для агентского исполнения; programmatic run для программного шага. Task может иметь несколько runs |
| Dataset | Именованный набор данных, объект storage или directory | Входные документы/snapshot, кандидатский набор, выходной артефакт или journal. Артефакт и dataset не полные синонимы: dataset — представление данных для lineage |
| Facet | Метаданные Job/Run/Dataset, в том числе extensions | Engine/version, region/worker, cleanRoomId, task/session IDs, attempt number, usage/cost basis. Свои facets имеют project prefix и immutable versioned schema URL |
| RunEvent | Наблюдение исполнения Job, inputs/outputs и metadata | Событие происхождения данных и жизненного цикла; проекция operational events, не команда scheduler |

**Task** сохраняется как продуктовая сущность: пользовательская цель, acceptance criteria, budget, schedule и результат. **Session** — история/контекст взаимодействия. Они не заменяются Job/Run; связываются с runs через metadata. Stable job definition отделяется от параметров конкретного пользовательского task. Один job может многократно исполняться для разных tasks. Для уникального динамического плана naming policy требует отдельного решения.

## Дополнительные термины нашей инфраструктуры

- **Agent clean room** — изолированная среда выполнения и целевой lifecycle materialize/persist/cleanup. У OpenLineage нет соответствующего базового объекта; это наше расширение.
- **Agent Runner** — инфраструктурный компонент, запускающий и наблюдающий runs. Не Job и не Run; producer lineage events может быть runner adapter.
- **Worker** — узел/процесс инфраструктуры, принимающий executions.
- **Аренда ресурса исполнения (capacity lease)** — эксклюзивное занятие ресурса worker. Текущий slot — переиспользуемый Unix user, не живой процесс. Lease/ownership не является lineage state.

## Lifecycle и retries — политика Trained Assist

OpenLineage states: START, RUNNING, COMPLETE, FAIL, ABORT, OTHER. COMPLETE/FAIL/ABORT терминальны. OTHER может передавать metadata до START, например ожидание ресурсов.

Для нас: request accepted/queued ещё не START исполнения. START означает начало конкретного run; RUNNING — обновления; COMPLETE — успешное завершение выбранной job boundary; FAIL — ошибка; ABORT — подтверждённая отмена/ненормальная остановка. Stop requested ещё не ABORT.

После terminal event новая попытка получает новый runId. Повтор доставки START/event не создаёт новый run. Provider retries внутри продолжающегося agent run учитываются как metadata/child work, а не автоматически как новый agent run. Прозрачное восстановление незавершённого run требует отдельной ownership/resume policy.

План/playbook может отображаться как parent Job/Run; его шаги — child Job/Runs с parent facet. Это наблюдаемая иерархия, не второй scheduler. Scheduler остаётся владельцем task ownership.

Execution завершение, persistence, task acceptance и delivery различаются. Если Job описывает только inference, COMPLETE не утверждает доставку пользователю. Если Job включает export, COMPLETE требует export. Границу Job нужно фиксировать; после terminal нельзя добавлять обычные события того же run. Delivery/долгое последующее validation при необходимости моделируются отдельными jobs/runs.

## Identity и metadata

Job: namespace + stable name; Dataset: namespace + name по datasource naming rules; Run: client-generated UUID, неизменный между событиями. Спецификация рекомендует UUIDv7. Operational taskId, requestId, runId и lease generation — разные идентификаторы. PID не служит durable runId. Не помещать PII и secrets в имена, facets и URLs.

Не выдавать host-local cache path за identity постоянного dataset: canonical object/profile reference и version должны переживать перемещение worker. Собственные URI namespaces и dataset granularity ещё согласуются; не объявляем их стандартными схемами OpenLineage.

## Граница применения

OpenLineage — модель наблюдаемости происхождения данных. Он не обеспечивает OS isolation, leases, budget enforcement, retries, event delivery или exactly-once effects. C01–C09 остаются operational contracts; lineage — их наблюдаемая проекция. Первым этапом синхронизируется словарь и модель events; SDK/backend выбираются отдельным решением.

## Официальные источники

- [Object Model](https://openlineage.io/docs/spec/object-model/)
- [Run Cycle](https://openlineage.io/docs/spec/run-cycle/)
- [Naming Conventions](https://openlineage.io/docs/spec/naming/)
- [Facets & Extensibility](https://openlineage.io/docs/spec/facets/)

Документация при проверке показывала версию 1.53.0; production schema/version следует pin отдельно при интеграции.

## Типы Job — решение владельца, 30.09.2026

Job остаётся общей сущностью OpenLineage, но в Trained Assist имеет обязательный `jobType`. Термины: **deterministic-job**, **llm-recipe-job**, **ai-agent-job**. Recipe — написание слова «рецепт»; это отдельный тип исполнения, не агент с отключёнными по умолчанию инструментами.

| Тип | Исполнение | Доступ к данным и действиям | Контроль результата | Среда |
|---|---|---|---|---|
| deterministic-job | Заранее заданный алгоритм/обычный код | Только явно разрешённые входы, API и ресурсы; произвольной постановки новых действий нет | Программные assertions, ошибки и retry policy | Обычный worker с ограниченными правами |
| llm-recipe-job | Заданный recipe: подготовленный input → объявленные LLM вызовы → проверенный output | Нет tools, filesystem/browser/shell и самостоятельного чтения пользовательских данных; вход готовит доверенный код | Schema/content validation; bounded retry при неверном ответе | LLM client/gateway, без Agent clean room |
| ai-agent-job | Агентский цикл с выбором следующих действий и разрешёнными tools | Может читать/писать разрешённые данные и запускать действия в рамках policy | Проверки artifacts/effects, supervision, stop, ownership и acceptance | Agent Runner + Agent clean room |

**Job type описывает режим исполнения и authority, а не гарантирует математическую детерминированность.** Deterministic-job может обращаться к внешнему API, времени или базе; при одинаковом input такой код не всегда выдаёт одинаковый output. Его последовательность действий задаётся программой.

LLM recipe может ошибиться, превысить timeout, вернуть неверный JSON или неверный смысл. Это требует validation/budget/retries, но не выдачи прав агента. Recipe может включать несколько заранее заданных LLM вызовов и программных проверок; модель не выбирает новые источники данных или tools.

### Инварианты границы

1. Тип фиксируется доверенным Job definition/host policy. Prompt или модель не могут повысить jobType либо выдать себе capabilities.
2. llm-recipe-job получает только материализованный разрешённый input; provider-native browsing/tool execution также выключены. Выбор документов выполняется отдельно доверенным кодом или отдельным ai-agent-job.
3. Ответ LLM — данные. Его нельзя автоматически исполнять как shell, SQL или произвольную команду. Downstream действие имеет отдельный контракт, validation и authority.
4. Переход recipe → agent создаёт отдельный явно разрешённый Job/Run с новой policy, cost class и clean room; retry не повышает тип незаметно.
5. Agent clean room обязательна для ai-agent-job по целевой архитектуре. Deterministic/recipe workers всё равно имеют tenant scoping, минимальные credentials и ограничения ресурсов. Если deterministic-job исполняет недоверенный пользовательский код, ему нужна отдельная изоляция исполнения; название типа не разрешает запуск с широкими правами.
6. Каждый тип использует Run lifecycle, lineage inputs/outputs, budget и failure taxonomy. Требования к supervision, mutation retries и validation зависят от типа.
7. Playbook/Task может объединять все три типа: agent выбирает кандидатов → recipe оценивает подготовленные резюме → deterministic код сохраняет оценки.

### OpenLineage projection

Наш jobType — расширение Trained Assist, не стандартные значения OpenLineage. При экспорте можно использовать custom Job facet с проектным prefix и versioned schema; конкретную schema утвердить отдельно. Не подменять им OpenLineage processingType (BATCH/STREAMING/SERVICE): это другая ось классификации.

Общий Job остаётся допустимым названием родовой сущности, но спецификации исполнения и диаграммы показывают конкретный jobType. Agent Run — только Run ai-agent-job; для остальных используются deterministic run / recipe run либо Run с явным jobType.
