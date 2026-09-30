# Ревью ARCHITECTURE v0.6 и плана реализации — Claude Opus 5.5

30.09.2026 · ревью, не принятая модель. Проверены `main@f9a817b` этого репозитория: [ARCHITECTURE.md](ARCHITECTURE.md), [contracts](contracts/README.md), [runtime](runtime/EXECUTION-RUNTIME.md), [Task Router](TASK-ROUTER-AND-MCP.md), [User Task IDs](USER-TASK-IDS-AND-REPORTING.md), [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md), [Watcher](SYSTEM-ERROR-WATCHER.md), [Serverless API](SERVERLESS-AGENT-API.md), [Model Gateway](MODEL-GATEWAY-AND-COSTS.md), [Code baseline](audits/CODE-BASELINE.md), [план реализации](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) и [Sandbox Plan](SANDBOX-PLAN.md). Утверждения о текущем коде сверены с `trained-assist-agent@1d9668a` (main на 30.09.2026).

**Связь с параллельным ревью.** Открыт [PR #1](https://github.com/trained-assist/trained-agent-architecture/pull/1) с ревью R1–R11 и альтернативой «от пользовательских историй». Его пункты здесь не повторяются. Согласен с R1 (сначала решить, где живёт durable task state), R3 (первый срез должен быть виден пользователю), R4 (меньше новых repo), R7 (RU — tool edge, а не executor) и R9 (нужны целевые latency). Ниже только то, чего в R1–R11 нет. В основном это касается **плана реализации** и **связи с уже существующим кодом**.

## Итог

Целевая модель v0.6 в целом здравая: задача отделена от чата, исполнение отделено от доставки, GTD opt-in, есть reconciliation для неизвестных внешних эффектов и параллельный cutover с rollback. Главные риски не в схеме, а в переходе от схемы к работе:

1. План строит «с нуля» то, что в core уже есть и уже отлажено на инцидентах, и нигде этого не учитывает (M1).
2. План по построению создаёт **две** durable-базы задач: одну в Runner (P04), другую позже в Input/Output (P12) (M2).
3. Ни одна карточка плана не ссылается на INV/A/C. У части инвариантов (Stop на всех уровнях, бюджет, credentials, Reporting) нет карточки, которая могла бы их принять (M3).
4. Критический путь почти линейный: 28 из 33 карточек идут одной цепочкой, и Runner заблокирован AutoFix-инструментарием для всех repo (M4).

## Главные замечания

### M1. Архитектура не знает о существующих реализациях своих же понятий

В core уже есть модули, которые реализуют ровно те сущности, что v0.6 вводит как новые. Ни один из них не упомянут ни в одном документе этого repo: `grep` по всем `.md` вне `scenarios/sources` даёт 0 совпадений. Code baseline закреплён на `c83e693` и перечисляет только isolation, owner lock, gtd-controller, recovery и playbooks.

| Понятие v0.6 | Что уже есть в core | Что там уже выучено |
|---|---|---|
| Task Journal / durable state (A02) | `src/durable-task-store.js`: SQLite source of truth, WAL; checklist.md — только проекция | Проекция ≠ источник истины |
| Schedule occurrence + dedup (P22) | `src/cron-service.js` + `src/action-executions.js`: claim due jobs в одной `BEGIN IMMEDIATE`, одна строка на logical invocation для любого trigger | Один dispatcher на все триггеры, без второй истории |
| Run history / attempts (INV-02, C04) | `src/execution-history.js`: append-only, один файл на executionId, terminal status ставится один раз | Заменил перезаписываемый `last-failure.json` (#1173/#1175) |
| error.code в ErrorEvent (C12) | `src/failure-taxonomy.js`: `AUTH, QUOTA, RATE_LIMIT, CONTEXT, TRANSIENT, MODEL_ERROR, TOOL_ERROR, CONFIG, USER_STOP, UNKNOWN` + `failure-classifier.js` | Две расходящиеся таксономии уже пришлось сводить в одну |
| Engine readiness для placement (C04) | `src/engine-health.js`, `src/readiness.js` | QUOTA/RATE_LIMIT ≠ credential invalid |
| Техническое восстановление (A07) | `retry-policy.js`, `engine-crash-policy.js`, `pending-task-resume.js`, [docs/instant-restart.md](https://github.com/trained-assist/trained-assist-agent/blob/main/docs/instant-restart.md) | 34 рестарта/сутки при деплоях; инцидент 25.09 с Codex usage limit |
| Awaiting user input / durable wait (INV-15) | `src/durable-wait.js`: `task_item_wait` / `task_item_wake`, durable timer, poll без токенов | Уже устроено как Temporal signal/timer |
| Run-finished сигнал в gateway (C02) | `src/gateway-callback.js`, `src/admission-status.js` | Порядок статусов: поздний edit не должен перетереть terminal |
| Идемпотентный приём (C01) | `src/request-dedup-lock.js`: только in-process, в комментарии прямо «not a durable admission store» | Граница честно задокументирована |

**Почему это важно.** Решение «новая реализация параллельно» правильное. Но без этой карты новая реализация заново пройдёт те же инциденты. Кроме того, Observability contract придумывает свои коды (`UPSTREAM_TIMEOUT`) рядом с уже существующим enum, и появится третья таксономия.

**Это не требование переносить старую сложность.** Существующий код — источник fixtures и уроков, а не спецификация. Если модуль сложнее, чем нужно по истории пользователя, в новой реализации его упрощаем.

**Предложение.**
- Добавить в Code baseline раздел «Prior art» с этой таблицей, закреплённой на ревизии.
- В каждой P-карточке завести поле «Prior art / перенести как fixture» со ссылкой на модуль и инцидент.
- Словарь `error.code` в C12 взять из `FAILURE_CLASSES`, расширяя его, а не заменяя.

### M2. План создаёт две базы задач

- P04 (I02A) делает «минимальный durable request/result store» в `ai-agent-runner`.
- P12 (I03) позже «извлекает минимум queue/handoff/result/delivery contract» для Input/Output/Task Journal.
- При этом [runtime](runtime/EXECUTION-RUNTIME.md) прямо запрещает «копирование существующего runner с собственной второй БД задач», а [Serverless API](SERVERLESS-AGENT-API.md) требует, чтобы «две независимые очереди не отправляли одну и ту же работу».

Итог: семантику receipt/userTaskId/replay спроектируют дважды, а потом придётся мигрировать API-клиентов с первой базы на вторую.

**Предложение.** В P04 сразу создаётся тот самый Task Journal: `userTaskId`, receipt, events, runs. Он используется и Serverless API, и позже Web/TG. Runner хранит только состояние attempt (lease, heartbeat, process tree). Serverless API = Task API + API key, как предлагает и PR #1 (R3). Хранилище выбирается до P01 (PR #1, R1).

### M3. Нет трассировки план ↔ инварианты, часть инвариантов без владельца

[README](README.md) требует указывать в эпиках Axx/Cxx/INV-xx. В плане и в Sandbox Plan нет ни одной такой ссылки: `grep -o "INV-\|A0\|C0"` возвращает 0. Если разложить карточки по инвариантам, без приёмки остаются:

| Инвариант / контракт | Что есть в плане | Чего не хватает |
|---|---|---|
| INV-08 Stop на **всех** уровнях, C03 | Cancel attempt в Runner (P02, P05); `/stop` не через LLM (P12) | Stop подавляет retry, GTD continuation, schedule и resume после рестарта. Supplement (C03) в плане не упомянут вовсе. Это главный класс инцидентов (Core 02, 28.09) |
| INV-10/11 бюджет и Ledger, C08 | «Free-only по умолчанию» | Ни одной карточки. Free-only маскирует проблему: budget authority впервые станет проверяемым при promotion, то есть слишком поздно |
| INV-12 credentials, C07 | «Scoped bindings» в P13 | Credential resolver с приоритетами (Code baseline сам отмечает разные приоритеты у readers), refresh owner |
| Reporting (USER-TASK-IDS §8, 8 пунктов приёмки) | «Thin task facade» в P10 | Карточка на getUserTask/history/watch и на stale/deadline-поведение (§9) |
| Mapping старых и новых ID при cutover | Одна фраза «отдельная работа» | Карточка перед P29: старый taskId/executionId ↔ userTaskId, одиночный dispatch owner |

**Предложение.** Матрица INV × P в конце плана. Четыре новые карточки: **P-STOP** (C03 целиком, тест-план Core 02), **P-BUDGET** (budget authority + correlation в Ledger + решение fail-open/closed), **P-CRED**, **P-REPORTING**. Ещё одна карточка на **cutover ID mapping** перед P29.

### M4. Критический путь линейный, Runner ждёт AutoFix

По полям `Depends on` самая длинная цепочка: Z01 → Z02 → Z03 → P01 → … → P17 → P19 → P20 → P21 → P22 → P23 → P24 → P29 → P30. Это **28 из 33** карточек. Вне цепочки только P18 и P25–P28. Фраза «parallel independent adapters» из таблицы рисков структурой зависимостей не подтверждается.

Лишние зависимости:
- **P01 ← Z03 ← Z02.** Запуск Runner ждёт bounded AutoFix с LLM-fallback **для всех repo**. Для I01 нужен только logs baseline тех repo, которые I01 трогает. AutoFix — отдельный параллельный трек.
- **P10 (Web task view) ← P09 (конфликты snapshot двух writers).** Web view не требует merge-политики workspace.
- **P16 (typed commands, template answers) ← P15 (MCP integration sandbox).** `/stop` и status не зависят от MCP.
- **P12 (Input/Output) после P10/P11 (каналы).** Каналы строятся раньше journal, в котором живёт их `userTaskId`. Это следствие M2.

**Предложение.** Сократить I00 до «logs baseline для затронутых repo». Снять зависимости выше. Нарисовать реальный критический путь, в котором journal (M2) идёт в самом начале.

### M5. Карточки плана слишком общие для исполнителя

- Строки «Logs acceptance: пройти stage-specific checks…» и «Evidence: pinned PR/commit…» повторены дословно **30 раз**. Настоящее содержание карточки занимает одну-две строки.
- В I01 (строка 163) скопирована logs acceptance из I00 про AutoFix: «AutoFix check/attempt/patch refs», хотя к Runner она не относится.
- Нет ни одного числа: latency, quotas, TTL, caps. Числа в Observability помечены draft, и сам план говорит «hard numbers не обещаем».

По политике проекта реализацию делает opencode/deepseek. По такой карточке («Успех, nonzero exit, startup/auth failure… имеют typed outcome и логи») каждый исполнитель выберет свою схему.

**Предложение.** Общие требования вынести один раз в начало. В каждой карточке оставить 3–5 названных сценариев (имя fixture → ожидаемое событие/статус) и хотя бы стартовые числа с пометкой «уточнить по baseline».

### M6. Четыре разных словаря состояний

| Где | Состояния |
|---|---|
| USER-TASK-IDS §4 | state: active / blocked / succeeded / failed / cancelled + stage |
| Serverless API | queued / starting / running / awaiting_user / succeeded / failed / cancelled |
| TERMINOLOGY (OpenLineage) | START / RUNNING / COMPLETE / FAIL / ABORT / OTHER |
| C02 events | accepted / queued / started / progress / attempt_failed / waiting / stopped / result_ready / task_failed / delivery_failed |
| core `failure-taxonomy.js` | RUNNING / COMPLETED / FAILED / INTERRUPTED / BLOCKED / CANCELLED |

Каждый из них разумен на своём уровне (task, API, run, event). Но нигде не сказано, какой из них какой уровень описывает и как один проецируется в другой. Например, `awaiting_user` в API — это `blocked + waiting_input` в User Task, но что это в OpenLineage: `OTHER` или `RUNNING`?

**Предложение.** Одна таблица проекций в USER-TASK-IDS: Task state ↔ Run state ↔ API status ↔ OpenLineage ↔ event types.

### M7. Смена движка — продуктовое решение без проверки качества

P12 делает «default route OpenCode», а автоэскалация заканчивается на OpenCode. Eval в плане (P18, P21) измеряет только fast path: false-fast, unnecessary-agent, latency. **Проверки качества результата агента** на реальных сценариях (recruiter, engineering из [scenarios](scenarios/README.md)) в плане нет. При cohort cutover пользователи пилота могут получить более слабый результат, и это не будет видно ни в одной метрике плана.

**Предложение.** В gate I10/P29 добавить agent-outcome eval: одинаковый набор сценариев на текущем пути и на новом, оценка результата (acceptance-чекеры сценария плюс ручной review выборки). Cutover пилота только без регрессии.

### M8. Документы — это стопка патчей

В ARCHITECTURE.md в конце есть «Решения 30.09.2026» и «Уточнение перехода — 30.09.2026». В contracts — «Уточнение владельцев v0.3» со ссылкой на «ARCHITECTURE v0.4», а также отдельный раздел «Уточнение GTD и агентской эскалации». В USER-TASK-IDS — «Уточнение 30.09» со ссылкой на «Общая v0.4». В плане — «Дополнение 30.09.2026», которое отменяет более ранние proposals («при расхождении… действует правило…»).

Чтобы понять текущее решение, читателю приходится мысленно применять патчи по порядку. Часть устаревших ссылок PR #1 уже поправил, но сама форма документа их порождает.

**Предложение.** Вписать уточнения в тело разделов, а историю решений вести в одном `DECISIONS.md` (дата, решение, что отменено). Тогда в документах остаётся только текущее состояние.

## Мелкие замечания

- ARCHITECTURE.md, строка 7: «справочную состояния» → «справочную о состоянии».
- ARCHITECTURE.md §2: у Input «после durable acceptance исполнителем запись покидает pending queue», а в C01 «ACK означает durable acceptance; не запуск». Нужно уточнить, что это два разных ACK: приём от клиента и приём executor'ом. Иначе их легко спутать.
- Таблица ID: в core уже есть `executionId` (execution-history, action-executions). В новой модели это `runId`? Нужна строка соответствия, иначе появится 26-й вид ID.
- USER-TASK-IDS §11 ставит Reporting в «task-queue repo», а в таблице repo этот repo «ещё не выбран». Это та же нерешённая развилка, что в M2.
- SYSTEM-ERROR-WATCHER: «Watcher agent может применять правила suppression без user approval». Нужен явный cap: максимальный scope и максимальный срок, который агент может выставить сам.
- В плане не названа sandbox VM (ID и base URL «в config registry»). Для P01 это блокер, а не «не блокирующий вопрос».

## Что сделать в первую очередь

1. Решить хранилище Task Journal (PR #1, R1) и перепривязать к нему P04 (M2).
2. Добавить в Code baseline «Prior art», а в карточки поле prior art/fixtures (M1). Error codes взять из `FAILURE_CLASSES`.
3. Добавить матрицу INV × P и карточки P-STOP, P-BUDGET, P-CRED, P-REPORTING и cutover ID mapping (M3).
4. Сократить I00 и снять лишние зависимости; показать критический путь (M4).
5. Добавить agent-outcome eval в gate cutover (M7).

M5, M6 и M8 — редакторская работа, её можно сделать одним PR после пунктов 1–3.
