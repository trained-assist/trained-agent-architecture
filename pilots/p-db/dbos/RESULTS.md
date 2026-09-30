# P-DB: DBOS Transact + Postgres

Движок: `@dbos-inc/dbos-sdk` 5.2.11 (MIT), Postgres 18.4 (embedded-postgres, без root, свой порт). Node v20.20.2.
Воспроизведение: `./run.sh`. Скрипт делает `initdb` в `pgdata/` на случайном порту 55432–56431, прогоняет T1–T8 через `src/driver.ts`, пишет `results.json` и `logs/`, в trap останавливает Postgres и добивает исполнителей. После прогона процессов не остаётся (проверено `pgrep`).

## Устройство

| Файл | Что внутри | LOC* |
|---|---|---|
| `src/port.ts` | Workflow Port. `step` = `DBOS.runStep`, `waitFor` = `DBOS.recv(topic,{timeoutSeconds})`. Через `DBOSClient` (работают без живого исполнителя): `start` = `client.enqueue(workflowID=userTaskId)`, `signal` = `client.sendInTransaction` (одна PG-транзакция с записью в `task_events`), `cancel` = Task Store `cancelled` + рост generation + `client.cancelWorkflow`, `status` = DBOS + Task Store | 48 |
| `src/taskstore.ts` | `tasks` (status — колонка, generation, owner), `task_events`, `side_effects`; `claim()` и `fencedStep()` (fencing по generation) | 83 |
| `src/workflow.ts` | План из 5 шагов (prepare / run / wait / apply / finalize). Использует только Port и Task Store | 47 |
| `src/executor.ts` | Отдельный процесс-исполнитель: `DBOS.launch()` (восстанавливает PENDING) + очередь `pilot_tasks` | 14 |
| `src/driver.ts` | Тесты T1–T8 (не входит в адаптер) | 196 |

\*Непустые строки без комментариев. Адаптер с Task Store — **192 строки**.

**Движущиеся части: 2.** Одна база Postgres (таблицы Task Store в `public`, системные таблицы DBOS в схеме `dbos`) и процесс(ы) Node с библиотекой DBOS. Отдельного сервера движка нет, Conductor не нужен.

**Fencing.** Код воркфлоу вне шагов выполняется при каждом входе, в том числе при recovery. Там вызывается `claim()`: `generation += 1`, `owner = pid`. Каждый шаг пишет через `fencedStep(gen)`: `SELECT … FOR UPDATE`, и если generation не совпадает или статус терминальный, запись отвергается (`StaleGenerationError`). `cancel` тоже увеличивает generation, поэтому попытка, которая ещё идёт, не сможет записать результат.

## T1–T8 (всё проверено локально, прогон `./run.sh`, rc=0)

| Тест | Итог | Доказательство (из `logs/driver.log`, `results.json`) |
|---|---|---|
| T1 happy path | **PASS** | `status: engine=SUCCESS, task.status=done`, `steps: [prepare,run,wait,apply,finalize]`, `counters {prepare:1,run:1,apply:1}`. Повторный `start("ut-pilot-1")` вернул тот же `ut-pilot-1` и ничего не перезапустил (идемпотентный start по workflowID) |
| T2 crash after step 2 | **PASS** | `exec-3 … CRASH: kill -9 self after step 2, before step 3` → `exec-3 exited signal=SIGKILL`. После краха: `counters {prepare:1,run:1}`, `engine=PENDING`. `exec-4` после `DBOS.launch()` сам поднял воркфлоу (`attempt generation 2`), выполнил сразу step3, счётчики остались `{prepare:1,run:1}`, `recovery_attempts: 2`. Итог: `done` |
| T3 ожидание без ресурсов | **PASS** | Задача в `awaiting_input`, исполнитель убит `kill -9`, `executor_processes_during_wait: 0`. Статус читается при мёртвом исполнителе (`engine=PENDING, task=awaiting_input`). Сигнал отправлен через DBOSClient при мёртвом исполнителе. Новый исполнитель довёл задачу до `done` за 1065 мс от спавна (из них ~0.8 с — запуск Node, tsx и DBOS) |
| T4 ранний сигнал | **PASS** | Сигнал отправлен, когда исполнителя нет и воркфлоу в состоянии `ENQUEUED` (`task=pending`). В журнале `signal` идёт раньше `step wait` (`signal_event_before_wait_step: true`). После старта исполнителя `recv` сразу вернул `{"answer":"да"}`, `apply:1`. **Оговорка:** `send` в ещё не созданный воркфлоу отвергается: `DBOSNonExistentWorkflowError`. Значит, сначала `start` (enqueue), потом `signal`. В Port это соблюдается: start создаёт строку воркфлоу сразу |
| T5 дубль сигнала | **PASS** | Три `send`: дважды с ключом `reply-2`, один раз `reply-2-other` (payload «нет»). В `dbos.notifications` 2 строки: дубль по ключу отброшен (`message_uuid = key::dest`, `ON CONFLICT DO NOTHING`). `apply:1`, применён payload `{"answer":"да"}`. **Семантика recv:** это очередь сообщений по topic, каждое сообщение потребляется ровно одним `recv` (`consumed=true`), а второе сообщение с другим ключом осталось `consumed=false`. Если план снова вызовет `waitFor("user_reply")`, он получит этот старый дубль. Нужен idempotency key на стороне Input (например, id входящего сообщения) или уникальный topic на каждое ожидание (`user_reply:<step>`) |
| T6 fencing | **PASS** | На живой задаче: `stale write rejected for ut-pilot-6: attempt generation=1, current=2, status=awaiting_input`, `state_unchanged: true` (снимки tasks, events и counters до и после совпадают). На завершённой: `ut-pilot-2: attempt generation=1, current=3, status=done` отвергнуто. Fencing наш (Task Store). У DBOS своя защита: чекпойнт шага — PK `(workflow_uuid, function_id)`, при гонке двух исполнителей второй получает conflict. Это известно из кода и документации, локально не проверялось |
| T7 cancel | **PASS** | Cancel во время ожидания, затем signal, `kill -9` и новый исполнитель: `engine=CANCELLED`, `task=cancelled`, `counters {prepare:1,run:1}` (apply нет), `step_or_claim_events_after_cancel: 0`. В логе исполнителя: `Workflow ut-pilot-7 was cancelled during execution`. Recovery отменённые воркфлоу не поднимает |
| T8 наблюдаемость | **PASS** | Один SQL по Task Store (запрос и вывод ниже) |

T8, запрос:
```sql
SELECT t.id, t.status, t.generation, t.result,
       json_agg(json_build_object('g', e.generation, 'kind', e.kind, 'step', e.step,
                'at', to_char(e.created_at,'HH24:MI:SS.MS')) ORDER BY e.id) AS history
  FROM tasks t JOIN task_events e ON e.task_id = t.id WHERE t.id = 'ut-pilot-2' GROUP BY t.id;
```
Вывод (ut-pilot-2, прошла через краш и рестарт):
```
id=ut-pilot-2 status=done generation=3 result={"answer":"да"}
g1 claim | g1 step_done prepare | g1 step_done run      <- exec-3, kill -9
g2 claim | g2 step_done wait                            <- exec-4, kill -9 во время ожидания
signal user_reply x3                                    <- исполнителя нет
g3 claim | g3 step_done apply | g3 step_done finalize   <- exec-5
```
Движок показывает то же самое в своём представлении: `listWorkflowSteps` = `[prepare, run, wait, DBOS.recv, DBOS.sleep, apply, finalize]`. Это можно читать и прямым SQL по `dbos.operation_outputs`.

## Метрики

| Метрика | Значение |
|---|---|
| T1 wall clock (start → done, сигнал отправляется сразу после `awaiting_input`) | ~1.3 с (1313 мс). В это время входит опрос драйвера с шагом 50 мс и опрос очереди (200 мс) |
| signal → step4 (по времени событий в БД), исполнитель жив | 25–39 мс (три прогона) |
| Рестарт исполнителя → done (T3) | ~1.07 с, почти всё — холодный старт Node, tsx и DBOS |
| RSS исполнителя в ожидании (node + tsx + DBOS) | ~95 МБ (97 180 КБ) |
| Postgres при мёртвом исполнителе | 11 процессов, сумма RSS 133 МБ (завышена общей shared memory), **сумма PSS ≈ 46 МБ** |
| Postgres при живом исполнителе | 17 процессов (плюс 6 соединений пула DBOS и Task Store), PSS ≈ 57 МБ |
| Нужен ли живой процесс во время ожидания | **Нет.** Ожидание хранится в Postgres (`recv` записан как `DBOS.recv` и `DBOS.sleep` с дедлайном). Нужен только Postgres. Но исполнитель должен быть поднят, чтобы сигнал был обработан: DBOS не будит процесс сам. Нужен постоянно работающий сервис (systemd) или запуск по событию |
| Строк адаптера | 192 (port 48, taskstore 83, workflow 47, executor 14) |
| Движущихся частей | 2 (Postgres и процесс-исполнитель с библиотекой) |

## Эксплуатация одним человеком

| Что | Оценка |
|---|---|
| Лицензия | DBOS Transact — MIT (из `package.json`, проверено). **DBOS Conductor** (облачная панель, автоматическое recovery между VM, UI) — отдельный коммерческий сервис, для пилота не нужен. Тарифы не проверял |
| Postgres | Главная новая нагрузка. Нужны бэкапы (`pg_dump` по cron или WAL-архив и PITR через pgBackRest или wal-g), мажорные апгрейды (`pg_upgrade` раз в год-два), мониторинг (диск, соединения, bloat, autovacuum). Для одной VM это примерно один systemd-юнит и cron с бэкапом, но это больше, чем «файл SQLite». Можно взять managed Postgres (Neon, Supabase, RDS): DBOS работает с любым Postgres. Тогда ops ≈ 0, но появляется сетевая задержка и внешний сервис |
| Системные таблицы DBOS | Схема `dbos` (13 таблиц: `workflow_status`, `operation_outputs`, `notifications`, `workflow_events`, `queues`, `application_versions`, …) создаётся и мигрируется самим SDK при `launch()`. Бэкап у них общий с Task Store, это плюс: одна база и один бэкап. Нужна политика очистки старых воркфлоу: в документации есть retention и GC, сам не проверял |
| Апгрейд версии кода | **Важный риск (по документации и коду SDK):** PENDING-воркфлоу восстанавливаются только исполнителем с тем же `applicationVersion` (по умолчанию это хэш кода воркфлоу). Enqueued-задачи без `appVersion` забирает только «последняя» версия. В пилоте версия зафиксирована вручную (`pilot-v1`). В проде при деплое с ожидающими неделями задачами нужна дисциплина: либо детерминированный и совместимый код воркфлоу при фиксированной версии, либо старая версия дорабатывает свои задачи, либо patching или `forkWorkflow`. Не проверено |
| Апгрейд SDK | Мажоры идут часто (сейчас 5.x). Миграции системной схемы накатываются при launch. Нужен пин версии и прогон этого пилота перед апгрейдом |
| Несколько VM | Recovery после `kill -9` проверен только для одного исполнителя (executorID `local`). Если VM умерла навсегда, её PENDING-воркфлоу поднимает Conductor или ручной `recoverPendingWorkflows([executorID])`. Это из документации, не проверено. Для схемы «одна VM — один владелец» не нужно |
| Мониторинг | Всё смотрится SQL-запросами (Task Store и `dbos.workflow_status`), отдельный UI не нужен |

## Перенос прод-схемы `durable-tasks/state.db`

Прод-схема прочитана из `origin/main:src/durable-task-store.js` и `src/durable-task-migrations.js`.

| SQLite (прод) | Postgres | Замечания |
|---|---|---|
| `durable_tasks` (id, profile_id, project_id, goal, status CHECK, created_at/updated_at INTEGER, revision, playbook_*, *_json, parent_task_id…) | тот же набор колонок | `*_json TEXT` → `JSONB`. `INTEGER` epoch → `BIGINT`, либо сразу `TIMESTAMPTZ`. CHECK на статусы переносится как есть. Добавляется `user_task_id` (= DBOS workflowID), а также `generation` и `owner` для fencing, как в пилотной `tasks` |
| `task_items` (position, status, tiers, attempt_count, max_attempts, `wait_json`, `fanout_json`, hooks_json…) | те же колонки, JSON → JSONB | Строка остаётся источником истины для статуса шага. Ход исполнения берёт на себя DBOS. `wait_json` (until, deadline, awaiting_user) становится описанием `waitFor` плюс копией для Reporting; сам таймер — это `DBOS.recv(timeout)` и `DBOS.sleep`. `fanout_json` (дочерние планы) → дочерние воркфлоу (`startWorkflow` из шага), связь через `parent_task_id` |
| `executions` (engine, model, tier, status, started/finished, error_class, result_json…) | как есть, ближе всего к `task_events` и `executions` | В пилоте `task_events` — это минимальная версия журнала. В проде остаются обе таблицы: `executions` для запусков агента, `task_events` для переходов |
| `task_validation_results`, `hook_executions` (`boundary_key UNIQUE`) | как есть | `boundary_key UNIQUE` — это уже идемпотентность, в Postgres работает так же (`ON CONFLICT DO NOTHING`) |
| `task_sessions` (partial unique index `WHERE active=1`) | как есть | Partial index в Postgres поддерживается (`WHERE active`) |
| `cron_jobs` | как есть или `DBOS.createSchedule` | Решить отдельно |

Миграция данных — одноразовый скрипт (`sqlite3 .dump` или pgloader). Диалект почти совпадает: заменить `INTEGER` 0/1 на boolean там, где нужно, `TEXT` JSON на `JSONB`, `PRAGMA` не переносится. Активные планы на момент переезда либо дорабатывают на старом механизме, либо переносятся как новые воркфлоу со стартом с текущего шага. Это не проверялось.

## Что проверено, а что нет

Проверено локально (этот прогон):
- T1–T8.
- Recovery после `kill -9` при повторном `DBOS.launch()`.
- Сигнал до `recv` сохраняется, если строка воркфлоу уже есть (ENQUEUED).
- Сигнал в несуществующий воркфлоу отвергается.
- Дедупликация по idempotencyKey; сообщение с другим ключом остаётся непотреблённым.
- `cancelWorkflow` переживает рестарт.
- `sendInTransaction` пишет сигнал в одной транзакции с журналом Task Store.
- Идемпотентный start по workflowID.
- RSS и PSS.

Только по документации или коду SDK, не проверено:
- Recovery между разными VM (Conductor).
- Апгрейд версии приложения при ожидающих воркфлоу.
- Срабатывание 24-часового таймаута `recv`, если исполнитель в дедлайн был мёртв (в коде дедлайн хранится, при рестарте `recv` досчитывает остаток).
- Транзакционные шаги через datasource-пакеты (`@dbos-inc/node-pg-datasource`): запись в Task Store и чекпойнт в одной транзакции, то есть exactly-once для записей в БД. В пилоте запись и чекпойнт — две транзакции, между ними возможен повтор шага; от повторной записи защищает только fencing по generation, а от дублей — идемпотентность шага.
- GC и retention системных таблиц.
- Тарифы Conductor.

Мелочи: SDK выдаёт `DeprecationWarning` от `pg` (`client.query() when the client is already executing a query`), на работу это не влияет. Unix-сокет Postgres в длинном пути не создаётся (лимит 107 байт), поэтому в пилоте используется только TCP.

## Выводы

1. **Все 8 проверок PASS.** DBOS закрывает долговечные шаги, ожидание без процесса, буферизацию раннего сигнала, дедупликацию по ключу и cancel, при этом не нужен отдельный сервер движка: это библиотека плюс схема в том же Postgres.
2. **Главный плюс по сравнению с внешними движками:** Task Store и оркестрация живут в **одной** базе. Signal и запись в журнал делаются одной транзакцией (`sendInTransaction`), бэкап тоже один. Через datasource-транзакции можно сделать шаг и чекпойнт атомарными. Это хорошо совпадает с §4.1 («одна транзакционная база»).
3. **Главная цена — Postgres.** Сопровождение Postgres одним человеком (бэкап, PITR, `pg_upgrade`) дороже SQLite, D1 или CF Workflows. Второй риск — привязка recovery к `applicationVersion` при долгих ожиданиях: деплой нужно продумывать.
4. На одной VM с правилом «одна VM — один владелец» Conductor не нужен. Если управляющий слой будет на VM, DBOS + Postgres — сильный кандидат.
