# Trained Agent Architecture

Общая архитектура Trained Assist, границы репозиториев и сквозные контракты. Статус: draft · 30.09.2026. Целевая схема отделена от подтверждённого текущего кода.

## Текущая архитектура

- [ARCHITECTURE v0.3](ARCHITECTURE.md) — три схемы: сервисы/география; одна задача с результатом пользователю; GTD/playbook и внешние интеграции. IDs, ownership, миграционные границы и открытые решения.
- [Task Router and MCP](TASK-ROUTER-AND-MCP.md) — архитектура отдельного Router, быстрый reply-or-route, эскалация, context policy, роли MCP и сверка текущего pipeline.
- [Model Gateway and Costs](MODEL-GATEWAY-AND-COSTS.md) — model ladder, бюджет, Ledger и correlation расходов; цены отдельно от общей схемы.
- [User Task: ID и Reporting](USER-TASK-IDS-AND-REPORTING.md) — сквозной userTaskId и справочная по статусу.
- [Playbooks vs Getting Things Done Boundaries](PLAYBOOKS-VS-GETTING-THINGS-DONE-BOUNDARIES.md) — методика, plan, контроль, расписание, Awaiting user input и delegation.
- [Review with real playbooks](REVIEW-WITH-REAL-PLAYBOOKS.md) — виртуальный прогон 11 артефактов / 132 шагов, IDs, waits, effects и gaps.
- [Контракты](contracts/README.md) — C01–C11; распределение прежнего Orchestrator по новым владельцам.
- [Agent Runner](runtime/EXECUTION-RUNTIME.md) — clean room lifecycle и граница [ai-agent-runner](https://github.com/trained-assist/ai-agent-runner).
- [Терминология и OpenLineage](TERMINOLOGY.md) — Job/Run/Dataset и наши типы Job.
- [Пользовательские сценарии](scenarios/README.md) — исходные копии с provenance; копирование не меняет runtime readers.

## История и evidence

- [Аудит архитектуры v0.2](audits/ARCHITECTURE-0.2-CODE-AUDIT.md) — прежние факты, source revisions, A01–A13 и инварианты.
- [Linearization Step](LINEARIZATION-STEP.md) — итерация линейного Input → Router → executor → Output → user flow.
- [Brainstorm: core и репозитории](BRAINSTORM-CORE-AND-REPOSITORIES.md) — ранние варианты; controller/conversation идеи не заменяют текущую v0.3.

## Как привязывать работу

В эпиках указывать architecture_blocks (Axx), contracts (Cxx), invariants (INV-xx), scenario links, текущий пробел, целевой контракт и evidence приёмки. Архитектуру и межсервисные сценарии описывать здесь; код, локальные implementation docs и тесты — в репозитории соответствующего сервиса. Статусы выполнения — в issues/трекере.
