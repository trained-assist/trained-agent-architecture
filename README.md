# Trained Agent Architecture

Архитектура Trained Assist и подготовка реализации. Принятые решения, предложения и подтверждённые прогоны различаются; наличие документа не означает готовность компонента.

**Статус и чек-листы — в [Project «Trained Assist — Migration»](https://github.com/orgs/trained-assist/projects/1) и issues; документы — долговечная архитектура.** Перед работой над карточкой сначала открыть её issue: там актуальный статус, чек-лист приёмки и evidence.

## Быстрый обзор для агента

Перед изучением откройте [короткую карту репозитория](https://github.com/trained-assist/trained-agent-architecture/blob/repo-context/REPO-MAP.md). Рядом лежат [Tree-sitter pack](https://github.com/trained-assist/trained-agent-architecture/blob/repo-context/repo-compressed.xml) и [manifest с sourceSha](https://github.com/trained-assist/trained-agent-architecture/blob/repo-context/manifest.json). Это постоянные ссылки на последний опубликованный main; sourceSha показывает свежесть.

Каждый PR получает свой `repo-context-<sha>` в [Repository context Actions](https://github.com/trained-assist/trained-agent-architecture/actions/workflows/repo-context.yml), а краткая карта видна в job summary. Сверяйте SHA; main-карта не описывает незамерженный PR. Генерация автоматическая, без LLM и application build. Артефакты PR хранятся 30 дней; main публикуется отдельно в ветке `repo-context`, не создавая конфликтов исходников.

Локально:

```bash
npm ci --prefix tools/repo-context --ignore-scripts
mkdir -p .repo-context/output
tools/repo-context/node_modules/.bin/repomix --config .repo-context/repomix.config.json
python3 tools/repo-context/map.py
```

Карта — ограниченный индекс, pack — структурное сжатие кода; Markdown не имеет AST-сжатия. Ограничения и исключённые пути отражаются в manifest. Перед изменением поведения откройте исходник. Если CI/публикация ещё не прошли, используйте README и локальную генерацию.

Актуальный датированный [срез реализации и критический путь](IMPLEMENTATION-AND-INTEGRATION-PLAN.md#срез-реализации-и-критический-путь--01102026-2318-мск) — в плане. На 01.10 cloud smoke завершён и Runner имеет реализацию; новый control plane ещё требует прикладного кода. Окончательная приёмка — в карточках, не по наличию файла или merged PR.

Fast-path research: [алгоритм до запуска агента и протокол исследования](TASK-ROUTER-AND-MCP.md#11-fast-path-v1-алгоритм-до-запуска-агента) и [compact catalog / explicit naming](CAPABILITY-CATALOG-AND-FAST-REPLIES.md#explicit-names-и-compact-catalog-v1--01102026). Pilot изолирован от живых компонентов и текущей приёмки PR.

## Начать разработку

1. Прочитать [ARCHITECTURE](ARCHITECTURE.md): границы, ownership, инварианты и условия перехода с живого сервиса.
2. Понять, какую ценность и кому даёт этап — [истории](stories/README.md) (ценность и шаги для человека, API-клиента, оператора). Выбрать карточку в [Project](https://github.com/orgs/trained-assist/projects/1) или таблице карточек [плана реализации и интеграции](IMPLEMENTATION-AND-INTEGRATION-PLAN.md#карточки), открыть её issue, проверить зависимости и текущий порядок работ. Номера I/P — идентификаторы, не требование выполнять всё последовательно.
   Нулевой исследовательский этап R00: [вопросы, инструменты и VM-пилоты](TOOLING-RESEARCH-AND-VM-PILOTS.md). Перед добавлением зависимости проверить её evidence/решение; весь tooling backlog читать перед каждой карточкой не требуется.
3. Прочитать [Engineering Approach](ENGINEERING-APPROACH.md) и раздел нужного этапа в [Sandbox](SANDBOX.md). Подготовка отсутствующего sandbox входит в работу.
4. Открыть только относящиеся к карточке контракты и локальные спецификации ниже.
5. Создать PR (и при необходимости issue) в implementation repo со ссылкой на issue карточки; evidence приёмки — воспроизводимый запуск, controlled failure, scoped logs — прикладывать в issue карточки и отмечать там пункты чек-листа.

Первый интеграционный сценарий нового control plane — диалог из пяти реплик с рестартом. Standalone Runner/API можно готовить параллельно; они не заменяют проверку диалога. Живой сервис продолжает работать.

## Основные документы и источники правил

| Документ | За что отвечает |
|---|---|
| [ARCHITECTURE](ARCHITECTURE.md) | Целевая модель, принятые границы, IDs и инварианты |
| [Stories](stories/README.md) | Истории: кто, ценность, шаги, «готово, когда», на каком этапе рождаются |
| [Project «Trained Assist — Migration»](https://github.com/orgs/trained-assist/projects/1) | Статус карточек и эпиков, чек-листы приёмки, блокеры и пробелы (issues) |
| [Implementation and Integration Plan](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) | Решения владельца, путь интеграции, этапы, зависимости, таблица карточек со ссылками на issues, scope, риски |
| [Task Store v1 schema](TASK-STORE-SCHEMA-V1.md) | Инвентарь прод `durable-tasks/state.db` (read-only) и целевая схема Task Store: userTaskId, журнал событий, сигналы с дедуп, awaiting input, delivery, conversation |
| [Engineering Approach](ENGINEERING-APPROACH.md) | Концепция Sandbox Driven Development и общие правила разработки |
| [Acceptance](ACCEPTANCE-CHECKLIST.md) | Типы доказательств, общий гейт Done карточки, сквозные проверки инвариантов и контрактов; где теперь лежат чек-листы. Не план и не трекер |
| [Sandbox](SANDBOX.md) | Песочница каждого этапа R00, I00–I10: что запускаем, сбои, ожидаемый результат, классы bindings/credentials, logs checks; правила и механизмы хранения credentials (без значений) |
| [Tooling Research / R00](TOOLING-RESEARCH-AND-VM-PILOTS.md) | Вопросы по всем карточкам, shortlist инструментов и измеряемые VM-пилоты; кандидаты не равны принятому stack |
| [Contracts](contracts/README.md) | Межкомпонентные обязательства; wire API имеет собственный статус согласования |
| [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md) | Общая схема ошибок/событий, scope и retention |
| [DECISIONS](DECISIONS.md) | История решений; действующая формулировка сверяется с архитектурой |

Локальная спецификация не переопределяет принятую архитектуру. Расхождение исправляется до реализации затронутого контракта. Порядок работ поддерживается в плане; общие правила не копируются в каждую карточку.

## Спецификации по выбранной работе

| Работа | Документы |
|---|---|
| Runner, API и файлы | [Runtime boundary](runtime/EXECUTION-RUNTIME.md), [Runner repo](https://github.com/trained-assist/ai-agent-runner), [Serverless API](SERVERLESS-AGENT-API.md); lifecycle данных — ARCHITECTURE §4.6 |
| Router, MCP и быстрые ответы | [Router/MCP](TASK-ROUTER-AND-MCP.md), [Capability Catalog](CAPABILITY-CATALOG-AND-FAST-REPLIES.md). Router сначала модуль control plane |
| Статусы, IDs и пользовательский ввод | [ID и Reporting](USER-TASK-IDS-AND-REPORTING.md), [Run conflict](scenarios/interaction/run-conflict-explicit-choice.md), [Stories](stories/README.md), [старые сценарии](scenarios/README.md) |
| Разговорная сессия | [Conversation contract](CONVERSATIONAL-SESSION-CONTRACT.md): границы Conversation/Task/Run, что в Task Store, resume-семантика, связь с legacy session-store |
| Планы, расписание и GTD | [Boundaries](PLAYBOOKS-VS-GETTING-THINGS-DONE-BOUNDARIES.md). GTD opt-in |
| Provider-интеграции | [External Integration Gate](EXTERNAL-INTEGRATION-GATE.md) |
| Ошибки и диагностика | [System Error Watcher](SYSTEM-ERROR-WATCHER.md), общий Observability contract |
| Модели, бюджет и учёт | [Model Gateway and Costs](MODEL-GATEWAY-AND-COSTS.md) |
| Термины | [Terminology / OpenLineage](TERMINOLOGY.md) |

Эти файлы раскрывают отдельные темы; читать весь список перед первой карточкой не требуется. Статус реализации определяется evidence, а не заголовком спецификации.

## Доказательства и история

- [P-DB comparison](pilots/p-db/COMPARISON.md) — выбор пары база/движок; локальный PASS не заменяет cloud smoke.
- [Code baseline](audits/CODE-BASELINE.md) — pinned факты текущего кода.
- [User stories audit](audits/USER-STORIES-CONSISTENCY-AUDIT-2026-09-30.md).
- [Real playbooks review](REVIEW-WITH-REAL-PLAYBOOKS.md) — виртуальная проверка модели.
- Ревью прежней архитектуры: [Claude](ARCHITECTURE_claude_2026-09-30_1926.md), [MiMo](ARCHITECTURE_mimo_review_2026-09-30.md). Это история обоснования, не альтернативные текущие архитектуры.
- [VM2 wave 0](https://instant-publish.trainedassist.store/p/vm2-wave0-done) — отчёт о запуске существующего агента 29.09.2026; применённые уроки и ограничения доказательства — [Sandbox](SANDBOX.md#уроки-пробного-запуска-vm2).

## Отдельный поток: действующий сервис

Путь интеграции с действующей системой — раздел «Путь интеграции» в [плане реализации](IMPLEMENTATION-AND-INTEGRATION-PLAN.md).

[План взаимодействия TG/Web](TG-AND-WEB-INTERACTION-REFACTORING-PLAN.md) относится к текущему продукту. Он не является очередной стадией greenfield-плана и не разрешает скрыто переключать production на новую систему.

## Как привязывать работу

В issue указывать карточку плана, ID историй (U-/API-/OPS-…), architecture_blocks (Axx), contracts (Cxx), invariants (INV-xx), нужные сценарии и evidence. Код, runnable recipes и локальные тесты живут в implementation repo; здесь — межкомпонентная модель и навигация. Статусы выполнения и чек-листы ведутся в issues и [Project](https://github.com/orgs/trained-assist/projects/1); документы не содержат чек-листов с галочками.
