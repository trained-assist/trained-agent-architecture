# Sandbox Plan — воспроизводимая разработка и проверка

Draft v0.2 · 30.09.2026. Практический companion к [плану реализации и интеграции](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) и [Engineering Approach](ENGINEERING-APPROACH.md). Здесь не заявляется готовность ещё не построенных sandbox methods. v0.2 добавляет разбор блокеров полного прохода и ссылку на карту bindings/credentials.

## Что означает «fixture обязателен»

**Test fixture** — подготовленное состояние для воспроизводимого сценария: входные данные, настройки и зависимости, способ запуска, ожидаемый результат и cleanup. Лучше говорить «воспроизводимый тестовый сценарий обязателен», чтобы это не звучало как требование проверять всё на заглушках.

Fixture не равен mock. Основной путь запускает настоящий Runner, API, filesystem и нужные adapters. Fake/emulated dependencies используются, чтобы получить контролируемые timeout, invalid JSON, expired auth, двойной callback или неработающий storage. Затем отдельный live smoke проверяет настоящего провайдера в разрешённом test account.

Пример: synthetic profile → POST нового API → настоящий OpenCode → два файла → export → скачивание клиентом → hash equality → readable Run logs. Вторая версия того же сценария ломает object-store export и проверяет failed/export_pending outcome, сохранность единственной копии и безопасную очистку. Это acceptance, а не «тест повторяет реализацию».

## Главная граница: живой сервис сохраняется

Sandbox имеет свои users/keys, endpoints, data roots, storage bindings и retention. Не использует production webhook/бота/очередь для эксперимента. Текущие репозитории читаем как references; новую реализацию размещаем отдельно. Snapshot исходников не равен копии секретов или private профилей.

На одной имеющейся VM можно сначала построить sandbox, если она предназначена владельцем для этого: отдельные roots/services/resource limits. Если на VM одновременно production, sandbox не получает соседние roots/credentials. Конкретную OS/runtime границу доказывает isolated tenant acceptance; название clean room само по себе не доказательство.

Переход VM в production — clean promotion после acceptance, с созданием отдельного воспроизводимого sandbox. Не оставлять experimental tenants/keys/fixtures как production dataset.

## Состав воспроизводимого сценария

- Pinned release/source commit, config/binding refs и prerequisites.
- Synthetic inputs и expected observable outcomes; secrets хранятся только binding refs.
- Одна команда/процедура setup → run → collect evidence → teardown; её реализация входит в работу, если ещё отсутствует.
- Normal и relevant controlled-failure paths; deterministic clock для timers.
- Evidence: task/run/event IDs, manifest/hash, sanitized log transcript и cleanup/recovery result.
- Fidelity declaration: какой provider эмулирован и какие реальные свойства ещё требует live smoke.
- Limits: bounded retries/runtime/concurrency/storage; free-only provider profile и запрет paid fallback.
- Review: тест проверяет внешний контракт, а не просто вызывает внутреннюю функцию и сравнивает её с собой.

## Итерации: что и как проверяем

| Stage | Что запускаем | Контролируемые сбои/края | Ожидаемый результат |
|---|---|---|---|
| I00 | Fixture repo + isolated snapshots всех participating repos | Intentional lint/schema issue, clean повтор, stale/missing context | Bounded AutoFix/verify и source-pinned map с source refs; нет production merge |
| I01 | Настоящий OpenCode/Runner на existing sandbox VM | Fake engine start failure, child hanging, provider timeout, stop/restart | Observed Run lifecycle, correct scoped logs, no cross-profile access, cleanup |
| I02A | Новый API + внешний test client | Duplicate submit/conflict, reconnect, crash API/worker, late event | Durable receipt/result и replay по sequence, один dispatch owner |
| I02B | Runner files + separate object store + client download | Interrupted multipart, expired URL, hash mismatch, export fail, conflicting version | Manifest и точные bytes клиента; cleanup после export ACK |
| I03 | Новый Web adapter + TG emulator, затем separate test bot | Dedup, batch/media, invalid key, delivery failed, Web reconnect | Полный возврат результата и known profile/channel; old production untouched |
| I04 | Real local MCP fixture + scoped fake domain/remote servers | Startup/handshake/tool timeout, missing binding, effect unknown | Действительный tool invoke и receipt, не только method listed |
| I05 | Router + fixed recipe + actual API user flow | URL quoted vs live research, invalid JSON, auth/budget missing | Template/LLM/OpenCode путь правильный; one continuation owner |
| I06 | Versioned catalog + labelled sanitized corpus | Missing email/login, stale brief/cache, wrong profile, mid-input constraint | Readiness/inputs не выдуманы; measured one-/two-stage comparison |
| I07 | Virtual clock + synthetic CI/events + selected actual playbook | Occurrence duplicates, wait/input, failed gate, cap exhaustion | GTD только opt-in, stable plan/step IDs, no endless control |
| I08 | New Integration Gate + provider API emulator/test binding | Signed callback duplicate, auth expiry, mutation timeout | Profile binding/correlation и outcome reconciliation; no blind effects retry |
| I09 | Registered error readers + incident store + fake report/issue sink | 1000 repeat events, mute expiry/regression, diagnostic self-error | Bounded LLM/OpenCode calls; original user error retained; no self-loop |
| I10 | Staged deployment + two-worker simulation, later existing workers | Drain/failover/late output, rollback, incompatible mapping | No double dispatch; original live tasks stay with old owner; pinned config |

Стадия I00 охватывает все участвующие repos и onboarding новых. Docs-only repo использует profile проверки Markdown/schema/context, а не application build. Общие scripts/config reusable; в repo тонкие settings. AutoFix имеет attempt cap и verify, не автоматические merge/deploy/GTD.

## Sandbox methods и gaps

| Средство | Метод | Construction/проверка |
|---|---|---|
| VM/Runner | Existing sandbox VM + separate experiment namespace | Reproducible setup/teardown, OS/process/resource boundary, two synthetic profiles |
| Free LLM | Fixed response/fault provider + actual free profile smoke | Allowlist/quota, no paid fallback, rate limit/auth/errors. Бесплатность не значит unlimited |
| Cloudflare | Separate Workers/routes и distinct KV/D1/R2 bindings | Setup/recreate/cleanup test resources; не наследовать production bindings |
| Object storage | S3-compatible local test backend и separate cloud bucket smoke | CORS, signed URLs expiry, multipart/resume/abort, checksums/TTL |
| Web | Новый client adapter к new API | Private task view, reconnect/status/artifacts/cancel; никаких existing UI deploy changes |
| Telegram | Update/delivery emulator + separate real test bot | Distinguish fixture success от actual webhook/provider delivery |
| MCP | Local stdio и remote fixture, fake domain handler | Tool readiness/invoke/effect contracts и scoped auth |
| HH/CRM | Provider emulator + sanitized contract sample, safe test account reads | Не обещаем provider sandbox или webhook, если API их не поддерживает |
| Schedules/GTD | Virtual clock + synthetic CI/condition/input | Hour/day waits не требуют реального сна; no default GTD |
| Error Watcher | Registered event stream + storm fixtures | Reader replay, fingerprint/mute/reopen, self-loop guard, fake issue receipt |
| Regions/workers | Two-worker simulation, затем existing RU/EU readiness | Region constraints/fencing; data residency policy отдельно |

Если способ технически реализуем, ставим construction work item, а не ждём магически готовой инфраструктуры. Fake provider позволяет автономный progress, но не заменяет live proof свойств провайдера. Credentials/test accounts и выбранный VM ID привязываются при implementation; значений в docs нет.

Места хранения binding'ов, переменных и токенов — в [Sandbox Bindings и Credentials](SANDBOX-BINDINGS-AND-CREDENTIALS.md). Там же перечень того, что отсутствует и должно быть создано.

## Блокеры полного прохода — проверено на хосте 30.09.2026

Разбор «что помешает выполнить все стадии I00–I10 подряд». Не план и не оценка сроков; перечислено то, что реально мешает начать или довести до конца.

### Внешние действия владельца — без них приёмка не закрывается

1. **Доступ к Google Cloud Storage отсутствует полностью.** Ни в `secrets.env`, ни в `~/.config/gcloud`, ни в token-store нет ни одного GCS-креда. Бакет `trained-assist-workspaces` недоступен, поэтому «перенос профиля в GCS» и cloud-bucket smoke в I02B невыполнимы. Обход, не требующий владельца: локальный S3-совместимый backend для fixture плюс отдельный бакет Cloudflare R2 (токен уже есть) как sandbox-хранилище. GCS остаётся прод-вариантом и требует ровно одного действия — расшарить бакет на существующий VM service account.
2. **Нет отдельного Telegram-бота для sandbox.** Прод-токен бота на sandbox-машину не переносится по решению по #1808 Q-F. Нужен новый бот у владельца.
3. **Нет shell-доступа к RU VM.** Ни с VM1, ни из агентского слота; доступен только браузерный инструмент. Региональная приёмка I10/P30 в текущем виде недоказуема.
4. **Не выделен `LLM_LADDER_TOKEN` для sandbox** и не зафиксирован HH/CRM test-account режим.

### Инфраструктурные блокеры, которые снимаются работой

5. **VM2 не является чистой sandbox-VM.** Ресурсов достаточно (4 CPU, 8 ГБ RAM, 96 ГБ диска), node/git/rsync на месте, но движков `opencode`/`claude`/`codex` нет, а на машине лежит копия реального профиля и `agent-data` с durable-tasks. Это одновременно блокер I01 (P01–P03) и нарушение границы «в sandbox нет private профилей». Рекомендация: объявить VM2 sandbox, очистить до пустого namespace, поставить движок, выдать sandbox-подмножество ключей. Действие обратимо и не затрагивает прод.
6. **Free-LLM нельзя эмулировать внешним сервисом.** Бесплатный уровень OpenCode Zen/Go работает только изнутри клиента opencode, прямой HTTP возвращает `FreeTierError`. Значит «fixed response/fault provider» — наш собственный локальный stub (это construction item, не препятствие), а реальный free-smoke требует установленного движка на sandbox-машине. Детерминированные тесты I00–I04, I07, I09 не должны зависеть от этого пула: лимит там структурный.
7. **В новых репозиториях нет CI и staging.** По решению владельца от 16.09 merge требует зелёных CI и staging на актуальной версии PR. `ai-agent-runner` содержит только README и draft ARCHITECTURE, каталога `.github` нет. Это блокер первой же карточки I01: шаблон проверок готовится вместе с первым PR, а не после него.
8. **Управляющий слой выбран, но не проверен на живом аккаунте.** Пилот `pilots/p-db` рекомендует Cloudflare Workflows + D1 при условии трёх проверок на настоящем аккаунте: продолжение инстанса после kill -9, срабатывание `sleep` и таймаута ожидания, деплой новой версии во время ожидания. Если проверка не проходит — запасной вариант DBOS + Postgres. От этого решения зависят P04–P09, P22, P23 и I10, поэтому решать его нужно на I02A, а не на I07.
9. **Протокола переноса данных нет ни в одном репозитории.** `audits/CODE-BASELINE.md` фиксирует: флаг `GCS_WORKSPACE_SYNC` присутствует, но сам протокол snapshot → run → commit → cleanup в исходниках не найден. Значит «скопировать профиль и запустить агента на другой машине» — это новая работа в control plane, а не настройка флага.

### Риски, а не блокеры

10. **Объём — greenfield шести сервисов при запрете импорта внутренностей старого core.** Runner, API, передача артефактов, Web-адаптер, TG-адаптер, Router, Integration Gate, Error Watcher. Это дублирование с намеренной ценой: новая реализация не знает старых скрытых контрактов. План не является оценкой сроков.
11. **Трекер отложен.** GitHub Project не создан, 33 work item существуют только в документе. Риск потери карточек между сессиями реальный; лечится заведением issues в implementation-репозитории с полями Stage / Depends on / Sandbox / Acceptance evidence, как уже описано в плане.
12. **PR неизменяем, каждая карточка — отдельный PR** с зелёными CI и staging. Это длинный хвост, а не препятствие; но он делает «пройти всё подряд за одну сессию» физически невозможным — нужна постановка по карточкам, а не один большой заход.

## Логи обязательны для каждой итерации

Общий baseline по [Observability contract](OBSERVABILITY-AND-ERROR-CONTRACT.md):

1. Registered source/service/release/environment и schema version.
2. Для user-scoped error — trusted tenant/profile, task/run/operation IDs когда известны; channel/destinationRef при наличии. Для global error — explicit platform scope.
3. Structured error code/outcome/safeSummary; raw details по private ref без secrets/полных signed URLs.
4. Основные lifecycle transitions и sequence/causation; bounded delivery/replay/spool policy.
5. Retention class и TTL: active checkpoint/outbox не удаляется по таймеру; verbose logs не хранятся бессрочно.
6. Positive и intentional failure оставляют читаемый sanitized transcript. Отсутствие нужной записи — failed acceptance даже при хорошем финальном ответе.

| Stage | Специальные logs checks |
|---|---|
| I00 | AutoFix: check/fix before-after, rule ID, tool/version, attempt count, patch/PR refs и residual failure. Context compression: source commit/catalog version, included/omitted paths, byte/token budget и build errors; secrets excluded. Проверить no-change повтор и synthetic failed check. |
| I01 | Run start/exit/cancel/process-tree/heartbeat/recovery, profile/task/run/engine/provider refs, structured errors и cleanup. Intentional failed startup/timeout обязаны оставлять диагностируемую запись. |
| I02A | Request receipt/idempotency/auth scope, dispatch/run state, event sequence/replay, reconnect/cancel и client-visible outcome. Profile/principal сохраняется и без folder; secret/API key не логируется. |
| I02B | artifactId/hash/size/version, upload multipart state/abort, export commit/fail, snapshot conflict и cleanup. Signed URL не пишется целиком; TTL не стирает единственную копию до export ACK. |
| I03 | Ingress request/native message ref, profile/channel/destination, Task correlation, dedup/media preparation, delivery attempts/ACK и Web reconnect. Ошибка в TG/Web fixture прослеживается до scoped result/report. |
| I04 | MCP readiness/handshake/invocation/timeout/cleanup, capability/version/scoped binding и effect receipt. Credential values не логируются; stdio/native details доступны приватным diagnostic ref. |
| I05 | Routing reason/policy/context refs, template/recipe/agent mode, schema outcome/needs_executor, escalation attempt и first useful reply timing. Incorrect fast answer/error проходит scoped error contract. |
| I06 | Catalog/brief version, selected capability/readiness, included schema refs/input insufficiency, eval case ID, one-/two-stage calls, latency и usage. Не сохранять user raw prompt в общий corpus. |
| I07 | Schedule/occurrence dedup, gtdId только opt-in, plan/step/version/control registration reason, wait/deadline/next-step/outcome ACK. Проверить, что simple scheduled success не создаёт GTD events. |
| I08 | Provider operationId/external refs, auth/readiness, callback signature/dedup, normalization/cursor и unknown→reconciled. Profile/task/channel correlation из binding; raw provider payload приватный. |
| I09 | errorEvent/incident/sourceTask/diagnosticTask, fingerprint/count, mute/reopen/expiry, diagnosis attempts/report/issue receipts и self-loop guard. Suppressed events агрегируются с TTL, не исчезают без trace. |
| I10 | Release/config/worker/region/ownerGeneration, promotion/cohort/rollback, fencing/drain/failover и retention health. Smoke evidence коррелирует API/Web/TG task/run IDs; prod/sandbox различимы. |

Каждый work item Z01–Z03/P01–P30 ссылается на свой stage и содержит log acceptance. Done требует transcript/evidence; нельзя ограничиться обещанием «у нас есть console.log».

## Слои проверки и скорость

Contract/fixture checks дешёвые и воспроизводимые. Real engine smoke показывает полный vertical slice. Provider smoke — ограниченные test-account операции с явным outcome. Измеряем их отдельно: passing emulator не называется успешным live provider test.

Промежуточные artifacts и verbose logs имеют TTL. Proposed стартовые сроки из Observability — errors/main events 30 дней, verbose 7; это draft config, не утверждение deployed настройки. Fixture с ускоренным clock проверяет expires/cleanup, не ждёт неделю.

GitHub Project пока отложен; оба документа — рабочий plan/reference. Никакие production Runs, deploy, AutoFix patches или cutover этой документацией не выполняются.

## Проверки связи, диска и финализации — уточнение 30.09.2026

Основание — [ARCHITECTURE §4.6](ARCHITECTURE.md#46-связка-workflow--runner--рабочие-данные), P03/P06/P07/P09/P30 [плана реализации](IMPLEMENTATION-AND-INTEGRATION-PLAN.md).

| Контролируемый сбой | Ожидаемый результат |
|---|---|
| Разорвать связь control plane ↔ VM, оставить engine живым | connection_lost и уведомление; нет автоматического rerun по heartbeat/lease; после reconnect replay без дубля |
| Завершить agent/Runner, сохранить volume | Файлы и manifest доступны; никакого удаления из-за exit |
| Дать явный сигнал перезапуска с дополнительными инструкциями | Сверка и прекращение записей старого процесса; новый runId при прежнем userTaskId, доступ к старым файлам/checkpoints |
| Уронить finalization при загрузке тяжёлого файла | Export возобновляется без engine restart; manifest публикуется после commit; sole copy не удалена |
| Перезапустить VM с persistent volume | Отдельно подтвердить сохранность данных и возможность повторной финализации |
| Уничтожить единственный volume | Явная потеря данных; отсутствие ложного обещания восстановленных артефактов |
| Повторить export/cleanup и ускорить retention clock | Идемпотентность; очистка незавершённой единственной копии блокируется, срок/квота требуют явной политики |

Логи: task/run/generation, workspace/volume refs, состояние связи, сигнал/источник перезапуска, manifest/checkpoints, export progress/commit/error и cleanup decision. Проверки только в отдельном sandbox; живые volume/данные не используются для destructive tests.
