# Trained Agent Architecture

Общая архитектура Trained Assist, границы репозиториев и сквозные контракты. Статус: актуальная целевая модель · 30.09.2026. Целевая схема отделена от подтверждённого текущего кода.

## Текущая архитектура

- [ARCHITECTURE v0.6](ARCHITECTURE.md) — три схемы: сервисы/география; одна задача с результатом пользователю; GTD/playbook и внешние интеграции. IDs, ownership, миграционные границы и открытые решения.
- [Task Router and MCP](TASK-ROUTER-AND-MCP.md) — архитектура отдельного Router, быстрый reply-or-route, эскалация, context policy, роли MCP и сверка текущего pipeline.
- [Model Gateway and Costs](MODEL-GATEWAY-AND-COSTS.md) — model ladder, бюджет, Ledger и correlation расходов; цены отдельно от общей схемы.
- [External Integration Gate](EXTERNAL-INTEGRATION-GATE.md) — отдельный repo, provider APIs/webhooks, transport adapters и extraction boundary.
- [System Error Watcher](SYSTEM-ERROR-WATCHER.md) — подключаемый repo, incidents, suppression, LLM/OpenCode diagnosis и report.
- [Serverless Agent API](SERVERLESS-AGENT-API.md) — isolated runs по ключам/scopes без обязательных GTD/frontend/playbooks.
- [Observability и error contract](OBSERVABILITY-AND-ERROR-CONTRACT.md) — обязательные profile/correlation/reply context, registered sources, lifecycle events, TTL и sandbox acceptance.
- [User Task: ID и Reporting](USER-TASK-IDS-AND-REPORTING.md) — сквозной userTaskId и справочная по статусу.
- [Playbooks vs Getting Things Done Boundaries](PLAYBOOKS-VS-GETTING-THINGS-DONE-BOUNDARIES.md) — методика, plan, контроль, расписание, Awaiting user input и delegation.
- [Review with real playbooks](REVIEW-WITH-REAL-PLAYBOOKS.md) — виртуальный прогон 11 артефактов / 132 шагов, IDs, waits, effects и gaps.
- [Контракты](contracts/README.md) — C01–C13; распределение прежнего Orchestrator по новым владельцам.
- [Agent Runner](runtime/EXECUTION-RUNTIME.md) — clean room lifecycle и граница [ai-agent-runner](https://github.com/trained-assist/ai-agent-runner).
- [Терминология и OpenLineage](TERMINOLOGY.md) — Job/Run/Dataset и наши типы Job.
- [Пользовательские сценарии](scenarios/README.md) — исходные копии с provenance; копирование не меняет runtime readers.
- [Run conflict — явный выбор](scenarios/interaction/run-conflict-explicit-choice.md) — новая задача во время работающего рана: меню «в очередь / параллельно / стоп с добавкой / стоп → новая / подождать» вместо скрытого запрета; кнопочная гигиена (RC-01…RC-08).

- [Engineering Approach — Sandbox Driven Development](ENGINEERING-APPROACH.md) — воспроизводимая среда, fault fixtures, free-only smoke и acceptance.
- [Capability Catalog and Fast Replies](CAPABILITY-CATALOG-AND-FAST-REPLIES.md) — четыре режима, scoped brief, required-input UX и сравнение одного/двух LLM этапов.

## Рабочий план

- [План реализации и интеграции](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) — 33 work items, dependencies, новая параллельная реализация и отдельный pilot/cutover с rollback.
- [Рефакторинг взаимодействия TG и связки с вебом](TG-AND-WEB-INTERACTION-REFACTORING-PLAN.md) — факты двух существующих блокировок, решения владельца 30.09 и фазы Ф0–Ф6 действующего сервиса (скрытый запрет → явный выбор).
- [Sandbox Plan](SANDBOX-PLAN.md) — real-service scenarios, controlled provider failures, sandbox construction и обязательные logs checks каждого этапа.

GitHub Project пока отложен. Production и старые репозитории сохраняются; runtime GTD не является development board.

## Проверка реализации

- [Code baseline](audits/CODE-BASELINE.md) — факты и ограничения существующего кода с pinned sources; без альтернативной архитектуры.
- [Аудит юзер-стори 30.09](audits/USER-STORIES-CONSISTENCY-AUDIT-2026-09-30.md) — противоречия и устаревания существующих юзер-стори (A-1…A-10) и правила их ведения отныне.
- [Review with real playbooks](REVIEW-WITH-REAL-PLAYBOOKS.md) — проверка выбранной модели реальными доменными артефактами.

## Как привязывать работу

В эпиках указывать architecture_blocks (Axx), contracts (Cxx), invariants (INV-xx), scenario links, текущий пробел, целевой контракт и evidence приёмки. Архитектуру и межсервисные сценарии описывать здесь; код, локальные implementation docs и тесты — в репозитории соответствующего сервиса. Статусы выполнения — в issues/трекере.
