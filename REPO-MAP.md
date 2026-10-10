# Repository map

Source: `trained-assist/trained-agent-architecture@44229b0aeb1aa3326997d67a27a9ae4ffe6a9fed`

Generated structurally, without LLM. This index is incomplete by design; open source before changing behavior.
Code details: `repo-compressed.xml` (Tree-sitter). Manifest: `manifest.json`.

## Start here

- [README.md](https://github.com/trained-assist/trained-agent-architecture/blob/44229b0aeb1aa3326997d67a27a9ae4ffe6a9fed/README.md)
- [ARCHITECTURE.md](https://github.com/trained-assist/trained-agent-architecture/blob/44229b0aeb1aa3326997d67a27a9ae4ffe6a9fed/ARCHITECTURE.md)
- [IMPLEMENTATION-AND-INTEGRATION-PLAN.md](https://github.com/trained-assist/trained-agent-architecture/blob/44229b0aeb1aa3326997d67a27a9ae4ffe6a9fed/IMPLEMENTATION-AND-INTEGRATION-PLAN.md)
- [ENGINEERING-APPROACH.md](https://github.com/trained-assist/trained-agent-architecture/blob/44229b0aeb1aa3326997d67a27a9ae4ffe6a9fed/ENGINEERING-APPROACH.md)
- [SANDBOX.md](https://github.com/trained-assist/trained-agent-architecture/blob/44229b0aeb1aa3326997d67a27a9ae4ffe6a9fed/SANDBOX.md)
- [AGENTS.md](https://github.com/trained-assist/trained-agent-architecture/blob/44229b0aeb1aa3326997d67a27a9ae4ffe6a9fed/AGENTS.md)

## Tracked source index

Paths and Markdown headings; generated data and sensitive paths excluded.

- `.github/workflows/ci-fix-cleanup.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/coverage-drift.yml`
- `.github/workflows/pr-autofix.yml`
- `.github/workflows/repo-context.yml`
- `.github/workflows/stories-check.yml`
- `.gitignore`
- `.repo-context/.gitignore`
- `.repo-context/repomix.config.json`
- `ACCEPTANCE-CHECKLIST.md` — Architecture Acceptance Protocol; Change-management acceptance; Общие safeguards и evidence
- `AGENT-RUNNER-DATA-PERSISTENCE-IMPLEMENTATION.md` — Запуск агента с сохранением данных: имплементационная архитектура шагов 1–2; 1. Область; 2. Что уже построено и проверено (legacy, M2-контур #1784)
- `AGENTS.md` — Repository entry point; GCP VM exit; Local credentials
- `ARCHITECTURE.md` — Архитектура Trained Assist; 0. Коротко; 1. Цель и границы
- `ARCHITECTURE_claude-opus-5-5_2026-09-30-1848.md` — Ревью ARCHITECTURE v0.6 и плана реализации — Claude Opus 5.5; Итог; Главные замечания
- `ARCHITECTURE_claude_2026-09-30_1926.md` — Ревью ARCHITECTURE.md v0.6 от Claude; 1. Вердикт в трёх фразах; 2. Что хорошо (коротко)
- `ARCHITECTURE_mimo_review_2026-09-30.md` — Ревью ARCHITECTURE.md v0.6 и связанных документов; 1. Вердикт; 2. Сильные стороны
- `CAPABILITY-CATALOG-AND-FAST-REPLIES.md` — Capability Catalog и быстрые ответы; Четыре режима, три Job types; Метаданные
- `CONNECTED-APPLICATIONS-AND-AI-LAYERS.md` — Connected Applications: слои, AI capabilities и извлечение доменов; 1. Модель и термины; 2. Основные правила ownership
- `CONNECTED-APPS-OFFLINE-MCP-TESTING.md` — Connected Applications: автономность и offline-тестирование без Agent Run; 1. Главный инвариант: Agent-optional application; 2. Инструментарий и явные контракты
- `CONVERSATIONAL-SESSION-CONTRACT.md` — Контракт разговорной сессии; 1. Терминология: «сессия» — три разных слова; 2. Что живёт в Task Store и что там не живёт
- `DECISIONS.md` — Решения по архитектуре
- `ENGINEERING-APPROACH.md` — Engineering Approach — Sandbox Driven Development; Концепция; Persistent instructions Codex
- `EXTERNAL-INTEGRATION-GATE.md` — External Integration Gate; Граница; Контракт
- `GCP-VM-EXIT-RUNBOOK.md` — Вывод старой GCP VM: runbook cutoff; Ресурс и подтверждённая исходная точка; Инвентарь и целевой путь
- `IMPLEMENTATION-AND-INTEGRATION-PLAN.md` — План реализации и интеграции Trained Assist; Решение владельца 05.10.2026: вывод старой GCP VM; Решение владельца: новая реализация параллельно живому сервису
- `INTERACTIVE-EXECUTION-AND-USER-INPUT.md` — Интерактивное выполнение: формы, выбор и Awaiting user input; 1. Проблема и цель; 2. Две независимые оси
- `LEGACY-PROFILE-DATA-SCRIPTS.md` — Legacy profile data scripts: inventory and lifecycle; Source snapshot and limits; Migration CLI and shared machinery
- `MCP-CAPABILITY-REVIEW.md` — MCP / capabilities review — R1 evidence snapshot; Evidence and revision pins; Prompt composition trace (static)
- `MODEL-GATEWAY-AND-COSTS.md` — Model Gateway, Ladder и стоимость; Принятая граница эскалации; Ответственность
- `OBSERVABILITY-AND-ERROR-CONTRACT.md` — Observability: errors, events и retention; Приоритеты; Общий ErrorEvent
- `PLAYBOOKS-VS-GETTING-THINGS-DONE-BOUNDARIES.md` — Playbooks vs Getting Things Done Boundaries; Решение владельца: GTD только там, где нужен следующий контроль; 1. Контекст: какие противоречия разрешаем
- `README.md` — Trained Agent Architecture; Быстрый обзор для агента; Начать разработку
- `REQUIREMENTS_LOG.md` — Requirements log
- `REVIEW-WITH-REAL-PLAYBOOKS.md` — Review with real playbooks; Уточнение модели после review — 30.09.2026; 1. Что прочитано
- `SANDBOX.md` — Sandbox — как строится и проверяется песочница каждого этапа; Что означает «fixture обязателен»; Главная граница: живой сервис сохраняется
- `SCENARIO-CHANGE-MANAGEMENT.md` — Architecture Change Management & Acceptance; Область процесса; Владение артефактами
- `SERVERLESS-AGENT-API.md` — Serverless Agent API; Граница и минимальный путь; Логический API
- `SYSTEM-ERROR-WATCHER.md` — System Error Watcher; Цель; Предусловие: registered scoped error sources
- `TASK-ROUTER-AND-MCP.md` — Task Router — routing, fast replies и MCP; Принятая policy 30.09.2026; 1. Ответственность
- `TASK-STORE-SCHEMA-V1.md` — Task Store v1: схема — инвентарь прода и целевое состояние; 1. Как снят инвентарь (метод и воспроизводимость); 2. Факты масштаба
- `TERMINOLOGY.md` — Терминология: согласование с OpenLineage; Базовые сущности; Дополнительные термины нашей инфраструктуры
- `TG-AND-WEB-INTERACTION-REFACTORING-PLAN.md` — Рефакторинг взаимодействия в Telegram и связки с вебом; 1. Границы плана; 2. Факты: как устроено сейчас
- `TOOLING-RESEARCH-AND-VM-PILOTS.md` — R00 — обзор инструментов и проверка на VM; Зачем этот этап; Вопросы по всему плану
- `USER-TASK-IDS-AND-REPORTING.md` — User Task: идентификаторы и Reporting; 1. Главный ID — userTaskId; 2. Reporting — «справочная», Report to User — отправка
- `audits/CODE-BASELINE.md` — Code baseline: подтверждённая реализация и ограничения; Ограничения найденного кода; Pinned sources
- `docs/inventory/README.md` — Inventory (Z01 · AC-40); Files; Regenerate

Omitted from short index: 168 paths. Full inventory is in manifest.json.
