# P-DB вариант: текущий механизм планов из прода + SQLite

Код прода взят как есть из `trained-assist-agent` на `origin/main` **0894ac5** (30.09.2026): `git archive` в `vendor/`, без правок.
Адаптер Workflow Port — `port.js`, детерминированная среда шагов — `steps.js`, процесс-исполнитель — `executor.js`, сценарий — `scenario.js`, T6 — `t6-fencing.js`.
Запуск одной командой: `./run.sh`. Все пути хранилища лежат в `sandbox/` (HOME, AGENT_DATA_DIR, USERS_DIR, AGENT_TOKENS_*). После прогона не остаётся ни одного процесса: проверяется `pgrep`, плюс `trap` с `pkill -9`.

## Как прод-механизм закрывает Port

| Операция Port | Чем закрыта в проде | Покрытие |
|---|---|---|
| start(userTaskId, def, input) | `createPlan({id: userTaskId})` + MCP `task_update(status=active)` | Есть. Идемпотентность — только за счёт PK (адаптер сначала делает `getTask`). Колонки для input нет, пишем в `user_value` |
| step(name, fn, retry) | Строка `task_items` + `runDueDurable` → `runTask` (запуск LLM-агента) → маркер `DURABLE: done/failed/waiting` в тексте ответа | Частично. Шаг-функции нет: исполняется LLM-запуск по тексту `instructions`. Адаптер подменяет `runTask` детерминированным кодом и сам склеивает ответ `RESULT: <json>\nDURABLE: done`. Результат — это текст ответа в `evidence_json.reply` (обрезка до 4000 символов) плюс файл-артефакт, который проверяет валидатор `file_exists`. Повторы — `max_attempts` + `durable-recovery` (как есть) |
| sleep(until) | `wait_json` с `sleep_sec` / `due_at` | Есть (в сценарии не проверялось) |
| waitFor(event, timeout) | MCP `task_item_wait(awaiting_user)` внутри шага + `DURABLE: waiting`. Ожидание 24 ч по умолчанию, максимум 30 дней | Есть, но без типа события: подходит любой wake. Задача остаётся в статусе `active`; ожидание видно только по `task_items.status='waiting'` и `wait_json.awaiting_user` |
| signal(inst, event, payload) | MCP `task_item_wake(item_id, message)` + `durable-kick.notify` (HTTP `/internal/durable/kick`) | Частично: нет буфера для раннего сигнала (T4), нет дедупликации (второй wake перезаписывает первый), payload — строка |
| cancel(inst) | MCP `task_update(status=cancelled)` | Есть для ожидающей задачи (T7). Для идущего шага нужен отдельный /stop по слоту (здесь не проверялось) |
| status(inst) | Строки `durable_tasks` / `task_items` / `executions` | Есть (T8) |

## Результаты T1–T8

| Тест | Итог | Доказательство (`results.json`, `sandbox/logs/`) |
|---|---|---|
| T1 happy path | **PASS** | `ut-pilot-1`: status=done; 5 шагов done; счётчики prepare/run/apply/finalize = 1/1/1/1; повторный `start` → `created:false`. В логе `exec-t1.log`: `KICK via http` → `wait resolved: woken` → apply → finalize → `task complete` |
| T2 kill -9 после шага 2 | **PASS** | В момент kill у шага `wait`: status=pending, attempts=0, executions=0; счётчики prepare=1, run=1. После рестарта (`BOOT requeued=0`) шаги 1–2 не повторялись (prepare=1, run=1), план дошёл до ожидания. Дополнительно T2b (kill -9 *внутри* шага 2, после побочного эффекта, до settle): `BOOT requeued=1`, run=**2**, у execution статус `interrupted`, затем `success` (attempt 2). Это at-least-once, ключа идемпотентности нет |
| T3 ожидание без ресурсов | **PASS** | После kill -9 исполнителя на ожидании живых исполнителей 0. Task Store: task=`active`, item=`waiting`, `awaiting_user=true`, deadline через 24 ч. Сигналы отправлены при остановленном исполнителе (они пишут только в БД). Новый исполнитель поднялся, задача → done |
| T4 ранний сигнал | **FAIL** | `task_item_wake` до ожидания → `{"error":"item is not waiting (status=pending)"}`. Когда шаг дошёл до ожидания, он остался припаркованным (`wake_message=null`, apply=0), то есть событие потеряно. Задача завершилась только после того, как отправитель повторил сигнал |
| T5 дубль сигнала | **PASS** (с оговоркой) | Два wake подряд оба приняты, apply=1. У шага `wait` две записи executions (`waiting` → `success`), шаг исполнен один раз. Wake после done → `item is not waiting (status=done)`. Оговорка: второй wake **перезаписывает** `wake_message`/`woken_at` (побеждает последний писатель). Дедупликации по id сигнала нет — сигналы схлопываются только потому, что шаг ещё не забран |
| T6 fencing | **FAIL** | В схеме нет owner/lease/generation (`fencingCols: []`). Сценарий: попытка A забрала шаг (`exec-A`). Через 46 мин обычный тик по grace 45 мин вернул шаг в очередь, попытка B забрала его (`exec-B` running). Затем устаревшая A ответила `DURABLE: done` через `resumeDurableReply`. Запись **принята**: item=done, `last_execution_id=exec-A`, `exec-A=success`, `exec-B` всё ещё running, revision 7→9 |
| T7 cancel во время ожидания | **PASS** | `task_update(cancelled)`. Сигнал после отмены **принят** `wakeItem` (item всё ещё `waiting`). После kill -9 и рестарта, за ≥2 полных тика: задача cancelled, apply=0, executions 3→3. Claim и reconcile берут только задачи `t.status='active'` |
| T8 наблюдаемость одним SQL | **PASS** (с оговоркой) | Запрос и вывод ниже. Статус хранится колонкой. Отдельной таблицы событий нет: историю собираем из `executions` и `task_items`. Переходы ожидания (parked/woken) хранятся в `wait_json` и затираются |

Owner lock (связано с T6): второй исполнитель на той же data-dir получает отказ: `exit 3 OWNER_LOCK_REFUSED EXECUTION_OWNER_BUSY` (`execution-owner.sqlite`, как в строке 2 `server.js`). Это fencing на уровне хоста, а не попытки.

### T8: запрос и вывод (`ut-pilot-2`, план с kill -9 после шага 2 и на ожидании)
```sql
SELECT t.id, t.status, t.revision,
  (SELECT json_group_array(json_object('pos', position, 'step', title, 'status', status, 'attempts', attempt_count, 'wait', json_extract(wait_json, '$.resolved')))
     FROM (SELECT * FROM task_items WHERE task_id = t.id ORDER BY position)) AS steps,
  (SELECT json_group_array(json_object('exec', eid, 'step', title, 'status', estatus, 'attempt', attempt_number, 'at', started_at))
     FROM (SELECT e.id eid, i.title, e.status estatus, e.attempt_number, e.started_at FROM executions e JOIN task_items i ON i.id = e.task_item_id
           WHERE e.task_id = t.id ORDER BY e.started_at, e.rowid)) AS history
FROM durable_tasks t WHERE t.id = 'ut-pilot-2';
```
```
id=ut-pilot-2 status=done revision=21
steps:   prepare done(1) | run done(1) | wait done(1, wait=woken) | apply done(1) | finalize done(1)
history: prepare success#1 | run success#1 | wait waiting#1 | wait success#1 | apply success#1 | finalize success#1
```
(полный JSON — `results.json` → `tests.T8.row`)

## Метрики

| Метрика | Значение |
|---|---|
| Код адаптера (без тестов, без пустых строк и комментариев) | ~165 строк: `port.js` 64 + среда шагов в `steps.js` ~65 (ещё ~25 строк — тела 4 шагов сценария) + `executor.js` 34. Прод-код, который переиспользован как есть: store 948, migrations 90, wait 239, recovery 195, kick 52, gtd-controller 2407 |
| Движущиеся части | 1 процесс-исполнитель (в проде — весь `server.js`), 1 файл SQLite `durable-tasks/state.db` (WAL), файл-замок `execution-owner.sqlite`. Внешних сервисов нет |
| T1 wall clock | 15,8 с, из них 1 с — нарочная пауза перед сигналом. Время уходит на debounce кика: 3 с после каждого settle, 5 шагов |
| signal → шаг 4, исполнитель жив | **5,0 с** = wake → HTTP kick → debounce 3 с → повтор шага wait → settle → kick 3 с → apply. Если кик не дошёл: до 30 с (wait tick) + 3 с |
| signal → шаг 4, исполнитель поднят после сигнала | 2,5 с в пилоте (первый полный тик через 500 мс). **В проде ≈30–33 с**: после рестарта первый wait tick через 30 с, полный тик через 2 мин. То же после T2: обычный pending-шаг (не ожидание) wait tick не берёт — **до 2 мин** до первого полного тика |
| Нужен ли живой процесс во время ожидания | Для **сохранности** — нет: состояние целиком в SQLite, T3 PASS. Для **реакции** — да: кто-то должен опрашивать. Wait tick раз в 30 с делает один `COUNT(*)` активных ожиданий; у `awaiting_user` `due_at` равен дедлайну, поэтому claim ничего не выбирает, пока нет wake. Кик — HTTP на тот же процесс. RSS исполнителя в ожидании: **64 МБ** (только durable-модули; в проде тик живёт внутри всего `server.js`, отдельного процесса нет) |

## Разрывы относительно Port: чего не хватает для «второго адаптера»

1. **Шаг — это LLM-запуск, а не функция.** Прод исполняет `runTask(prompt)` и разбирает текстовый маркер `DURABLE:` из ответа. Детерминированной функции шага нет. `execution_kind: 'programmatic'` означает только «прогнать валидаторы», побочных эффектов там нет. Адаптеру пришлось подменить `runTask` и склеивать ответ с маркером (`steps.js`). Нужно: исполнитель `programmatic`-шага, который вызывает зарегистрированную функцию и пишет структурированный результат в колонку `result_json` (в `executions.result_json` она уже есть, но пишется только `patchExecution`). Сюда же относится замена маркера — ARCHITECTURE §4.4.
2. **Нет мемоизации результата шага и ключа идемпотентности.** Kill -9 между побочным эффектом и settle → шаг исполняется повторно (T2b: run=2). У CF Workflows `step.do` поведение то же (at-least-once), но Port должен давать шагу стабильный ключ `(task_id, item_id, attempt)` для внешних вызовов. Нужно: передавать шагу `idempotency_key = item_id`.
3. **Нет fencing на уровне попытки (T6).** Нужно: `task_items.claim_generation INTEGER` + `lease_until` + `owner`. Claim делает `generation+1` и отдаёт токен. Все `completeItem/failItem/parkItem/finishExecution` пишут `WHERE id=? AND claim_generation=?` и `changes=0` → отказ. Grace 45 мин заменить продлением lease heartbeat'ом. Это ~6 SQL-правок в `durable-task-store.js`, миграция колонок и проброс токена через settle-контекст / `resumeSink`. Сейчас спасает только `execution-owner.sqlite` (один сервер на VM). Внутри одного процесса ситуация из T6 реальна: grace 45 мин, а запуски идут до 2 ч и дольше с extend-timeout.
4. **Сигнал без буфера и без типа (T4, T5).** Нужно: таблица `task_signals(id PK = signal_id, task_id, event_type, payload_json, created_at, consumed_by_item, consumed_at)`. `signal` пишет строку (дубль → конфликт по PK → no-op). `waitFor` при парковке сначала ищет неизрасходованный сигнал своего типа. `wakeItem` становится частным случаем.
5. **Нет статуса задачи «ждёт ввода».** Задача остаётся `active`, ожидание видно только в `task_items`. Для Reporting нужен статус `awaiting_input` в CHECK `durable_tasks.status` (или представление).
6. **Нет журнала событий.** История — это `executions` плюс перезаписываемый `wait_json`. Для правила «история — таблица событий» (§4.1) нужна append-only `task_events`, которую пишут в той же транзакции, что и смену статуса.
7. **Отмена не закрывает шаги.** После `task_update(cancelled)` item остаётся `waiting`, и `wakeItem` его принимает (T7). Лучше `completeTask(id, 'cancelled')`: он уже есть в store и переводит pending/waiting в skipped, но MCP-инструмент его не вызывает. Плюс `wakeItem` должен отказывать, если задача не `active`.
8. **Строгий порядок вместо графа** (claim с позиционным гейтом). Для сценария не мешает, но это пункт «Заменяем» из §6.
9. **Латентность зависит от живого процесса и тиков**: рестарт → до 30 с для ожиданий и до 2 мин для обычных шагов. Нужно: при загрузке сразу делать полный проход после `reconcileOrphanedRunning`, как это сделано в пилоте, а не через 2 минуты.

Итог: из 7 операций Port прод закрывает как есть start, sleep, waitFor, cancel и status. step закрыт только для LLM-шагов, signal — только для уже ждущего шага. Для роли второго адаптера нужны пункты 1, 3 и 4, остальное — косметика и наблюдаемость. По объёму это правки в `durable-task-store.js` / `gtd-controller.js` (оценка — несколько сотен строк), а не новый движок.

## Цена эксплуатации одним человеком
- **Бэкап:** один файл SQLite в WAL. Нужен `sqlite3 .backup` или `VACUUM INTO` по cron плюс копия в GCS. Копировать файл `cp`-ом без `-wal` нельзя. Сейчас в `durable-task-*` отдельного бэкапа этой базы не видно (в пилоте не проверялось).
- **Апгрейд схемы:** аддитивные `ALTER TABLE ADD COLUMN` при открытии (`durable-task-migrations.js`) плюс одна пересборка таблицы ради CHECK. Выкатывается вместе с релизом, откат по релизной ссылке. Нисходящих миграций нет: новые колонки старый код просто игнорирует.
- **Мониторинг:** `GET /internal/gtd-status` (heartbeat тика), `durableItemCounts`, лог `[gtd-durable]`. Алерта «ожидание висит N часов» нет — его можно сделать SQL-запросом к `task_items`.
- **Новых сервисов не добавляется:** всё внутри `server.js` на VM, один процесс, один файл. Цена — одна VM и один владелец (§4.1). Масштабировать горизонтально нельзя без пункта 3.

## Перенос схемы `durable-tasks/state.db`
Переноса нет: это та же база. Для Port к ней добавляются `task_signals`, `task_events`, колонки `claim_generation/lease_until/owner` в `task_items`, `result_json` на уровне item и `user_task_id`. Для него сейчас используется `durable_tasks.id` = userTaskId: в пилоте `id='ut-pilot-N'` проходит без изменений. На D1 схема ложится почти 1:1 (тот же диалект SQLite, `json_extract` / `json_group_array` поддерживаются). Препятствие — синхронный `better-sqlite3` и `db.transaction()` по всему store: у D1 интерфейс асинхронный, транзакции через `batch()`.

## Честные ограничения
- Проверено локально на реальном прод-коде `0894ac5`: store, миграции, wait, recovery, kick, `gtd-controller.runDueDurable/runWaitTick/kickDurable/reconcileOrphanedRunning/resumeDurableReply`, MCP-обработчики `task_update/task_item_wait/task_item_wake`, owner lock.
- **Не** запускались: `server.js` целиком (запрещено), настоящий `runner.runTask` (LLM), журнал `pending-tasks` и путь resume того же сеанса движка (#1671). Поэтому в сценарии boot sweep вызывается с пустым `exceptItemIds`, как в проде при отсутствии журнала. `playbook_run`, /stop по слоту, хуки и bg-уведомления тоже не запускались.
- Каденс тиков в пилоте ускорен: первый полный тик через 500 мс, дальше каждые 2 с, кроме T1, где интервал прод — 5 мин. Debounce кика (3 с) и wait tick (30 с) — прод-значения. Прод-латентности после рестарта в таблице посчитаны по коду (2 мин / 30 с), а не замерены.
- T6 моделируется в одном процессе: две попытки как два settle-контекста, время сдвинуто параметром `now`. Двух процессов в одной data-dir не бывает из-за owner lock, и это отдельно доказано.
