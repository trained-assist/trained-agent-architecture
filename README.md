# Trained Agent Architecture

Общая архитектура Trained Assist, границы репозиториев и сквозные контракты. Статус: актуальная целевая модель · 30.09.2026. Целевая схема отделена от подтверждённого текущего кода.

## Текущая архитектура

- [ARCHITECTURE v0.7](ARCHITECTURE.md) — ключевые решения на первом экране; база состояния задач и движок исполнения за Workflow Port; разговорная сессия; что берём из текущего прода (с вердиктами); IDs, ownership, переход и открытые решения.
- [DECISIONS](DECISIONS.md) — журнал решений владельца по датам.
- Ревью v0.6: [MiMo](ARCHITECTURE_mimo_review_2026-09-30.md), [Claude](ARCHITECTURE_claude_2026-09-30_1926.md).
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

- [Engineering Approach — Sandbox Driven Development](ENGINEERING-APPROACH.md) — воспроизводимая среда, fault fixtures, free-only smoke и acceptance.
- [Capability Catalog and Fast Replies](CAPABILITY-CATALOG-AND-FAST-REPLIES.md) — четыре режима, scoped brief, required-input UX и сравнение одного/двух LLM этапов.

## Рабочий план

- [План реализации и интеграции](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) — 33 work items, dependencies, новая параллельная реализация и отдельный pilot/cutover с rollback.
- [Sandbox Plan](SANDBOX-PLAN.md) — real-service scenarios, controlled provider failures, sandbox construction и обязательные logs checks каждого этапа.

GitHub Project пока отложен. Production и старые репозитории сохраняются; runtime GTD не является development board.

## Проверка реализации

- [Code baseline](audits/CODE-BASELINE.md) — факты и ограничения существующего кода с pinned sources; без альтернативной архитектуры.
- [Review with real playbooks](REVIEW-WITH-REAL-PLAYBOOKS.md) — проверка выбранной модели реальными доменными артефактами.

## Как привязывать работу

В эпиках указывать architecture_blocks (Axx), contracts (Cxx), invariants (INV-xx), scenario links, текущий пробел, целевой контракт и evidence приёмки. Архитектуру и межсервисные сценарии описывать здесь; код, локальные implementation docs и тесты — в репозитории соответствующего сервиса. Статусы выполнения — в issues/трекере.
