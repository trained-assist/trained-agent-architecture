# Repository map

Source: `trained-assist/trained-agent-architecture@0c50d20bd378793fec2ffb7d03a6c982da988697`

Generated structurally, without LLM. This index is incomplete by design; open source before changing behavior.
Code details: `repo-compressed.xml` (Tree-sitter). Manifest: `manifest.json`.

## Start here

- [README.md](https://github.com/trained-assist/trained-agent-architecture/blob/0c50d20bd378793fec2ffb7d03a6c982da988697/README.md)
- [ARCHITECTURE.md](https://github.com/trained-assist/trained-agent-architecture/blob/0c50d20bd378793fec2ffb7d03a6c982da988697/ARCHITECTURE.md)
- [IMPLEMENTATION-AND-INTEGRATION-PLAN.md](https://github.com/trained-assist/trained-agent-architecture/blob/0c50d20bd378793fec2ffb7d03a6c982da988697/IMPLEMENTATION-AND-INTEGRATION-PLAN.md)
- [ENGINEERING-APPROACH.md](https://github.com/trained-assist/trained-agent-architecture/blob/0c50d20bd378793fec2ffb7d03a6c982da988697/ENGINEERING-APPROACH.md)
- [SANDBOX.md](https://github.com/trained-assist/trained-agent-architecture/blob/0c50d20bd378793fec2ffb7d03a6c982da988697/SANDBOX.md)
- [AGENTS.md](https://github.com/trained-assist/trained-agent-architecture/blob/0c50d20bd378793fec2ffb7d03a6c982da988697/AGENTS.md)

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
- `ACCEPTANCE-CHECKLIST.md` — Приёмка: принципы, общий гейт и сквозные проверки; 1. Назначение и как пользоваться; 2. Общий гейт карточки (Done)
- `AGENT-RUNNER-DATA-PERSISTENCE-IMPLEMENTATION.md` — Запуск агента с сохранением данных: имплементационная архитектура шагов 1–2; 1. Область; 2. Что уже построено и проверено (legacy, M2-контур #1784)
- `AGENTS.md` — Repository entry point
- `ARCHITECTURE.md` — Архитектура Trained Assist; 0. Коротко; 1. Цель и границы
- `ARCHITECTURE_claude-opus-5-5_2026-09-30-1848.md` — Ревью ARCHITECTURE v0.6 и плана реализации — Claude Opus 5.5; Итог; Главные замечания
- `ARCHITECTURE_claude_2026-09-30_1926.md` — Ревью ARCHITECTURE.md v0.6 от Claude; 1. Вердикт в трёх фразах; 2. Что хорошо (коротко)
- `ARCHITECTURE_mimo_review_2026-09-30.md` — Ревью ARCHITECTURE.md v0.6 и связанных документов; 1. Вердикт; 2. Сильные стороны
- `CAPABILITY-CATALOG-AND-FAST-REPLIES.md` — Capability Catalog и быстрые ответы; Четыре режима, три Job types; Метаданные
- `CONVERSATIONAL-SESSION-CONTRACT.md` — Контракт разговорной сессии; 1. Терминология: «сессия» — три разных слова; 2. Что живёт в Task Store и что там не живёт
- `DECISIONS.md` — Решения по архитектуре
- `ENGINEERING-APPROACH.md` — Engineering Approach — Sandbox Driven Development; Концепция; Общие правила
- `EXTERNAL-INTEGRATION-GATE.md` — External Integration Gate; Граница; Контракт
- `IMPLEMENTATION-AND-INTEGRATION-PLAN.md` — План реализации и интеграции Trained Assist; Решение владельца: новая реализация параллельно живому сервису; Review исходного предложения
- `INTERACTIVE-EXECUTION-AND-USER-INPUT.md` — Интерактивное выполнение: формы, выбор и Awaiting user input; 1. Проблема и цель; 2. Две независимые оси
- `MODEL-GATEWAY-AND-COSTS.md` — Model Gateway, Ladder и стоимость; Принятая граница эскалации; Ответственность
- `OBSERVABILITY-AND-ERROR-CONTRACT.md` — Observability: errors, events и retention; Приоритеты; Общий ErrorEvent
- `PLAYBOOKS-VS-GETTING-THINGS-DONE-BOUNDARIES.md` — Playbooks vs Getting Things Done Boundaries; Решение владельца: GTD только там, где нужен следующий контроль; 1. Контекст: какие противоречия разрешаем
- `README.md` — Trained Agent Architecture; Быстрый обзор для агента; Начать разработку
- `REVIEW-WITH-REAL-PLAYBOOKS.md` — Review with real playbooks; Уточнение модели после review — 30.09.2026; 1. Что прочитано
- `SANDBOX.md` — Sandbox — как строится и проверяется песочница каждого этапа; Что означает «fixture обязателен»; Главная граница: живой сервис сохраняется
- `SERVERLESS-AGENT-API.md` — Serverless Agent API; Граница и минимальный путь; Логический API
- `SYSTEM-ERROR-WATCHER.md` — System Error Watcher; Цель; Предусловие: registered scoped error sources
- `TASK-ROUTER-AND-MCP.md` — Task Router — routing, fast replies и MCP; Принятая policy 30.09.2026; 1. Ответственность
- `TASK-STORE-SCHEMA-V1.md` — Task Store v1: схема — инвентарь прода и целевое состояние; 1. Как снят инвентарь (метод и воспроизводимость); 2. Факты масштаба
- `TERMINOLOGY.md` — Терминология: согласование с OpenLineage; Базовые сущности; Дополнительные термины нашей инфраструктуры
- `TG-AND-WEB-INTERACTION-REFACTORING-PLAN.md` — Рефакторинг взаимодействия в Telegram и связки с вебом; 1. Границы плана; 2. Факты: как устроено сейчас
- `TOOLING-RESEARCH-AND-VM-PILOTS.md` — R00 — обзор инструментов и проверка на VM; Зачем этот этап; Вопросы по всему плану
- `USER-TASK-IDS-AND-REPORTING.md` — User Task: идентификаторы и Reporting; 1. Главный ID — userTaskId; 2. Reporting — «справочная», Report to User — отправка
- `audits/CODE-BASELINE.md` — Code baseline: подтверждённая реализация и ограничения; Ограничения найденного кода; Pinned sources
- `audits/LEGACY-LEARNINGS-TRAINED-ASSIST-AGENT-2026-09-30.md` — Опыт legacy-системы (trained-assist-agent) к переносу в новую архитектуру; 1. Статус эпиков legacy на дату; 2. Что построено сегодня (30.09.2026) — PR в legacy-репо
- `audits/TG-BOT-RESUMABLE-CODE-AND-WHAT-TO-REVIEW.md` — TG bot resumable code and what to review; 0. Короткие ответы; 1. Полный путь входящего сообщения (origin/main)
- `audits/USER-STORIES-CONSISTENCY-AUDIT-2026-09-30.md` — Аудит согласованности юзер-стори — 30.09.2026; 1. Находки; 2. Что проверено и не нашлось противоречий
- `checklist.md` — Checklist
- `contracts/README.md` — Контракты между сервисами; Уточнение владельцев v0.3; Что называем контрактом
- `docs/inventory/README.md` — Inventory (Z01 · AC-40); Files; Regenerate
- `docs/inventory/repo-coverage.json`
- `docs/inventory/repo-coverage.md` — Repository coverage
- `docs/inventory/repo-coverage.stable.json`
- `eval/fast-replies/anchor-review.v1.jsonl`

Omitted from short index: 146 paths. Full inventory is in manifest.json.
