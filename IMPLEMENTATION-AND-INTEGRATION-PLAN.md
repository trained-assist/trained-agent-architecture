# План реализации и интеграции Trained Assist

Draft v0.6 · 01.10.2026. Это документ implementation/integration: долговечная структура плана — решения владельца, путь интеграции, этапы, зависимости, общие правила приёмки, scope репозиториев и риски. Статус карточек и чек-листы ведутся в [Project «Trained Assist — Migration»](https://github.com/orgs/trained-assist/projects/1) и issues. Это не runtime GTD/checklist. Документ задаёт план, а не запускает инфраструктуру. Уже выполненные прогоны учитываются по ссылкам и границам evidence; migrations и production переключения требуют отдельной приёмки.

## Решение владельца: новая реализация параллельно живому сервису

**Работающий сервис сохраняем.** На этом этапе не заменяем и не удаляем старые репозитории, не переключаем production endpoints, не переносим активные задачи и не переписываем действующие базы/профили. Новые компоненты собираем с нуля в новых implementation repos либо в уже созданном новом ai-agent-runner, с собственными sandbox deployments.

Старые репозитории — reference для contract/scenario inventory и read-only анализа. Можно переносить проверенные самостоятельные части кода/методики, если у них явный контракт; greenfield не означает обязательного переписывания каждого formatter или domain handler. Новый компонент не импортирует скрытые internals старого core. Domain playbooks остаются в своих repos, используются по pinned version.

Для Web/TG создаём новый sandbox adapter/gateway к новому API, а не меняем работающий bot/webhook или current frontend deployment. Поле target repo в карточках обозначает ownership/reference; если там указан существующий live repo, новый implementation adapter размещается отдельно до решения о способе интеграции. Автоматического overwrite старого repo нет.

Stage 0 AutoFix/config/context profile сначала проверяется на isolated checkouts и новых repos. Для действующих repos — read-only inventory и отдельное предложение изменений, без незаметного merge в production. «Для всех repo» означает coverage и onboarding, а не одновременную замену всех процессов.

### Путь интеграции с действующей системой

1. **Reference → standalone:** фиксируем старые сценарии/contracts и запускаем новый Runner/API независимо.
2. **New endpoints → sandbox clients:** отдельные base URLs, users/keys, bot/webhook, Workers/bindings и storage. Один synthetic external user проходит полный цикл.
3. **Compatibility evidence:** старые сценарии воспроизводим в новом sandbox; sanitized inputs/replays допустимы, реальные mutating requests не дублируем в два сервиса.
4. **Pilot route:** после sandbox приёмки отдельным решением подключаем выбранного test/pilot клиента. Один dispatch owner выбирает ровно одного исполнителя на запрос; result/delivery также однозначны.
5. **Cohort rollout + rollback:** переключаем только новые задания разрешённого cohort. Уже принятые старые задания завершает старый владелец; нет двух очередей, продолжающих одну работу.
6. **Дальнейшая судьба legacy:** сохраняется до отдельного решения после evidence и retention. Удаление/архивирование не входит в этот план.

IDs и credentials старой/новой системы связываются явным mapping contract. Не копируем production secrets и профили в sandbox. Если форматы не совпадают, adapter сохраняет stable external correlation; это отдельная работа, а не допущение о готовой миграции.

Все старые production изменения, migration и cutover — отдельные implementation actions после review. В этой задаче создаётся только документация.

## Review исходного предложения

Нулевой исследовательский этап R00: обзор готовых инструментов по всем карточкам и измеряемые VM-пилоты до выбора затронутых зависимостей. Затем I00: AutoFix + сжатие context всех репозиториев + обязательный observability baseline. Карточки исходного плана сохранены с прежними IDs. Актуальная последовательность ниже согласована с ARCHITECTURE §11: первый интеграционный сценарий control plane — разговорная сессия; самостоятельный Runner/API развивается параллельно. Номер Stage не задаёт жёсткую очередь. Добавлены Gate/Watcher и promotion как последующие самостоятельные этапы.

Уточнения:
- I02 разделена на I02A API lifecycle и I02B artifact transfer; это две приёмки одной второй итерации.
- Сначала Web (меньше внешней доставки), затем Telegram-equivalent CI fixture и отдельный test bot smoke.
- Playbook artifact не равен MCP: MCP передаёт capability/definition; plan progression и GTD появляются только I07.
- Существующая sandbox VM рассматривается доступной по сообщению владельца. Первый этап создаёт reproducible setup и fault fixtures, а не начинает с покупки новой VM.
- Sandbox methods, которые можно сделать, входят в работу. Необходимые credentials/config фиксируются как binding при implementation; отсутствие текущего fixture — задача разработки, а не причина отказаться от автономной приёмки.
- Free-only по умолчанию: allowlist и paid fallback off. Бесплатные APIs имеют limits и не заменяют deterministic tests; число live runs ограничено конфигом.
- Артефакты доставляются object refs + direct signed transfers; API несёт manifest/status, без FTP и больших bodies.
- URL/keyword regex — high-precision routing features, не правило «любая ссылка значит агент».
- template/deterministic/llm/agent — modes capabilities; Job types остаются прежними тремя.
- Two-stage LLM pipeline — вариант для eval I06, а не навязанная замена one-call пути.
- Автоматическая escalation до OpenCode, дальше engine лестницы нет; GTD opt-in.
- Critical isolation/recovery/logging входят сразу в I01/I02, не откладываются до финала.

Источники: [Architecture](https://github.com/trained-assist/trained-agent-architecture/blob/main/ARCHITECTURE.md), [Runner draft](https://github.com/trained-assist/ai-agent-runner/blob/main/ARCHITECTURE.md), [Router/MCP](https://github.com/trained-assist/trained-agent-architecture/blob/main/TASK-ROUTER-AND-MCP.md), [Observability](https://github.com/trained-assist/trained-agent-architecture/blob/main/OBSERVABILITY-AND-ERROR-CONTRACT.md).

На 01.10.2026 в ai-agent-runner уже смержены lifecycle, standalone API, storage/artifacts и драйвер E2E (PR #1/#3/#4/#5). Это реализованный первый slice, а не полная приёмка clean room или VM deployment. Подробный срез и критический путь — ниже; реализацию отличаем от merge, live evidence и окончательной приёмки.

## Структура плана и Project

Org Project: **[Trained Assist — Migration](https://github.com/orgs/trained-assist/projects/1)**. Он — источник статуса карточек и чек-листов приёмки; этот документ хранит только долговечную структуру: этапы, зависимости, IDs и общие правила.

- Каждая карточка R01–R03, Z01–Z03, P-DB и P01–P30 — issue в этом репозитории, sub-issue своего этапного эпика (R00, E0–E7). В issue: работа, sandbox, specific acceptance, logs acceptance, зависимости и перенесённые чек-листы (AC-xx, блокеры, предусловия). Исходные IDs сохранены.
- Перед работой над карточкой сначала открыть её issue: там актуальный статус, чек-лист и evidence. Implementation issue/PR в целевом repo ссылается на issue карточки.
- Status: Draft, Ready, In progress, Verification, Blocked, Done. Done требует acceptance evidence в issue.
- Поля Project: Stage (R00/Ixx/Ops), Card, Target repo, Depends on, Sandbox.
- Stage — milestone grouping. Календарные sprint dates/estimates не выдумываем до первого measured cycle. Status — release readiness, не runtime gtdState.
- GitHub Project не источник Run/task state; execution receipts/logs остаются в платформе.

## Актуальный порядок старта

Источник целевых границ — [ARCHITECTURE §9/§11](ARCHITECTURE.md). Ниже единственный рабочий порядок плана; старые номера I/P сохраняются для ссылок.

0. R00: сразу обзор вопросов по всем этапам, затем небольшие партии VM-пилотов перед соответствующими зависимостями. [Список кандидатов и протокол](TOOLING-RESEARCH-AND-VM-PILOTS.md). R01 и I00 inventory можно делать параллельно; выбор runtime-зависимости требует R02/R03 по ней, но поздние tooling-пилоты не блокируют весь старт.
1. I00: общий development baseline. Учесть уроки VM2 в P01/P03; прошлый bootstrap существующего агента не закрывает карточки нового Runner.
2. Предпосылки control plane документированы и проверены: P-DB cloud smoke завершён (PR #93), [схема Task Store v1](TASK-STORE-SCHEMA-V1.md) и [conversation contract](CONVERSATIONAL-SESSION-CONTRACT.md) смержены (#89/#88). Следующая работа — реализовать их в control-plane repo. Защита терминальных состояний (#90) обязательна до приёмки; условия деплоя/пробуждения (#91/#92) входят в release и latency проверки.
3. Первый интеграционный slice: новый control plane + Web, пять уточнений с рестартом и сохранением контекста (P10/P12 плюс нужные части P02/P05/P06). Для него достаточно bounded default route; полный MCP/fast path не prerequisite.
4. Параллельно готовить standalone Runner → API → artifacts (P01–P09). Standalone API не зависит от platform GTD/Telegram и не заменяет разговорную приёмку.
5. Расписание — ранний отдельный пилот после Workflow Port/Task Store (P22), без обязательного GTD. MCP/catalog, fast replies и GTD/playbooks развиваются по своим контрактам после базового slice.
6. Gate/Watcher — независимые последующие интеграции. Promotion — по проверенным сценариям, а не только по номеру последней итерации.

Это уточнение зависимостей, не переименование 33 карточек и не объявление их выполненными. Для первой интеграции части карточек можно выделять в малые PR; полная карточка Done только после всей её приёмки.

## Срез реализации и критический путь — 01.10.2026, 23:18 МСК

Это датированный audit по main, открытым PR/issues и последним отчётам исполнителей. Он не заменяет статусы Project и не закрывает карточки: merge, положительный отчёт и независимая приёмка — разные факты.

| Репозиторий / направление | Подтверждено | Остаток |
|---|---|---|
| architecture / P-DB | Live Cloudflare smoke смержен [#93](https://github.com/trained-assist/trained-agent-architecture/pull/93); схемы и conversation contract — #89/#88 | [#90](https://github.com/trained-assist/trained-agent-architecture/issues/90): позднее событие перезаписывает done; #91/#92: задержки и версии при deploy |
| ai-agent-runner | PR #1/#3/#4/#5 в main: lifecycle, API, BlobStore/artifacts, E2E harness | [PR #12](https://github.com/trained-assist/ai-agent-runner/pull/12) deployment и [PR #22](https://github.com/trained-assist/ai-agent-runner/pull/22) repository context открыты; [#6](https://github.com/trained-assist/ai-agent-runner/issues/6) reboot fixture теряет /tmp state; [#23](https://github.com/trained-assist/ai-agent-runner/issues/23) profile trace write отсутствует; #7 dogfood не принят |
| trained-assist-control-plane | Repo создан, ownership/контракты определены | Прикладного кода в main нет: нужны Task Store, Workflow Port, dispatch/results, conversation/reporting |
| integration-gate / error-watcher | Отдельные repos с README/AGENTS/context tooling | Прикладного кода нет; не являются предпосылкой первого Web slice |
| vovalikessmoothy-png/ai-agent-run-api | Экспериментальный repo драйверов/job orchestration; PR #2 смержен | Location/stress epic #1 открыт. Это не platform control plane и не замена продуктового API Runner |
| vovalikessmoothy-png/ai-agent-runs-pool | Экспериментальный dispatch receiver, workflows + README | CI-пул — отдельный трек, не признак готовности Web migration |
| pr-autofix / engineering playbooks | Выпущен baseline v1.7.5, coverage/CI доработаны | Z01 [#37](https://github.com/trained-assist/trained-agent-architecture/issues/37) не принят: [pr-autofix#39](https://github.com/trained-assist/pr-autofix/issues/39), повторное выделение уже опубликованной ветки, затем корректный construction-task apply и consumer pins |
| legacy agent / profiles | В #87 отчёты о B1 и D1–D3; C1: шифрование и безопасный push synthetic profile подтверждены последним отчётом | Менеджерская/независимая приёмка C1/M0 ещё не объявлена. Synthetic push не означает миграцию всех живых профилей |

### Ближайший критический путь

1. **Закрыть входную приёмку baseline/M0.** Проверить свежий C1 push report в [#87](https://github.com/trained-assist/trained-agent-architecture/issues/87), оформить приёмку вместо повторного cloud smoke. Для Z01 устранить конкретные остатки #37, а не повторять весь мега-шаг. Существующее правило I00 остаётся; незавершённый rollout tooling на все legacy repos нельзя молча объявить выполненным.
2. **Начать реализацию нового control plane.** Task Store migrations + атомарные state/event transitions, signal dedup, generation fencing **и guard терминальных состояний** (#90); Workflow Port поверх выбранных Workflows + D1. Проверить ранний ответ, повтор, позднее событие и restart. Документы схемы не заменяют работающую базу.
3. **Подключить настоящий Runner.** Принять VM deployment/API на persistent paths; воспроизвести reboot после исправления #6. Закрепить idempotent submit, события, cancellation, восстановление чтения и finalization артефактов. Потеря связи не запускает второй Run автоматически; диск и незавершённые uploads сохраняются. #23 — обнаруженный пробел в profile trace, его исправление само по себе не доказывает полный load/save/restore пользовательского workspace.
4. **Пройти первый Web vertical slice.** Отдельный sandbox Web adapter → control plane → Runner → durable result/reporting → Web. Пять сообщений одной conversation с рестартом посередине, awaited user input, артефакты и единственный delivery owner. Bounded default route достаточен; полный MCP/fast replies/GTD не нужен для этой приёмки.
5. **Пилот и rollback.** Сверить compatibility scenarios, проверить #91/#92 при deploy, включить разрешённый cohort только для новых задач. Старые выполняет legacy owner. Затем Telegram и последующие возможности по карточкам.

Runner и контрольный слой можно разрабатывать параллельно после входных контрактов. Serverless dogfood, location/CI pool, полноценный Gate/Watcher и расширенный GTD не подменяют первый сквозной Web сценарий и не добавляются как новые обязательные блокеры. Изоляция и credential scope обязательны до допуска реальных пользователей; успешный fake E2E или stress driver не доказывает их.

Названия I00–I10, E0–E7, Pxx и M0/M1 из старых эпиков сосуществуют. Для работы использовать card issue + конкретный acceptance outcome; номера не являются четырьмя последовательными планами. [#87](https://github.com/trained-assist/trained-agent-architecture/issues/87) — подготовительный ускоряющий эпик, не замена полной приёмки P01–P30.

## Параллельный research: Fast-path до запуска агента

Решение владельца 01.10: до production интеграции подробно исследовать необязательные Agent Runs. [Алгоритм, JSON outcomes, corpus и eval](TASK-ROUTER-AND-MCP.md#11-fast-path-v1-алгоритм-до-запуска-агента), [explicit aliases и compact catalog](CAPABILITY-CATALOG-AND-FAST-REPLIES.md#explicit-names-и-compact-catalog-v1--01102026).

Это неблокирующий research track в отдельном pilot/fast-path каталоге нового control-plane repo, с собственным владельцем/веткой/worktree. При пересечении с исполнителем ядра согласовать пути до изменений. Не менять живые adapters, shared VM services, native MCP names и ветки текущей приёмки PR. Результат: catalog inventory/mapping, утверждённый sanitized corpus, сравнение one-pass/two-pass, mock replay harness, live-model holdout report и решение по promotion. Использует существующие карточки catalog/fast replies; не является prerequisite первого Web vertical slice.

Текущие MCP имена сохраняем через compatibility mapping. Full request/context по умолчанию; head/tail только preview, не доказательство полноты ответа. Host-owned bounded tool execution не превращает llm-recipe-job в автономного агента. Формальные thresholds выбираем до holdout; нет blanket обещания экономии токенов или качества.

## Итерации и зависимости

| Stage | Результат | Зависимости |
|---|---|---|
| R00 | Обзор tooling по всем карточкам, VM-пилоты и решения по измеренной пользе | Нет для обзора; VM/bindings и baseline для конкретной партии. Без глобального ожидания всего списка |
| I00 | AutoFix, context compression и logs baseline для всех repo | Нет; перечислить participating repos |
| I01 | Agent Runner на существующей sandbox VM | I00 accepted; VM существует по сообщению владельца |
| I02A | Внешний Serverless Agent API | I01 accepted |
| I02B | Артефакты и пользовательский workspace через API | I02A; object-store sandbox |
| I03 | Web conversation slice, затем Telegram на том же API | Task Store/Workflow Port и conversation contract; basic Runner/status. I02B нужен для сценариев файлов, не для первого текстового диалога |
| I04 | MCP и доменные capabilities | I03; первые fake domain adapters |
| I05 | Первый надёжный fast path | I04; старт corpus collection с I01 |
| I06 | Компактный capability catalog и глубокая проверка быстрых ответов | I05; P18 baseline |
| I07 | Расписание, планы и выборочный GTD | P22 после Workflow Port/Task Store; P23/P24 после нужных plan/MCP contracts; полный I06 не блокирует простой schedule pilot |
| I08 | External Integration Gate | I04 базовый handler; MVP может идти параллельно I05–I07 |
| I09 | Error Watcher | I01 error contract, I05/I06 diagnosis routing; не блокирует первые API Runs |
| I10 | Promotion, совместимость и RU/EU | Accepted core path I01–I07; подключённые Gate/Watcher пилоты когда готовы |

Card-level зависимости имеют приоритет над milestone порядком: P18 corpus collection начинается сразу после P03/P12; P27 aggregation можно готовить раньше I09, diagnosis P28 ждёт fast-path contracts. I08 может идти после I04 параллельно быстрому ответу. I09 использует уже накопленные errors, но не является блокером первых Runs. I10 — promotion gate, не обещание полного релиза до всех незакрытых требований.

## Общая приёмка каждой карточки

Общие правила — [Engineering Approach](ENGINEERING-APPROACH.md); envelope/retention — [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md); environments, bindings, controlled failures и stage-specific logs checks — [Sandbox](SANDBOX.md).

Карточка добавляет только специфический outcome, зависимости и evidence. Done требует positive/controlled failure, читаемые scoped logs, pinned versions и воспроизводимый transcript; affected API/recovery/cleanup/compatibility проверяются согласно её scope.

Общий гейт Done, типы доказательств и сквозные проверки инвариантов — [Acceptance](ACCEPTANCE-CHECKLIST.md). Чек-листы конкретной карточки и этапа — в issue карточки и эпике этапа. Порядок работ остаётся только в этом плане.

## Sandbox и требования к логам

Конкретные окружения, значение test fixture, bindings, принудительные сбои и logging acceptance каждого этапа — в [Sandbox](SANDBOX.md). Каждая карточка сохраняет свой обязательный logging gate в своём issue. Нельзя объявить её Done только по успешному ответу агента.

## Scope границ репозиториев

Runner/API/artifact adapters — ai-agent-runner; reusable storage contract по общей архитектуре.
Web/TG — новые sandbox adapters с существующими gateways как reference. Router — модуль нового общего control-plane repo по ARCHITECTURE §9.
MCP/domain methods — domain repos, тонкие platform facade/adapters.
Input, Output, GTD, Journal, Reporting и Workflow Port — модули того же control plane над единым Task Store; отдельные repos не prerequisite P12/P23.
Integration Gate и Error Watcher — самостоятельные repos.

Созданные новые repos (30.09.2026, публичные, пока только README/AGENTS и CI Repository context по Z03): [trained-assist-control-plane](https://github.com/trained-assist/trained-assist-control-plane) — control plane; [trained-assist-integration-gate](https://github.com/trained-assist/trained-assist-integration-gate) — I08; [trained-assist-error-watcher](https://github.com/trained-assist/trained-assist-error-watcher) — I09. Runner — уже существующий ai-agent-runner. Остальной I00 onboarding (AutoFix, staging) — по Z01/Z02.
Ни одна карточка не требует предварительно создать repo для каждого логического прямоугольника.

## Карточки

Полное содержание карточки (работа, sandbox, acceptance, logs acceptance, чек-листы и evidence) — в её issue. Здесь только стабильная структура: ID, название, этап, зависимости и ссылка. Зависимости уровня карточки имеют приоритет над номером этапа.

| ID | Карточка | Stage | Depends on | Issue · эпик |
|---|---|---|---|---|
| R01 | Вопросы, coverage и отбор партии | R00 | Нет; inventory Z01 можно делать параллельно | [#34](https://github.com/trained-assist/trained-agent-architecture/issues/34) · R00 [#31](https://github.com/trained-assist/trained-agent-architecture/issues/31) |
| R02 | Воспроизводимые VM-пилоты по партиям | R00 | R01 по выбранной партии; доступ и bindings этой партии | [#35](https://github.com/trained-assist/trained-agent-architecture/issues/35) · R00 [#31](https://github.com/trained-assist/trained-agent-architecture/issues/31) |
| R03 | Решение и привязка к реализации | R00 | R02 по соответствующей партии; обоснованный screening rejection не требует установки | [#36](https://github.com/trained-assist/trained-agent-architecture/issues/36) · R00 [#31](https://github.com/trained-assist/trained-agent-architecture/issues/31) |
| Z01 | Inventory и общий development baseline | I00 | Нет | [#37](https://github.com/trained-assist/trained-agent-architecture/issues/37) · E0 [#16](https://github.com/trained-assist/trained-agent-architecture/issues/16) |
| Z02 | Bounded AutoFix workflow | I00 | Z01 | [#38](https://github.com/trained-assist/trained-agent-architecture/issues/38) · E0 [#16](https://github.com/trained-assist/trained-agent-architecture/issues/16) |
| Z03 | Repository context compression и logs baseline | I00 | Z01, Z02 | [#39](https://github.com/trained-assist/trained-agent-architecture/issues/39) · E0 [#16](https://github.com/trained-assist/trained-agent-architecture/issues/16) |
| P01 | Воспроизводимый sandbox Runner | I01 | Z03 | [#40](https://github.com/trained-assist/trained-agent-architecture/issues/40) · E1 [#17](https://github.com/trained-assist/trained-agent-architecture/issues/17) |
| P02 | OpenCode Run и structured logs | I01 | P01 | [#41](https://github.com/trained-assist/trained-agent-architecture/issues/41) · E1 [#17](https://github.com/trained-assist/trained-agent-architecture/issues/17) |
| P03 | Fault injection и error source registry | I01 | P02 | [#42](https://github.com/trained-assist/trained-agent-architecture/issues/42) · E1 [#17](https://github.com/trained-assist/trained-agent-architecture/issues/17) |
| P-DB | Оркестратор: выбор пары база + движок и cloud smoke (внешняя предпосылка) | I02A | — | [#32](https://github.com/trained-assist/trained-agent-architecture/issues/32) · E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18) |
| P04 | Admission и durable receipt | I02A | P03 | [#43](https://github.com/trained-assist/trained-agent-architecture/issues/43) · E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18) |
| P05 | Status и replayable streaming | I02A | P04 | [#44](https://github.com/trained-assist/trained-agent-architecture/issues/44) · E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18) |
| P06 | Recovery API-сессии | I02A | P05 | [#45](https://github.com/trained-assist/trained-agent-architecture/issues/45) · E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18) |
| P07 | Artifact manifest и export | I02B | P06 | [#46](https://github.com/trained-assist/trained-agent-architecture/issues/46) · E3 [#19](https://github.com/trained-assist/trained-agent-architecture/issues/19) |
| P08 | Direct upload/download и большие файлы | I02B | P07 | [#47](https://github.com/trained-assist/trained-agent-architecture/issues/47) · E3 [#19](https://github.com/trained-assist/trained-agent-architecture/issues/19) |
| P09 | Workspace snapshots и конфликты | I02B | P07, P08 | [#48](https://github.com/trained-assist/trained-agent-architecture/issues/48) · E3 [#19](https://github.com/trained-assist/trained-agent-architecture/issues/19) |
| P10 | Тонкий Web client и task view | I03 | P12 и базовый Run/status/recovery (P02/P05/P06). Artifact-сценарии дополнительно ждут P07–P09; первый текстовый диалог не ждёт файлов. | [#49](https://github.com/trained-assist/trained-agent-architecture/issues/49) · E4 [#20](https://github.com/trained-assist/trained-agent-architecture/issues/20) |
| P11 | Telegram-equivalent fixture и sandbox bot | I03 | P10 | [#50](https://github.com/trained-assist/trained-agent-architecture/issues/50) · E4 [#20](https://github.com/trained-assist/trained-agent-architecture/issues/20) |
| P12 | Primitive Input/Output и routing | I03 | P-DB + [схема Task Store](TASK-STORE-SCHEMA-V1.md) + conversation/project/audience contract ([CONVERSATIONAL-SESSION-CONTRACT](CONVERSATIONAL-SESSION-CONTRACT.md)); базовый Runner/status/recovery (P02/P05/P06). P10/P11 — потребители API, не prerequisite этой карточки. | [#51](https://github.com/trained-assist/trained-agent-architecture/issues/51) · E4 [#20](https://github.com/trained-assist/trained-agent-architecture/issues/20) |
| P13 | MCP lifecycle и scoped bindings | I04 | P12 | [#52](https://github.com/trained-assist/trained-agent-architecture/issues/52) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P14 | Доменные tools и playbook artifact retrieval | I04 | P13 | [#53](https://github.com/trained-assist/trained-agent-architecture/issues/53) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P15 | MCP integration sandbox | I04 | P14 | [#54](https://github.com/trained-assist/trained-agent-architecture/issues/54) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P16 | Route policy и high-precision rules | I05 | P15 | [#55](https://github.com/trained-assist/trained-agent-architecture/issues/55) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P17 | Bounded reply-or-route recipe | I05 | P16 | [#56](https://github.com/trained-assist/trained-agent-architecture/issues/56) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P18 | Corpus и baseline eval | I05 | P03, P12 | [#57](https://github.com/trained-assist/trained-agent-architecture/issues/57) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P19 | Четыре режима capability | I06 | P14, P17, P18 | [#58](https://github.com/trained-assist/trained-agent-architecture/issues/58) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P20 | Brief builder и retrieval | I06 | P19 | [#59](https://github.com/trained-assist/trained-agent-architecture/issues/59) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P21 | One-call vs two-call и required-input UX | I06 | P20 | [#60](https://github.com/trained-assist/trained-agent-architecture/issues/60) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P22 | Schedule без обязательного GTD | I07 | P-DB, Task Store/Workflow Port и минимальный typed dispatch/result из P12. P21 и полный fast path не обязательны; простой schedule pilot можно начать раньше. | [#61](https://github.com/trained-assist/trained-agent-architecture/issues/61) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P23 | GTD opt-in и bounded control | I07 | P22 | [#62](https://github.com/trained-assist/trained-agent-architecture/issues/62) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P24 | Реальные playbooks и адаптация плана | I07 | P23 | [#63](https://github.com/trained-assist/trained-agent-architecture/issues/63) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P25 | Gate extraction и provider sandbox | I08 | P15 | [#64](https://github.com/trained-assist/trained-agent-architecture/issues/64) · E6 [#22](https://github.com/trained-assist/trained-agent-architecture/issues/22) |
| P26 | HH/домен pilot | I08 | P25, P22 | [#65](https://github.com/trained-assist/trained-agent-architecture/issues/65) · E6 [#22](https://github.com/trained-assist/trained-agent-architecture/issues/22) |
| P27 | Incident aggregation и suppression | I09 | P03, P18 | [#66](https://github.com/trained-assist/trained-agent-architecture/issues/66) · E6 [#22](https://github.com/trained-assist/trained-agent-architecture/issues/22) |
| P28 | Diagnosis LLM→OpenCode и report | I09 | P27, P21 | [#67](https://github.com/trained-assist/trained-agent-architecture/issues/67) · E6 [#22](https://github.com/trained-assist/trained-agent-architecture/issues/22) |
| P29 | Promotion и fleet acceptance | I10 | P24, P09 | [#68](https://github.com/trained-assist/trained-agent-architecture/issues/68) · E7 [#23](https://github.com/trained-assist/trained-agent-architecture/issues/23) |
| P30 | Multi-worker/region contract | I10 | P29 | [#69](https://github.com/trained-assist/trained-agent-architecture/issues/69) · E7 [#23](https://github.com/trained-assist/trained-agent-architecture/issues/23) |

Пробелы плана (истории без карточки, предпосылки, открытые пороги и решения) — [#33](https://github.com/trained-assist/trained-agent-architecture/issues/33). Мета-эпик автономной доставки — [#27](https://github.com/trained-assist/trained-agent-architecture/issues/27); credential-контур — [#30](https://github.com/trained-assist/trained-agent-architecture/issues/30).

Трактовка «сжатия» в I00: compact repository map + task-relevant context bundle/brief с refs; исходный код не удаляется. Название/продукт автофиксера не задан, используем configurable AutoFix contract.

## Review рисков и решения

| Риск | Решение в плане |
|---|---|
| Бесплатный провайдер нестабилен/недоступен | Fixtures дают детерминированную приёмку, live smoke отдельный; квота не обещает unlimited calls |
| Старое ядро незаметно осталось dependency Runner | I01 standalone fixture без frontend/GTD/domain modules |
| Межканальные profile IDs потеряны | I03 mapping/receipts и обязательные error fields, separate affected scope |
| Бриф красивый, capability реально недоступна | readiness/binding/permissions и versioned catalog, negative eval |
| Итерация превращается в долгий mega-PR | P cards — acceptance outcomes; реализация может разбить их на малые PR; parallel independent adapters |
| GTD создает recursive bookkeeping | opt-in registration и next-check/caps; no self-control |
| Raw HTML/файлы через API блокируют Gateway | artifact manifests/direct transfer, serving policy отдельно от публикации сайта |
| Sandbox VM превращается в prod с мусором | clean promotion/reprovision + recreate sandbox, pinned config и rollout |
| Ранние API endpoints порождают второй orchestration owner | minimal admission/result adapter; один dispatcher, versioned handoff |
| Объём: greenfield шести сервисов при запрете импорта внутренностей старого core | Намеренная цена за отсутствие скрытых контрактов; переносим только самостоятельные части с явным контрактом. План не является оценкой сроков |
| Каждая карточка — отдельный неизменяемый PR с зелёными CI и staging | Длинный хвост, а не препятствие: постановка по карточкам, а не «пройти всё за одну сессию» |

Не блокирующие вопросы для refinement: место хранения workspace/artifacts в RU/EU; стартовые quotas/concurrency/TTL; ID выбранной VM и sandbox base URL в config registry; первое реальное доменное capability для P14. До получения ответов используются local fixtures и существующая заявленная VM. Точные credentials в Project не размещаются.

Архитектурные refinements опубликованы: [Engineering Approach](https://github.com/trained-assist/trained-agent-architecture/blob/main/ENGINEERING-APPROACH.md), [Capability Catalog](https://github.com/trained-assist/trained-agent-architecture/blob/main/CAPABILITY-CATALOG-AND-FAST-REPLIES.md). Карточки — planning items; выполнение отмечается только по их evidence. Уже есть отдельные прогоны P-DB и bootstrap существующего агента на VM2; они не объявляют карточки нового Runner закрытыми.

## Дополнение 30.09.2026

Стадия 0 — prerequisite implementation. AutoFix/context compression применяются ко всем репозиториям через общий reusable workflow и repo-specific profile, без центрального mega-build. Для нового repo — тот же onboarding. Requirements по logs указаны у каждого этапа (Sandbox) и в issue каждой карточки; Done без diagnostic evidence невозможен.

Связанный документ: [SANDBOX.md](SANDBOX.md). При расхождении прежних proposal о замене live core действует правило параллельной новой реализации из этого документа.

## Уточнение: потеря связи и lifecycle рабочих данных — 30.09.2026

Применяется к существующим карточкам, без изменения порядка итераций. Нормативная граница — [ARCHITECTURE §4.6](ARCHITECTURE.md#46-связка-workflow--runner--рабочие-данные); Runner и [Serverless API](SERVERLESS-AGENT-API.md) согласованы с ней.

Workflow/control plane хранит управляющее состояние вне VM и принимает решения о запуске; Runner исполняет и финализирует. Connection_lost — неизвестный исход, уведомление и ожидание связи/явного сигнала, без автоматического rerun по heartbeat/lease timeout. Смерть процесса не означает потерю диска. Данные задачи переживают Run и доступны следующей разрешённой попытке. После engine exit финализация сохраняет артефакты; её повтор не повторяет исполнение.

Обязательные logs/evidence в затронутых карточках: connection_lost/reconnected, restart signal и его источник, previous/new runId и generation, workspace/volume refs, manifest/checkpoint versions, finalization/export progress/commit/error, cleanup decision. Секреты и signed URLs не логируются. Retention-классы задаются отдельно для рабочих данных, результатов и журналов; timeout не стирает единственную копию молча.
