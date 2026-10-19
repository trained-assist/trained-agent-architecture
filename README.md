# Trained Agent Architecture

Engineering queue pilot: [workflow and agent prompts](AGENT-ENGINEERING-WORKFLOW.md),
[process epic #286](https://github.com/trained-assist/trained-agent-architecture/issues/286).

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

Проверяемая целевая схема Runner и границы ownership — в [ARCHITECTURE](ARCHITECTURE.md), [Serverless Runner API](SERVERLESS-AGENT-API.md), [C04](contracts/README.md#c04--placement-и-execution-runner) и [сценарии](scenarios/operations/SC-OPS-RUNNER-DEFAULT-01-serverless-to-france-worker.md). Актуальные реализации, deployment evidence и блокеры фиксируются в owning issues и Environment Contracts; старые датированные срезы реализации из плана удалены, чтобы не путать их с целевой схемой.

Fast-path research: [алгоритм до запуска агента и протокол исследования](TASK-ROUTER-AND-MCP.md#11-fast-path-v1-алгоритм-до-запуска-агента) и [compact catalog / explicit naming](CAPABILITY-CATALOG-AND-FAST-REPLIES.md#explicit-names-и-compact-catalog-v1--01102026). Pilot изолирован от живых компонентов и текущей приёмки PR.

Интерактивность: [формы, кнопки, Awaiting user input и research B](INTERACTIVE-EXECUTION-AND-USER-INPUT.md). End-to-end не запрещает вопросы; формы открываются host handler без нового Agent Run.

Приёмка ввода и стартовые окна: [SC-START-01](scenarios/interaction/SC-START-01-input-start-window.md). Общие правила Architecture Change Management & Acceptance (включая сценарии для пользователя, агента, API, оператора и QA) — [SCENARIO-CHANGE-MANAGEMENT.md](SCENARIO-CHANGE-MANAGEMENT.md).

## Начать разработку

Сначала классифицируйте изменение. Если меняется ожидаемое поведение, flow, публичный/inter-component контракт или роли акторов — следуйте [Architecture Change Management & Acceptance](SCENARIO-CHANGE-MANAGEMENT.md) и откройте scenario-change issue/PR до runtime-кода. Если это bugfix, возвращающий уже принятое поведение, scenario PR не нужен: работайте через issue и обычный implementation PR/CI owning repository. Пока acceptance gates не автоматизированы, агент запускает и записывает их вручную, используя Environment Contracts.

1. Прочитать [ARCHITECTURE](ARCHITECTURE.md): границы, ownership, инварианты и условия перехода с живого сервиса.
2. Понять, какую ценность и кому даёт этап — [истории](stories/README.md) (ценность и шаги для человека, API-клиента, оператора). Выбрать карточку в [Project](https://github.com/orgs/trained-assist/projects/1) или таблице карточек [плана реализации и интеграции](IMPLEMENTATION-AND-INTEGRATION-PLAN.md#карточки), открыть её issue, проверить зависимости и текущий порядок работ. Номера I/P — идентификаторы, не требование выполнять всё последовательно.
   Нулевой исследовательский этап R00: [вопросы, инструменты и VM-пилоты](TOOLING-RESEARCH-AND-VM-PILOTS.md). Перед добавлением зависимости проверить её evidence/решение; весь tooling backlog читать перед каждой карточкой не требуется.
3. Прочитать [Engineering Approach](ENGINEERING-APPROACH.md) и раздел нужного этапа в [Sandbox](SANDBOX.md). Для живых Telegram-проверок сначала сверить занятость и общий downstream в разделе [Live Telegram test lanes](SANDBOX.md#live-telegram-test-lanes). Подготовка отсутствующего sandbox входит в работу.
4. Открыть только относящиеся к карточке контракты и локальные спецификации ниже.
5. Создать PR (и при необходимости issue) в implementation repo со ссылкой на issue карточки; evidence приёмки — воспроизводимый запуск, controlled failure, scoped logs — прикладывать в issue карточки и отмечать там пункты чек-листа.

Первый интеграционный сценарий нового control plane — диалог из пяти реплик с рестартом. Standalone Runner/API можно готовить параллельно; они не заменяют проверку диалога. Живой сервис продолжает работать.

## Проверка и продвижение изменений

Порядок для изменения: обычный bugfix идёт через issue → implementation PR → CI/tests owning repository. Если меняется ожидаемое поведение, flow, публичный/inter-component контракт или роли акторов, сначала открывается scenario-change PR в architecture repo, затем реализация. Проверка проходит по [Architecture Acceptance Protocol](ACCEPTANCE-CHECKLIST.md) и [Architecture Change Management & Acceptance](SCENARIO-CHANGE-MANAGEMENT.md):

1. **Draft PR / обычный PR.** Implementation PR связывается с issue карточки и pinned revision. Для behavior change scenario-change PR остаётся открытым до готовности реализации.
2. **Согласование сценариев (Gate 1).** Semantic review: соответствует ли реализуемый код изменению сценария. Только `PASS` проходит; `FAIL` и `UNCLEAR` блокируют.
3. **Проверка компонентов (Gate 2).** Небольшой verification plan по изменённым наблюдаемым шагам через endpoint/API/fixture/UI adapter; команды, base URLs, test identities и reset берутся из Environment Contracts.
4. **Sandbox tests.** Прогоны на доступных линиях: [Live Telegram test lanes](SANDBOX.md#live-telegram-test-lanes) (`tg-probability`/`tg-shturman`, `tg-sandbox3`), [SC-OPS-QA-01](scenarios/operations/SC-OPS-QA-01-sandbox-functional-verification.md), [SC-OPS-SANDBOX-BOOTSTRAP](scenarios/operations/SC-OPS-SANDBOX-BOOTSTRAP.md). Health/deploy success/manual tail не заменяют E2E; gate [Gate 3](SCENARIO-CHANGE-MANAGEMENT.md) генерирует E2E plan под выбранный target (`local`/`dev`/`test`/`staging`).
5. **Promotion.** Повышение pinned revision на production идёт только по штатному promotion path owning repository: [Deployment coverage and sandbox promotion](scenarios/operations/deployment-coverage-and-sandbox.md), [SC-OPS-DEPLOY-01](scenarios/operations/SC-OPS-DEPLOY-01-protected-main-production.md). Sandbox acceptance сам по себе production не авторизует.
6. **Production smoke.** После promotion допускается ограниченный post-deploy smoke по штатному пути на production с non-test account; smoke ограничен безопасными действиями и данными. Локальный PASS не называется staging E2E.

Детали сред: [Sandbox](SANDBOX.md), [Engineering Approach](ENGINEERING-APPROACH.md), [Environment Contract template](contracts/ENVIRONMENT-CONTRACT-TEMPLATE.md). Карточные чек-листы и статус — в issues/Project и implementation repos, не в этом README.

## Основные документы и источники правил

| Документ | За что отвечает |
|---|---|
| [ARCHITECTURE](ARCHITECTURE.md) | Целевая модель, принятые границы, IDs и инварианты |
| [Stories](stories/README.md) | Истории: кто, ценность, шаги, «готово, когда», на каком этапе рождаются |
| [Project «Trained Assist — Migration»](https://github.com/orgs/trained-assist/projects/1) | Статус карточек и эпиков, чек-листы приёмки, блокеры и пробелы (issues) |
| [Implementation and Integration Plan](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) | Решения владельца, путь интеграции, этапы, зависимости, таблица карточек со ссылками на issues, scope, риски |
| [Agent launch and data persistence](AGENT-RUNNER-DATA-PERSISTENCE-IMPLEMENTATION.md) | Запуск агента с сохранением данных: протокол materialize/persist/sweep, целостность, блокировки, маппинг legacy → целевая модель |
| [Task Store v1 schema](TASK-STORE-SCHEMA-V1.md) | Инвентарь прод `durable-tasks/state.db` (read-only) и целевая схема Task Store: userTaskId, журнал событий, сигналы с дедуп, awaiting input, delivery, conversation |
| [Engineering Approach](ENGINEERING-APPROACH.md) | Концепция Sandbox Driven Development и общие правила разработки |
| [Environment Contract template](contracts/ENVIRONMENT-CONTRACT-TEMPLATE.md) | Единый шаблон проверенных repository boundaries и Sandbox Gaps |
| [Architecture Acceptance Protocol](ACCEPTANCE-CHECKLIST.md) | Короткие критерии acceptance scenario changes, evidence и production trust boundary; компонентные требования остаются в owning contracts |
| [Scenario Change Management](SCENARIO-CHANGE-MANAGEMENT.md) | Область behavior changes, actor model, scenario lifecycle и три-gate cross-repository acceptance pipeline |
| [Sandbox](SANDBOX.md) | Песочница каждого этапа R00, I00–I10: что запускаем, сбои, ожидаемый результат, классы bindings/credentials, logs checks; правила и механизмы хранения credentials (без значений) |
| [Tooling Research / R00](TOOLING-RESEARCH-AND-VM-PILOTS.md) | Вопросы по всем карточкам, shortlist инструментов и измеряемые VM-пилоты; кандидаты не равны принятому stack |
| [MCP / capabilities review](MCP-CAPABILITY-REVIEW.md) | R1 static evidence snapshot for issue #146; partial audit with pinned source revisions and explicit measurement gaps |
| [Contracts](contracts/README.md) | Межкомпонентные обязательства; wire API имеет собственный статус согласования |
| [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md) | Общая схема ошибок/событий, scope и retention |
| [DECISIONS](DECISIONS.md) | История решений; действующая формулировка сверяется с архитектурой |

Локальная спецификация не переопределяет принятую архитектуру. Расхождение исправляется до реализации затронутого контракта. Порядок работ поддерживается в плане; общие правила не копируются в каждую карточку.

## Спецификации по выбранной работе

| Работа | Документы |
|---|---|
| Runner, API и файлы | [Runtime boundary](runtime/EXECUTION-RUNTIME.md), [Runner repo](https://github.com/trained-assist/ai-agent-runner), [Serverless API](SERVERLESS-AGENT-API.md), [Запуск и сохранение данных](AGENT-RUNNER-DATA-PERSISTENCE-IMPLEMENTATION.md); lifecycle данных — ARCHITECTURE §4.6 |
| Router, MCP и быстрые ответы | [Router/MCP](TASK-ROUTER-AND-MCP.md), [Capability Catalog](CAPABILITY-CATALOG-AND-FAST-REPLIES.md). Router сначала модуль control plane |
| Статусы, IDs и пользовательский ввод | [ID и Reporting](USER-TASK-IDS-AND-REPORTING.md), [Run conflict](scenarios/interaction/run-conflict-explicit-choice.md), [SC-START-01](scenarios/interaction/SC-START-01-input-start-window.md), [Stories](stories/README.md), [legacy snapshot](scenarios/README.md) |
| Разговорная сессия | [Conversation contract](CONVERSATIONAL-SESSION-CONTRACT.md): границы Conversation/Task/Run, что в Task Store, resume-семантика, связь с legacy session-store |
| Планы, расписание и GTD | [Boundaries](PLAYBOOKS-VS-GETTING-THINGS-DONE-BOUNDARIES.md). GTD opt-in |
| Connected Applications: автономность и offline tests | [Mock MCP без Agent Run](CONNECTED-APPS-OFFLINE-MCP-TESTING.md); модель слоёв — [PR #149](https://github.com/trained-assist/trained-agent-architecture/pull/149) |
| Provider-интеграции | [External Integration Gate](EXTERNAL-INTEGRATION-GATE.md) |
| Ошибки и диагностика | [System Error Watcher](SYSTEM-ERROR-WATCHER.md), общий Observability contract |
| Модели, бюджет и учёт | [Model Gateway and Costs](MODEL-GATEWAY-AND-COSTS.md) |
| Термины | [Terminology / OpenLineage](TERMINOLOGY.md) |

Эти файлы раскрывают отдельные темы; читать весь список перед первой карточкой не требуется. Статус реализации определяется evidence, а не заголовком спецификации.

## Доказательства и история

- [P-DB comparison](pilots/p-db/COMPARISON.md) — выбор пары база/движок; локальный PASS не заменяет cloud smoke.
- [Code baseline](audits/CODE-BASELINE.md) — pinned факты текущего кода.
- [Legacy learnings 30.09](audits/LEGACY-LEARNINGS-TRAINED-ASSIST-AGENT-2026-09-30.md) — что из действующей legacy-системы уже построено и проверено в проде, что переносится (датированный снапшот).
- [User stories audit](audits/USER-STORIES-CONSISTENCY-AUDIT-2026-09-30.md).
- [Real playbooks review](REVIEW-WITH-REAL-PLAYBOOKS.md) — виртуальная проверка модели.
- Ревью прежней архитектуры: [Claude](archive/ARCHITECTURE_claude_2026-09-30_1926.md), [MiMo](archive/ARCHITECTURE_mimo_review_2026-09-30.md). Это история обоснования, не альтернативные текущие архитектуры.
- [VM2 wave 0](https://instant-publish.trainedassist.store/p/vm2-wave0-done) — отчёт о запуске существующего агента 29.09.2026; применённые уроки и ограничения доказательства — [Sandbox](SANDBOX.md#уроки-пробного-запуска-vm2).

## Отдельный поток: действующий сервис

Путь интеграции с действующей системой — раздел «Путь интеграции» в [плане реализации](IMPLEMENTATION-AND-INTEGRATION-PLAN.md).

[План взаимодействия TG/Web](TG-AND-WEB-INTERACTION-REFACTORING-PLAN.md) относится к текущему продукту. Он не является очередной стадией greenfield-плана и не разрешает скрыто переключать production на новую систему.

### CRM Telegram sandbox

Для CRM Telegram выделены отдельный `trained-assist-tg-bot-sales-sandbox` и тестовый бот `@flexi_leads_bot`; production webhook не менялся. На 08.10.2026 публичный sandbox Worker отвечает на `/health` (200), Telegram показывает 19 общих Agent-команд, webhook не настроен, а неподписанный `/webhook` отклоняется (401). Draft [tg-bot PR #481](https://github.com/trained-assist/trained-assist-tg-bot/pull/481) добавляет строгий разбор `crm1_<buildId>_<companyId>` на `/start` и развёрнут в этом Worker, но его sandbox-конфигурация пока не содержит Agent endpoint/секрет и выбранный профиль/MCP binding.

В изолированном CRM Web sandbox браузерный вход и каталог работают; каталог выдаёт ссылку тестового бота с ID связанной сборки и участника, без profile ID. Публичные CRM MCP-пробы чтения каталога и подготовки/подтверждения/сверки сделки проходят. Полный путь Telegram → Agent → CRM MCP пока не проверен: привязку профиля и discovery CRM-возможностей должен предоставить Agent; Telegram gateway не должен вызывать CRM Web `/mcp` напрямую. Детали и свежие evidence ведутся в архитектурном issue 214, tg-bot 465 и CRM Web PR 65. Активный `@cmr_management_bot`, его webhook и production CRM/provider data остаются вне sandbox-проверок.

## Как привязывать работу

В issue указывать карточку плана, ID историй (U-/API-/OPS-…), architecture_blocks (Axx), contracts (Cxx), invariants (INV-xx), нужные сценарии и evidence. Код, runnable recipes и локальные тесты живут в implementation repo; здесь — межкомпонентная модель и навигация. Статусы выполнения и чек-листы ведутся в issues и [Project](https://github.com/orgs/trained-assist/projects/1); документы не содержат чек-листов с галочками.
