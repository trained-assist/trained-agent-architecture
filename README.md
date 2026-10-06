# Trained Agent Architecture

Декларативная архитектура Trained Assist: границы компонентов, ownership, контракты, идентификаторы и пользовательские сценарии.

Документы содержат действующие требования, контракты и инструкции. Планы выполнения, статусы, ревью прошлых версий и evidence ведутся в GitHub issues/PR/Project. Целевая модель не является утверждением о текущем deployment; его готовность проверяется по конкретным SHA и приёмке.

**Где что живёт:** [карта всех репозиториев](REPOSITORIES.md) — основной контур, доменные capabilities, legacy-границы, отдельные продукты, benchmarks и test fixtures. Активная разработка и live использование различаются.

[Workspace Views и доступ внешних сервисов](WORKSPACE-VIEWS-AND-CONSUMER-ACCESS.md) — проектный контракт доступа к выбранной папке через HTTP/Git, dev/main и scoped grants.

[Publication adapters](PUBLICATION-ADAPTERS.md) — общий контракт публикации папок в Cloudflare, Yandex и Google; [пилот миграции сайтов Люды #163](https://github.com/trained-assist/trained-agent-architecture/issues/163).

## Начать работу

1. [ARCHITECTURE.md](ARCHITECTURE.md) — единая целевая модель и инварианты.
2. [Stories](stories/README.md) — пользовательские требования; [Contracts](contracts/README.md) — межсервисные обязательства.
3. [Engineering Approach](ENGINEERING-APPROACH.md) — Sandbox Driven Development; [Sandbox](SANDBOX.md) — воспроизводимые среды и controlled failures.
4. [Integration dependencies](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) — условия интеграции и ссылки на владельцев задач. Статус — в issue выбранной задачи и [Project](https://github.com/orgs/trained-assist/projects/1).
5. Открыть только локальную спецификацию нужного компонента. Наличие спецификации не означает, что её реализация принята.

## Владельцы активных работ

| Граница | Источник статуса |
|---|---|
| Сквозной контур | [Integrator #140](https://github.com/trained-assist/trained-agent-architecture/issues/140) |
| Постоянный профиль и публикация | [Runner #95](https://github.com/trained-assist/ai-agent-runner/issues/95) |
| Региональные workers | [Runner #136](https://github.com/trained-assist/ai-agent-runner/issues/136) |
| Вывод GCP VM | [#145](https://github.com/trained-assist/trained-agent-architecture/issues/145), [runbook](GCP-VM-EXIT-RUNBOOK.md) |
| MCP/capabilities | [#146](https://github.com/trained-assist/trained-agent-architecture/issues/146) |

Новые нагрузки на retiring GCP VM запрещены. Serverless — по умолчанию; постоянный процесс при необходимости размещается на существующей VM во Франции. Другие сервисы Google разрешены. Кандидат, пользовательские данные и артефакты сохраняются и проверяются до удаления временной среды.

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

## Спецификации по выбранной работе

| Работа | Документы |
|---|---|
| Runner, API и файлы | [Runtime boundary](runtime/EXECUTION-RUNTIME.md), [Runner repo](https://github.com/trained-assist/ai-agent-runner), [Serverless API](SERVERLESS-AGENT-API.md), [Запуск и сохранение данных](AGENT-RUNNER-DATA-PERSISTENCE-IMPLEMENTATION.md); lifecycle данных — ARCHITECTURE §4.6 |
| Router, MCP и быстрые ответы | [Router/MCP](TASK-ROUTER-AND-MCP.md), [Capability Catalog](CAPABILITY-CATALOG-AND-FAST-REPLIES.md). Router сначала модуль control plane |
| Статусы, IDs и пользовательский ввод | [ID и Reporting](USER-TASK-IDS-AND-REPORTING.md), [Run conflict](scenarios/interaction/run-conflict-explicit-choice.md), [Stories](stories/README.md), [взаимодействие](scenarios/README.md) |
| Разговорная сессия | [Conversation contract](CONVERSATIONAL-SESSION-CONTRACT.md): границы Conversation/Task/Run, что в Task Store, resume-семантика, связь с legacy session-store |
| Планы, расписание и GTD | [Boundaries](PLAYBOOKS-VS-GETTING-THINGS-DONE-BOUNDARIES.md). GTD opt-in |
| Provider-интеграции | [External Integration Gate](EXTERNAL-INTEGRATION-GATE.md) |
| Ошибки и диагностика | [System Error Watcher](SYSTEM-ERROR-WATCHER.md), общий Observability contract |
| Модели, бюджет и учёт | [Model Gateway and Costs](MODEL-GATEWAY-AND-COSTS.md) |
| Термины | [Terminology / OpenLineage](TERMINOLOGY.md) |

Эти файлы раскрывают отдельные темы; читать весь список перед первой карточкой не требуется. Статус реализации определяется evidence, а не заголовком спецификации.

## Как поддерживать документы

README — вход и навигация; ARCHITECTURE — модель; локальные спецификации раскрывают контракт без копирования статусов. Открытая работа ведётся в issues. Доказательство хранит проверенную source/deployed revision и ограничение проверки. История удалённых редакций сохранена по pinned Git-ссылкам в [#161](https://github.com/trained-assist/trained-agent-architecture/issues/161); её не нужно читать для начала новой задачи.

Изменение целевой границы оформляется в её единственном документе-владельце; wire contract и сценарий синхронизируются в том же PR. Генерируемые индексы вручную не редактируются.
