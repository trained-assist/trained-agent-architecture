# P-DB: вариант Cloudflare Workflows + D1

Где запускалось: **локально**, `wrangler dev` 4.145.0 (miniflare/workerd), `--persist-to state/`, Node ≥ 22 (если системный старше — скрипт качает сборку под свою OS/arch в `bin/`). **Облачный прогон на настоящем аккаунте — см. [../CLOUD-SMOKE.md](../CLOUD-SMOKE.md)** (критерии (а)(б)(в)(г) пройдены там; `./cloud/cloud-run.sh`).
Запуск: `./run.sh`. Скрипт пишет `run.log` и `results.json` и сам убивает свои процессы (`trap` → рекурсивный kill дерева wrangler dev).

## Код

| Файл | Что внутри |
|---|---|
| `src/taskstore.ts` | Task Store (репозиторий над D1). Таблицы: `tasks` (колонка status, generation), `task_events`, `side_effects`, плюс для #116 — `task_waits` (durable wait + единственная копия ответа; `status` = consume guard), `task_outbox` (pending-операции, `dedup_key` UNIQUE), `task_faults` (управляемые точки сбоя). `commitStep` — один `db.batch`, то есть одна транзакция, и **два независимых фенса**: `EXISTS(... generation = ?)` (INV-02) и `status NOT IN ('done','failed','cancelled')` (INV-03, issue #90). Порядок внутри batch: история и счётчики **до** status-UPDATE, иначе `finalize` (running → done) отфильтровал бы собственную строку истории. Отклонённая поздняя запись оставляет аудит-строку (`late_write_rejected`/`wait_timeout_ignored`) и бросает `TerminalStateError`. |
| `src/port.ts` | Workflow Port. Управление: `start` (идемпотентен, id экземпляра = userTaskId), `signal` (prewarm-вызов `status()` в инстанс до `sendEvent`, тайминги `prewarmMs/sendMs/deliveryMs` пишутся в событие `signal`, само `signal.at` остаётся моментом прихода запроса), `cancel` (в Task Store `cancelled` и generation+1, затем `terminate`), `status` (строка из Task Store плюс статус движка). Исполнение: `StepCtx` со `step`, `sleep`, `waitFor`. Там же `recover()` — обход ограничения эмулятора, см. ниже. |
| `src/ids.ts` | `PROFILE_ID` (`sandbox-pilot`), `runIdFor`/`waitIdFor`/`eventKeyFor`/`logCtx`: profileId, userTaskId, runId, waitId, eventKey в каждой строке лога; секретов/личных данных нет. |
| `src/plan.ts` | План из 5 шагов (#116: durable wait + перечитывание ответа). Зависит только от `StepCtx` и `TaskStore`, API Cloudflare не видит. `openWait` — один batch (wait + transition + `wait_opened`); ответ **всегда** читается из D1 (`readAnswer`), payload события не читается; после любого прерывания план перечитывает D1, а не пишет `wait_error` (при отсутствии ответа — `wait_reattach`); дедлайн (`isWaitTimeoutError`) даёт `wait_timeout`/`user_reply_timeout`. Guard версии `expectVersion` (issue #92): расхождение → явный `version_mismatch` вместо тихого результата со старой логикой. |
| `src/index.ts` | Класс `TaskWorkflow` (`FencedError`/`TerminalStateError`/`MissingAnswerError` → `NonRetryableError`) и HTTP-эндпоинты: `/init /start /signal /answer /cancel /status /recover /version /outbox /ack-outbox /recover-outbox /wake /fault`, плюс для тестов `/bump-generation /stale-write /late-wait-timeout /classify-wait-error`. |

## T1–T14 (вывод из `run.log`)

| Тест | Итог | Доказательство |
|---|---|---|
| T1 happy path | **PASS** | `{"status":"done","fx":{"apply":1,"prepare":1,"run":1},"engine":"complete","steps":["prepare","run","wait","apply","finalize"]}`. Весь проход 656 мс, от signal до apply 139 мс. |
| T2 kill -9 после шага 2 | **PASS\*** (с оговоркой) | Процесс убит, когда движок уже сохранил результат `run`: `killed at: {"status":"running","fx":{"prepare":1,"run":1},"steps":["prepare","run"]}`. **Сам экземпляр не продолжился:** через 10 с после рестарта (durable sleep на 4 с уже истёк) состояние то же: `"status":"running" ... "steps":["prepare","run"]`. После `Port.recover()` (отправляет экземпляру пустое событие `__wake`) движок проиграл историю из кэша и довёл задачу до конца: `done, fx {"apply":1,"prepare":1,"run":1}`. Шаги 1–2 повторно не выполнялись. |
| T3 ожидание без ресурсов | **PASS** | Задача в `awaiting_input`. Группа процессов убита, `processes left: 0`, 5 с не работало ничего. После рестарта (готов за 2,5 с) signal разбудил экземпляр: `done, fx {"apply":1,"prepare":1,"run":1}`, от signal до apply 205 мс. |
| T4 ранний сигнал | **PASS** | Сигнал пришёл за 3111 мс до того, как экземпляр дошёл до `waitFor`. Событие буферизовалось, итог `done, apply=1`. |
| T5 дубль сигнала | **PASS** | В Task Store записано 3 сигнала (два подряд и третий после done), `apply=1`. Третий сигнал после завершения Port принял без ошибки (`{"sentAt":...}`) — движок его молча проглотил. |
| T6 fencing | **PASS** | Generation поднят до 2. Запись от generation 1 отвергнута: `{"rejected":true,"error":"fenced: task ut-pilot-6 step apply gen 1 != current 2"}`. Status и счётчики до и после совпадают (`awaiting_input`, `{"prepare":1,"run":1}`). Сам экземпляр тоже держит generation 1: после signal его шаг `apply` отбит, выброшен `NonRetryableError`, движок в `errored`, `apply=0`, статус в Task Store не изменился. |
| T7 cancel | **PASS** | После cancel: `cancelled / terminated`. Затем сигнал, два рестарта (kill -9), `recover()` и ещё один сигнал — итог `cancelled, gen 2, engine terminated, apply 0`. |
| T8 наблюдаемость | **PASS** | Один SQL-запрос через `wrangler d1 execute taskstore --local` (текст запроса ниже) вернул status, generation, результат, счётчики и полную историю. |
| T9 терминальный статус неизменяем (issue #90) | **PASS** | На задаче `ut-pilot-1`, ставшей `done` в T1, воспроизведены обе поздние записи из issue: плановый `wait_timeout` с её собственным generation (`/late-wait-timeout`, тот же код, что `catch` в плане) и статусная запись `/stale-write`. Обе отклонены: `{"recorded":false,"reason":"terminal","error":"terminal: task ut-pilot-1 is done; write of step wait rejected"}` и `{"rejected":true,...}`. `before == after` байт в байт (`done`, `{"answer":"да","ok":true,"version":"v1"}`, gen 1), строк `kind=wait_timeout` — 0, аудит-строк `wait_timeout_ignored` — 1 и `late_write_rejected` — 2. Плюс классификатор ошибок ожидания: `Execution timed out after 20000ms` → `isTimeout:true`, `could not load the Durable Object` → `isTimeout:false`. |

| T10 outbox: сбой после коммита ответа, до доставки (issue #116) | **PASS** | `fault after_commit`: `accepted:true, delivered:false`, wake `pending`, задача `awaiting_input`; `/recover-outbox` → `delivered:1` → `done`, ответ из D1. |
| T11 duplicate не создаёт вторую попытку (issue #116) | **PASS** | первый `eventKey` принят, duplicate и второй ключ отклонены (`accepted:false`), ровно **один** `wake`-намерение, `answer_accepted`=1, `answer_rejected`=2, `apply=1`. |
| T12 ответ после cancel не возобновляет (issue #116) | **PASS** | `accepted:false reason=cancelled`, wait `cancelled`, pending drop, `wakeRows=0`, `apply` нет, движок `terminated`. |
| T13 сбой между шагами, continuation из D1 без wake (issue #116) | **PASS** | сбой внутри `mark-awaiting` (движок ретраит шаг); ответ закоммичен `deliver:false`, wake навсегда `pending`, `wakeDelivered=0` — задача всё равно `done`, wait `consumed`. |
| T14 сигнал — не единственная копия ответа (issue #116) | **PASS** | wake-событие с payload `answer:"НЕТ"`, durable-ответ `"да"` → результат `"да"`, `wokeBy=engine_event`. |

Итог прогона 02.10.2026: **T1..T14 = 14/14 PASS** (`results.json`, `run.log`).

T8, запрос и вывод для задачи, пережившей kill -9:
```sql
SELECT t.id, t.status, t.generation, t.result_json,
 (SELECT json_group_object(name, count) FROM side_effects s WHERE s.task_id = t.id) AS side_effects,
 (SELECT json_group_array(json_object('kind', e.kind, 'step', e.step, 'at', e.at))
    FROM (SELECT * FROM task_events WHERE task_id = t.id ORDER BY id) e) AS history
FROM tasks t WHERE t.id = 'ut-pilot-2'
```
```
{"id":"ut-pilot-2","status":"done","generation":1,"result_json":"{\"answer\":\"да\",\"ok\":true}",
 "side_effects":"{\"apply\":1,\"prepare\":1,\"run\":1}",
 "history":"[start, step_done prepare, step_done run, status wait, signal user_reply, step_done wait, step_done apply, step_done finalize]"}
```

## Главные выводы

1. **Локально движок после kill -9 сам не продолжает работу.** В исходниках движка miniflare (`miniflare/dist/src/workers/workflows/binding.worker.js`) нет обработчика `alarm()` и нет хука при старте. Таймеры `sleep` и retry лежат в памяти (heap), а в SQLite движка (`priority_queue`) только записываются. Durable Object движка перезапускает `run()`, проигрывая сохранённые шаги из кэша, лишь в одном случае: пришло **событие**, а экземпляр в этот момент не выполняется (`receiveEvent` → `init`). Отсюда:
   - ожидание ответа (T3) работает без оговорок: signal сам будит экземпляр;
   - экземпляр, убитый во время `sleep` или между шагами (T2), зависает в `running`, пока его не разбудят извне. Для этого сделан `Port.recover()`: при старте он проходит по незавершённым задачам из Task Store и шлёт каждой `__wake`.
   - **Это ограничение эмулятора, а не продукта.** В продакшене экземплярами управляет сама платформа: она возобновляет их после сбоя машины и по таймерам sleep/retry. **Подтверждено на настоящем аккаунте** (см. [../CLOUD-SMOKE.md](../CLOUD-SMOKE.md)): ошибка шага ретраится сама, sleep будит сам — `Port.recover()` в проде не нужен и в облачном прогоне не вызывался.
   - Одно окно остаётся открытым везде: процесс может упасть после того, как шаг сделал side effect, но до того, как движок сохранил результат шага. Тогда шаг выполнится повторно (at-least-once). Внутри Task Store от этого спасает fencing или ключ идемпотентности. Внешние вызовы должны быть идемпотентными по ключу `(userTaskId, step)`.
2. **Буферизация ранних событий (T4) и дедупликация шагов (T5) работают локально.** Но движок принимает сигналы и после отмены, и после завершения, и не сообщает об этом (T5, T7). Отвергать такие сигналы должен Port по статусу в Task Store. Сейчас Port только пишет их в журнал — это нужно доделать.
3. **Fencing строится на Task Store, движок его не даёт.** Workflows не знают про generation. Правильный порядок: cancel или переназначение сначала поднимают generation в D1, а все записи шагов идут через защищённый `batch`. Устаревший экземпляр падает с `NonRetryableError` и ничего не меняет в Task Store.
4. **Статус движка ≠ статус задачи.** После kill -9 движок показывает `running`, хотя задача ждёт ответа. Для отчётов и диагностики источник истины — Task Store (пункт 4.1 архитектуры подтверждается).
5. **Проблема среды (не Workflows):** в этой песочнице ProxyWorker у `wrangler dev` на `--port` принимает соединение и не отвечает. Воспроизводится на wrangler 4.145 и 4.40, даже с воркером в одну строку. Поэтому `lib.sh` находит прямой сокет пользовательского воркера того же workerd (опрашивает `/status` на его портах). Движок и D1 при этом те же самые.
6. **Сигнал — не единственная копия ответа (#116).** Атомарный `wait` в D1 не равен доставленному сигналу Workflows. План **всегда** читает ответ из `task_waits` (`readAnswer`), payload события игнорируется; доставка — pending-операция в `task_outbox`, которую можно безопасно повторить; при любом прерывании план перечитывает D1 и при отсутствии ответа переподключается к ожиданию, а не падает. Сбой между шагами (T13) доказывает: ответ, закоммиченный пока инстанс был «мёртв», используется после возобновления **без единого доставленного wake**.

## Метрики

| Метрика | Значение |
|---|---|
| Строк кода адаптера (src/*.ts, без комментариев и пустых строк) | 238 (Task Store, Port, план, entry). Harness: run.sh 154 и lib.sh 24 строки |
| Движущиеся части локально | 3: процесс node wrangler, 2 процесса workerd; SQLite-файлы D1 и движка в `state/` |
| Движущиеся части в продакшене (по документации) | Worker + Workflows + D1, всё управляется Cloudflare; своих процессов нет |
| Проход T1 (wall clock) | 656 мс |
| signal → шаг 4 | 139 мс на живом процессе; 205 мс на первом сигнале после холодного рестарта (не считая 2,3–2,5 с на подъём `wrangler dev`) |
| RSS живого исполнителя во время ожидания (локально) | 557 МБ на всю группу (node wrangler около 295 МБ, esbuild, workerd 237 МБ). В T3 он **не нужен**: 5 с работало 0 процессов, сигнал после подъёма дошёл |
| В продакшене во время ожидания (только документация) | Ожидающий экземпляр не занимает слот исполнения и не тратит CPU; плата идёт за CPU-время и хранение состояния |

## Эксплуатация одним человеком

- **Если на Cloudflare (по документации, не проверено):** своих серверов, апгрейдов и бэкапов движка нет. Для D1 есть Time Travel (восстановление на момент времени, 30 дней на платном тарифе) и `wrangler d1 export`. Мониторинг: дашборд и GraphQL-метрики Workflows и D1 плюс свой алерт по SQL к Task Store («задачи в running/awaiting дольше N»). История экземпляров Workflows хранится ограниченно (по ARCHITECTURE.md — 30 дней), поэтому всё, что нужно дольше, пишется в D1 внутри шагов, как в этом пилоте. Лимиты из документации: результат шага до 1 МиБ, до 10k шагов, CPU шага до 5 мин, `waitForEvent` до 365 дней, D1 до 10 ГБ на базу. Цена: Workers Paid от $5 в месяц, оплата за CPU, запросы и хранение. При нашем объёме (сотни задач) это почти бесплатно. Лимиты и цены **не проверены**.
- **Главные риски:** локальная отладка не совпадает с продакшеном (пункт 1 выводов) — для crash-сценариев нужен staging-аккаунт. Появляется привязка к вендору, но её ограничивает Port: план зависит только от `StepCtx`.
- **Деплой новых версий на лету:** ожидающий экземпляр переживает деплой, но **какой именно код он выполнит после сигнала — гонка** ([#91](https://github.com/trained-assist/trained-agent-architecture/issues/91), [#92](https://github.com/trained-agent-architecture/issues/92), замеры 02.10.2026 в [../CLOUD-SMOKE.md](../CLOUD-SMOKE.md) и `cloud/deploy-wake-probe.sh`):
  - **пропагация:** edge отдаёт новый маркер через **165–286 мс** (первый замер после включения tail — 4415 мс); **новая** задача, созданная через **5 с** после деплоя, пошла на старом коде, через **6 с** — уже на новом;
  - **пробуждение:** либо **~61–68 мс** и тогда инстанс исполняет **старый** код (ловится guard'ом `expectVersion` → `version_mismatch`), либо **ровно 300.0–300.3 с от входа в `waitForEvent`** — платформа отменяет заблокированный `run()` и возобновляет экземпляр уже на новом коде. Середины нет; `wrangler tail` фиксирует три независимых отмены с `wall=300 384 / 300 391 / 300 412 мс`;
  - **наш путь запроса не виноват:** prewarm 5–18 мс, `sendEvent` 40–62 мс, доставка ≤377 мс; повторная отправка события через 10 с не ускоряет (279–280 с);
  - **решение:** (1) деплоить в паузах, когда нет задач в `awaiting_input` — тогда базовые 180–641 мс; (2) если деплой уже случился, закладывать SLO пробуждения 300 с и не ретраить сигнал — ретраи не помогают; (3) логику шагов менять только additive-деплоями, а `version_mismatch` считать в control plane поводом пересоздать задачу (новый инстанс гарантированно на новом коде).
  - Имена шагов и их порядок в плане остаются контрактом: переименование шага приводит к его повторному выполнению.

## Перенос прод-схемы `durable-tasks/state.db` в D1

D1 — это SQLite, поэтому DDL переносится почти 1:1. Схема прочитана из прод-копии в режиме read-only.

| Прод | В этом варианте | Заметки |
|---|---|---|
| `durable_tasks` (status CHECK draft..cancelled, revision, hooks_json, parent_*) | `tasks` (+ `generation`, `instance_id`, `userTaskId` = id) | Переносится как есть. К статусам добавляется `awaiting_input`. Из `revision` получается `generation` для fencing (INV-02). `execution_session_id` → `instance_id` Workflows. |
| `task_items` (status pending/running/waiting/done…, attempt_count, max_attempts, wait_json, wait_deadline_at, fanout_json, due_at) | Шаги движка + строки items в D1 | Колонку `status` оставляем для отчётов, но ходом шагов управляет движок. `wait_json`/`wait_deadline_at` → `step.waitForEvent(type, timeout)`, `due_at`/`delay_after_sec` → `step.sleep`, `attempt_count`/`max_attempts` → `retries` у `step.do`. Своё ожидание по `wait_json` и поллинг `idx_task_items_due` становятся не нужны. `fanout_json` → несколько `step.do` через `Promise.all` или дочерние экземпляры. |
| `executions` (attempt_number, engine, model, status, result_json, error_class) | Журнал попыток и `task_events` | Переносится как есть, пишется внутри `step.do`, так что попытка и её результат лежат в одной D1-транзакции со статусом. |
| `task_validation_results`, `hook_executions` (boundary_key UNIQUE) | Без изменений | `boundary_key UNIQUE` — готовый ключ идемпотентности для side effects при повторе шага (окно at-least-once из пункта 1 выводов). |
| `cron_jobs` | Cron Triggers или экземпляр со `step.sleep` | По ARCHITECTURE.md §4.3. |
| `task_sessions` (partial unique index) | Без изменений | D1 поддерживает частичные индексы (SQLite). |

Ограничения D1, которые надо учесть: нет интерактивных транзакций, только `batch` (атомарный). Поэтому операции вида «прочитал → решил → записал» делаются через условные `INSERT ... SELECT ... WHERE EXISTS` или `UPDATE ... WHERE generation=?`, как в `commitStep`. Внешние ключи и `ON DELETE CASCADE` работают.

## Что проверено, а что только по документации

- **Проверено локально (miniflare / workerd, wrangler 4.145.0):** T1–T14 (включая durable outbox #116); буферизация раннего события; отсутствие повторного выполнения завершённых шагов после kill -9 (шаги проигрываются из кэша); **отсутствие** самостоятельного продолжения после kill -9 без входящего события; fencing через D1 batch; неизменяемость терминальных статусов (T9); запросы к Task Store одним SQL; RSS; время подъёма около 2,3–2,5 с. Харнесс переносим: `setsid`/`ss`/GNU `date %N`/coreutils `timeout` больше не нужны, `run.sh` проходит и на macOS.
- **Только документация или issues (не проверено):** лимиты (1 МиБ, 10k шагов, 365 дней, 5 мин CPU, 10 ГБ D1); цены; хранение истории экземпляров; Time Travel у D1. **Проверено на реальном аккаунте (01.10.2026):** возобновление после сбоев и по таймерам, тайм-аут ожидания, деплой во время ожидания — см. [../CLOUD-SMOKE.md](../CLOUD-SMOKE.md). Связанные issues про расхождения локального эмулятора и продакшена: [cloudflare/agents#823](https://github.com/cloudflare/agents/issues/823) (pause/resume/restart локально, исправлено в марте 2026), [workers-sdk#14926](https://github.com/cloudflare/workers-sdk/issues/14926) (wrangler dev не восстанавливается после рестарта workerd), [workers-sdk#15809](https://github.com/cloudflare/workers-sdk/issues/15809) (утечка файловых дескрипторов у экземпляров в miniflare), [Workflows changelog](https://developers.cloudflare.com/workflows/reference/changelog).
