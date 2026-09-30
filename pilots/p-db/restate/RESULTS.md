# P-DB — вариант Restate (self-hosted, single binary)

Запуск: `./run.sh` (скачивает `restate-server` v1.7.12 в `bin/`, ставит зависимости, поднимает
restate-server + executor, прогоняет T1–T8, убивает все процессы в `trap EXIT`). Весь прогон ~13 с.
Сырые данные: `results.json`, логи: `pilot.log`, `service.log`, `restate-server.log` (gitignored).

Версии: restate-server **1.7.12** (x86_64 musl, GitHub release), `@restatedev/restate-sdk` **1.17.2**, Node 20.20.
Порты: ingress 18080, admin 19070, node/fabric 15122, executor endpoint 19080 (`restate.toml`).

## Устройство

| Часть | Файл | Что делает |
|---|---|---|
| Workflow Port (адаптер) | `src/port.js` | `InstancePort`: `step`→`ctx.run`, `waitFor`→`ctx.promise(name).get().orTimeout()`, `sleep`→`ctx.sleep`. `ClientPort`: `start`→`POST /pilotPlan/{userTaskId}/run/send` (ключ workflow = userTaskId), `signal`→shared handler `signal` (resolve durable promise), `cancel`→admin `PATCH /invocations/{id}/cancel`, `status`→admin SQL `sys_invocation` |
| Task Store | `src/taskstore.js` | отдельный SQLite (`taskstore.db`): `tasks` (status — колонка, `generation`, `owner`), `task_events` (история), `side_effects` (счётчики). Запись шага = одна транзакция с проверкой generation |
| Executor | `src/service.js` | процесс SDK-эндпоинта (HTTP/2). Workflow `pilotPlan`: prepare → run → wait → apply → finalize. Каждый шаг = `ctx.run` + fenced commit в Task Store |
| Тест-драйвер | `src/pilot.js` | управляет процессами (kill -9, рестарты), проверки T1–T8, пишет `results.json` |

Restate хранит **только ход оркестрации** (журнал инвокаций, durable promises, таймеры) в своём
`restate-data/` (RocksDB + локальный лог + встроенный metadata-server). Статусы, результаты и история
задач — только в Task Store; Restate-журнал после завершения удаляется по retention
(`default-workflow-completion-retention = 1d`, `default-journal-retention = 1d`), что совпадает с правилом §4.1.

Fencing (INV-02): каждое (пере)исполнение handler'а (новая попытка после краха, резюм после suspend)
забирает `generation = generation + 1` в Task Store (намеренно вне журнала). Все записи шагов идут
`WHERE generation = ?`; устаревшая попытка получает отказ, событие `fencing_rejected` пишется в историю.

## Результаты T1–T8 (проверено локально, прогон 30.09.2026)

| Тест | Итог | Доказательство (из `results.json` / логов) |
|---|---|---|
| T1 happy path | **PASS** | steps=`prepare,run,wait,apply,finalize`, status=`done`, counters `{prepare:1,run:1,apply:1}`, output `{"answer":"да","applied":true}`. Повторный `start` с тем же ключом: `{"invocationId":"inv_16La…","status":"PreviouslyAccepted"}` — тот же экземпляр |
| T2 kill -9 после шага 2 | **PASS** | executor сам себя `SIGKILL` сразу после `ctx.run("run")`: `exit {"sig":"SIGKILL"}`, в Task Store `steps:[prepare,run]`, counters `{prepare:1,run:1}`. Restate: `WARN … retrying … broken pipe … pilotPlan/ut-pilot-2/run`. После рестарта: `attempt start ut-pilot-2 gen=2` → replay журнала, prepare/run не перевыполнены, итог counters `{prepare:1,run:1,apply:1}`, done. Attempts: gen1 pid:164298, gen2 pid:164392 |
| T3 ожидание без исполнителя | **PASS** | при `awaiting_input` инвокация в `sys_invocation.status = suspended`; executor убит `kill -9`, затем убит `kill -9` и перезапущен **сам restate-server** — после рестарта статус снова `suspended`. `signal` отправлен при мёртвом executor (`/signal/send` → `Accepted`), через 1.5 с задача всё ещё `awaiting_input` (Restate ретраит `connection refused`), после старта executor → `done`, counters `{1,1,1}`, signal→done 2.0 с (включая загрузку node) |
| T4 ранний сигнал | **PASS** | signal отправлен, когда выполнен только `prepare` (шаг `run` спит 3 с); `wait` достигнут через 2.9 с после сигнала; ответ не потерян, apply=1, done. Семантика durable promise: resolve до `get()` сохраняется |
| T5 дубль сигнала | **PASS** | два параллельных signal: `{"accepted":true}` и `{"accepted":false,"reason":"promise was already completed"}`; третий после done — тот же отказ. apply=1, результат `да` (первое значение) |
| T6 fencing | **PASS** | (a) ut-pilot-2: запись от убитой попытки gen1 при текущем gen2 → `stale generation 1 != 2`, строка tasks и счётчики побайтно не изменились. (b) ut-pilot-6: попытка gen1 дошла до wait и suspend'нулась, после signal резюм = gen2; «зомби» gen1 пишет `finalize/failed` → `stale generation 1 != 2`, статус остался `done` |
| T7 cancel | **PASS** | admin `PATCH /invocations/inv_1khT…/cancel` → 202; handler ловит `TerminalError 409`, пишет `cancelled` в Task Store. Затем signal (`accepted:true` — promise резолвится, но run уже завершён), kill -9 + рестарт executor, повторный `start` → `PreviouslyAccepted` (новый run не создаётся). Engine: `completed / failure`; Task Store: `cancelled`, steps `[prepare,run,wait]`, apply=0 |
| T8 наблюдаемость | **PASS** | один SQL (ниже) → `{"id":"ut-pilot-2","status":"done","generation":2,"history":[attempt_claimed g1, prepare g1, run g1, attempt_claimed g2, wait g2, signal, apply g2, finalize g2, fencing_rejected g1]}` |

T8 запрос:
```sql
SELECT t.id, t.status, t.generation, t.result_json,
  (SELECT json_group_array(json_object('seq',e.seq,'kind',e.kind,'step',e.step,'gen',e.generation))
     FROM task_events e WHERE e.task_id=t.id) AS history
FROM tasks t WHERE t.id = 'ut-pilot-2';
```

## Метрики (локально)

| Метрика | Значение |
|---|---|
| Строки адаптера (без тестов, без комментариев/пустых) | port.js 46 + taskstore.js 79 + service.js 69 ≈ **194** |
| Движущиеся части | 3: `restate-server` (один бинарь со встроенными RocksDB, логом, metadata), процесс executor (node), файл SQLite Task Store |
| T1 wall clock (start → done, сигнал сразу по awaiting_input) | 380–450 мс |
| Задержка signal → шаг 4 (apply закоммичен) | 33–40 мс |
| Холодный старт restate-server | 0.3–0.5 с |
| RSS restate-server во время ожидания | ~150–175 МБ с урезанной памятью (`rocksdb-total-memory-size=256MiB`, 4 партиции); **~250 МБ при дефолтном конфиге** (замер простоя, 24 партиции) |
| RSS executor (node + SDK), простой | ~67–80 МБ; во время ожидания процесс **не нужен** (инвокация suspended) |
| Диск `restate-data` | ~157 МБ (из них 75 МБ log-store и 75 МБ metadata-server — преаллокация, данные задач единицы КБ); taskstore.db 4 КБ + WAL |

## Выводы

1. Все 8 проверок проходят на одном узле без Docker. Шаги дедуплицируются журналом (`ctx.run`),
   ожидание стоит ноль ресурсов исполнителя (suspend), ранний/двойной сигнал корректны за счёт семантики
   durable promise, cancel встроенный, идемпотентный start по ключу = userTaskId.
2. Живой процесс **нужен restate-server** (≈150–250 МБ RSS постоянно). Executor во время ожидания не нужен,
   но **signal в workflow-варианте исполняется кодом executor'а** (shared handler) — пока executor лежит,
   сигнал принят и сохранён сервером, но promise резолвится только после подъёма executor. Restate сам
   процессы не поднимает: executor должен быть долгоживущим сервисом (systemd) или serverless-эндпоинтом.
   (По документации, не проверено: awakeables резолвятся через ingress самим сервером без executor.)
3. Fencing в Task Store пишем сами (generation), это ~15 строк. Restate фенсит собственные попытки
   внутри журнала (устаревшая попытка не может дописать в журнал), но не защищает внешние записи в
   нашу БД — поэтому generation в Task Store обязателен (§4.1).
4. Подводные камни, найденные в пилоте:
   - SDK 1.17.2 требует `Promise.withResolvers` (Node ≥ 22); на Node 20 падает с `TypeError` — поставлен 1-строчный polyfill в `service.js`. В проде — Node 22.
   - Executor-эндпоинт только h2c; `fetch` (HTTP/1.1) к нему не работает (health-check через TCP).
   - Дефолтная retry-политика сервера: `max-attempts=70`, `max-interval=1m`, `on-max-attempts="pause"` — если executor лежит больше ~1 ч, инвокация встаёт на паузу и требует ручного resume. В пилоте `max-interval=1s`. Для прода — отдельно продумать и мониторить paused.
   - `inactivityTimeout` = 1 с (чтобы быстро suspend'иться) приводит к лишним повторным исполнениям handler'а (replay; в T4 новая попытка gen2 после долгого `ctx.run`) — дубликатов side effects нет, но generation растёт; для прода — ближе к дефолту (1 мин).
   - SDK-эндпоинт по умолчанию не проверяет подпись запросов (`WARN: Accepting requests without validating request signatures`) — в проде включить request identity key.

## Эксплуатация одним человеком

| Тема | Что нужно | Источник |
|---|---|---|
| Установка | один статический бинарь (~50 МБ xz), `restate.toml`, systemd unit; executor — обычный node-сервис; регистрация деплоймента `POST /deployments` | проверено |
| Бэкап | холодный: остановить сервер и `tar restate-data/` (горячее копирование RocksDB небезопасно). Штатно — snapshots партиций в S3-совместимое хранилище (`worker.snapshots`) + сохранность лога/metadata. Потеря `restate-data` = потеря хода in-flight задач, **но не самих задач** (они в Task Store; можно перезапустить workflow с текущего шага) | документация, не проверено |
| Апгрейд сервера | замена бинаря и рестарт (рестарт по kill -9 с сохранением состояния проверен); совместимость формата данных между минорами — по release notes | частично проверено |
| Апгрейд кода workflow | деплойменты неизменяемы; in-flight инвокации привязаны к версии, на которой стартовали → старый эндпоинт держать до дренажа или менять код строго совместимо с журналом (детерминизм replay). Для ожиданий до 30 дней это реальная нагрузка | документация, не проверено |
| Мониторинг | admin API + SQL по `sys_invocation` (использовано в пилоте); Prometheus-метрики сервера; алерт на `paused`/`backing-off` инвокации | SQL проверен, метрики — документация |
| Лицензия | сервер — **BSL 1.1** (LICENSE в архиве): разрешено любое использование, кроме предоставления «Public Restate Platform Service» (управляемый Restate как сервис третьим лицам); каждая версия переходит в Apache 2.0 через 4 года. SDK — MIT. Для внутреннего использования ограничений нет | проверено по LICENSE |
| Restate Cloud | опционально: управляемый сервер, executor остаётся у нас; снимает бэкап/апгрейды, добавляет внешнюю зависимость и сетевой путь | документация |

Итог по цене сопровождения: +1 stateful-сервис со своим форматом хранения, бэкапом и политикой апгрейда
кода (versioned deployments) поверх Task Store. Проще Temporal (один бинарь, нет отдельной БД), но
тяжелее варианта «текущий механизм планов + SQLite», где хранилище одно.

## Перенос прод-схемы `durable-tasks/state.db`

Прочитано read-only: `origin/main:src/durable-task-store.js` (базовые таблицы) и `src/durable-task-migrations.js`.

| Прод | В варианте Restate |
|---|---|
| `durable_tasks` (status draft/active/paused/blocked/done/failed/cancelled, `revision`, `request_id`, `parent_task_id`) | остаётся таблицей Task Store как есть; добавить `user_task_id` (= ключ workflow), `engine_instance` (invocation id), `generation`, `owner`, статус `awaiting_input`. Статус по-прежнему колонка |
| `task_items` (position, status pending/running/waiting/done…, `attempt_count`, `max_attempts`, `wait_json`, `fanout_json`, `hooks_json`) | строки шагов остаются источником истины для Reporting; каждый `ctx.run` коммитит статус своей строки (как `commitStep`). `wait_json` → `waitFor`/`sleep` движка (таймер/deadline держит Restate, копия deadline — в строке для отчётов). `fanout_json` → дочерние workflow (ключ = child task id) |
| `executions` (attempt per step, engine/model, `attempt_number`, `result_json`) | = наш `attempt_claimed`/generation: одна строка на попытку исполнения; `attempt_number` ↔ generation |
| `hook_executions` (`boundary_key UNIQUE`) | уже идемпотентны — ложатся в `ctx.run` без изменений |
| `task_validation_results` | без изменений, пишутся внутри шагов |
| Политика восстановления (2 повтора на уровне, затем +1 уровень) | логика в коде workflow поверх `ctx.run` + `RetryPolicy`; бюджет попыток — из `task_items` |
| In-flight планы на момент перехода | журнал Restate импортировать нельзя: либо дорабатывают на старом механизме, либо стартуют новым workflow с входом «продолжить с шага N» (данные берутся из Task Store) |

## Что проверено, а что нет

- **Проверено локально**: T1–T8; kill -9 executor после шага; kill -9 restate-server во время ожидания с сохранением suspended-состояния; идемпотентный start; ранний/двойной сигнал; cancel через admin API; RSS/диск; лицензия по файлу LICENSE; SDK 1.17.2 на Node 20 только с polyfill.
- **Только по документации**: snapshots/бэкап в S3, совместимость данных при апгрейде минорных версий, versioning деплойментов при долгих ожиданиях, Prometheus-метрики, awakeables без executor, кластерный режим/репликация, поведение при месячных ожиданиях (timeout 24 ч задан, но не дожидались), Restate Cloud.
- **Не проверено вообще**: нагрузка (много тысяч ожидающих), размер `restate-data` на длинной дистанции, D1/Postgres (Task Store здесь — SQLite).
