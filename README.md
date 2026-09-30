# Trained Agent Architecture

Архитектура Trained Assist и подготовка реализации. Принятые решения, предложения и подтверждённые прогоны различаются; наличие документа не означает готовность компонента.

## Начать разработку

1. Прочитать [ARCHITECTURE](ARCHITECTURE.md): границы, ownership, инварианты и условия перехода с живого сервиса.
2. Выбрать карточку в [плане реализации и интеграции](IMPLEMENTATION-AND-INTEGRATION-PLAN.md), проверить зависимости и текущий порядок работ. Номера I/P — идентификаторы, не требование выполнять всё последовательно.
3. Прочитать [Engineering Approach](ENGINEERING-APPROACH.md) и нужный рецепт из [Sandbox Plan](SANDBOX-PLAN.md). Подготовка отсутствующего sandbox входит в работу.
4. Открыть только относящиеся к карточке контракты и локальные спецификации ниже.
5. Создать issue/PR в implementation repo; приложить воспроизводимый запуск, controlled failure, scoped logs и evidence приёмки.

Первый интеграционный сценарий нового control plane — диалог из пяти реплик с рестартом. Standalone Runner/API можно готовить параллельно; они не заменяют проверку диалога. Живой сервис продолжает работать.

## Основные документы и источники правил

| Документ | За что отвечает |
|---|---|
| [ARCHITECTURE](ARCHITECTURE.md) | Целевая модель, принятые границы, IDs и инварианты |
| [Implementation and Integration Plan](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) | Порядок, зависимости, scope и специфическая приёмка карточек |
| [Engineering Approach](ENGINEERING-APPROACH.md) | Концепция Sandbox Driven Development и общие правила разработки |
| [Sandbox Plan](SANDBOX-PLAN.md) | Практические среды, сценарии сбоев, пробелы и logs checks по этапам |
| [Contracts](contracts/README.md) | Межкомпонентные обязательства; wire API имеет собственный статус согласования |
| [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md) | Общая схема ошибок/событий, scope и retention |
| [DECISIONS](DECISIONS.md) | История решений; действующая формулировка сверяется с архитектурой |

Локальная спецификация не переопределяет принятую архитектуру. Расхождение исправляется до реализации затронутого контракта. Порядок работ поддерживается в плане; общие правила не копируются в каждую карточку.

## Спецификации по выбранной работе

| Работа | Документы |
|---|---|
| Runner, API и файлы | [Runtime boundary](runtime/EXECUTION-RUNTIME.md), [Runner repo](https://github.com/trained-assist/ai-agent-runner), [Serverless API](SERVERLESS-AGENT-API.md); lifecycle данных — ARCHITECTURE §4.6 |
| Router, MCP и быстрые ответы | [Router/MCP](TASK-ROUTER-AND-MCP.md), [Capability Catalog](CAPABILITY-CATALOG-AND-FAST-REPLIES.md). Router сначала модуль control plane |
| Статусы, IDs и пользовательский ввод | [ID и Reporting](USER-TASK-IDS-AND-REPORTING.md), [Run conflict](scenarios/interaction/run-conflict-explicit-choice.md), [Scenarios](scenarios/README.md) |
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
- [VM2 wave 0](https://instant-publish.trainedassist.store/p/vm2-wave0-done) — отчёт о запуске существующего агента 29.09.2026; применённые уроки и ограничения доказательства — Sandbox Plan.

## Отдельный поток: действующий сервис

[План взаимодействия TG/Web](TG-AND-WEB-INTERACTION-REFACTORING-PLAN.md) относится к текущему продукту. Он не является очередной стадией greenfield-плана и не разрешает скрыто переключать production на новую систему.

## Как привязывать работу

В issue указывать карточку плана, architecture_blocks (Axx), contracts (Cxx), invariants (INV-xx), нужные сценарии и evidence. Код, runnable recipes и локальные тесты живут в implementation repo; здесь — межкомпонентная модель и навигация. Статусы выполнения ведутся в issues/трекере. GitHub Project пока отложен.
