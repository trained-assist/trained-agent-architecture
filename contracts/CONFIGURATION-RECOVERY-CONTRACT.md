# Контракт конфигурации и восстановления

Статус: **предложение W00** в рамках [#246](https://github.com/trained-assist/trained-agent-architecture/issues/246). Этот документ не меняет runtime, secrets, Cloudflare resources или маршрутизацию. Он задаёт проверяемую форму для последующих реализаций и для сценария bootstrap [#231](https://github.com/trained-assist/trained-agent-architecture/issues/231).

## Цель и границы

Каждый развёртываемый компонент (включая standalone Agent Runner API) должен быть возможно поднять, остановить, сверить и восстановить без неявного знания из исходного кода, панели провайдера или памяти оператора.

Контракт относится к configuration, ресурсам, ключам и durable state. Он не назначает новый secret manager, IAM-сервис или control plane. Внешние зависимости Runner остаются адаптерами на границе: core Runner не зависит от CP, Telegram, GTD, профиля, Communication Skills или test MCP.

## Классификация входов и состояния

Каждое значение, binding и ресурс должны быть занесены в inventory с одним классом и владельцем.

| Класс | Смысл | Допустимое размещение |
|---|---|---|
| Invariant | Константа протокола, одинаковая во всех окружениях | versioned source/schema |
| Default | Изменяемое значение по умолчанию | versioned config с явным override |
| Environment policy | Регион, placement, лимиты, capability profile | versioned environment manifest |
| Private config | Несекретный параметр конкретного окружения | manifest или provider config, отражённый в inventory |
| Generated resource | ID Worker, D1, KV, R2, DO, queue, cron или external binding | provisioning record; не подбирается по имени |
| Secret | Значение, которое нельзя помещать в manifest, лог или артефакт | secret source с logical ID и version/fingerprint |
| Durable state | Данные задачи, журнал, артефакты, ciphertext, очередь | ресурс с backup/restore policy |
| Fixture | Тестовый вход, fake worker, synthetic ciphertext | versioned test fixture, отделённый от live state |
| Obsolete | Удаляемая конфигурация или ресурс | migration/tombstone record до уничтожения |

Значение не может одновременно быть `generated resource` и «неявным дефолтом». Если код включает поведение без manifest-поля, inventory фиксирует это как `implicit` до переноса в один из классов выше.

## Три связанных, но разных реестра

Реализация хранит три versioned артефакта. Они могут находиться в одном репозитории, но не заменяют друг друга.

1. **Configuration schema**: logical name, type, default, `requiredWhen`, допустимые значения, владелец, способ применения (`hot-reload`, `restart`, `new-run-only`) и безопасное описание.
2. **Environment manifest**: `environmentId`, release/config revision, capability profiles, placement policy, logical resource names, provider references, limits и разрешённые integrations. В нём нет secret values.
3. **Provisioning record**: фактически созданные resource IDs, revision, checkpoints, pending operation, секретные версии или fingerprints без значений, backup reference и время последней сверки.

Logical name стабилен между окружениями; provider resource ID стабилен внутри окружения. Код не выбирает «первый подходящий» Worker, namespace, database, bucket, secret или аккаунт.

### Secret manifest

Для каждого logical secret ID указываются: `kind`, owner, `requiredWhen`, consumers/targets, source reference, способ появления (`generate`, `derive`, `import`, `reissue`), key/ciphertext version, probe, restore class и ссылка на backup/rotation record. Значение секрета, ciphertext и токен не попадают в Git, CI output, provisioning record или diagnostics.

| Restore class | Правило |
|---|---|
| `regenerate-empty-only` | Можно создать заново только для нового пустого `environmentId` |
| `rotate-as-pair` | Меняется согласованно с зависимым consumer/provider binding |
| `restore-exact-version` | Восстанавливается та же версия вместе с нужным ciphertext/state |
| `import-or-reissue` | Нужен внешний issuer и явный новый binding |

Создание нового ключа не считается восстановлением, если существующие данные требуют прежний ключ для расшифровки или проверки.

## Пять операций жизненного цикла

Каждая операция имеет `operationId`, actor, target `environmentId`, input manifest revision, checkpoints, evidence и terminal status. Команды и UI не маскируют одну операцию под другую.

| Операция | Разрешённое действие | Запрет / обязательное условие |
|---|---|---|
| `fresh` | Создать новый пустой environment и его ресурсы | Новый `environmentId`; не присваивает себе старые durable IDs |
| `reconcile` | Сверить manifest и provisioning record с provider; восстановить управление теми же IDs | Не создаёт замену пустого D1/DO/KV/R2/queue вместо существующего state |
| `restart` | Перезапустить runtime с теми же state, key version и config revision | Не генерирует ключи, не сбрасывает очередь и не применяет новый config как часть restart |
| `restore` | Восстановить заранее указанную версию backup/state в явно указанную цель | Нужны проверенный backup, совместимые key/ciphertext versions и recorded evidence |
| `destroy` / `reset` | Уничтожить или очистить disposable environment | Явная отдельная операция после reconcile; persistent target требует утверждённого retention/backup policy |

`fresh`, `reconcile`, `restart`, `restore` и `destroy/reset` должны быть отдельно доступны в automation и отдельными тест-кейсами. Timeout операции переходит в `unknown`, затем требует reconciliation; он сам по себе не разрешает повтор с созданием новых ресурсов.

Это не пять последовательных шагов обычного запуска. Обычно среда проходит `fresh` один раз, затем `reconcile` перед изменениями и `restart` при обновлении runtime; `restore` и `destroy/reset` — отдельные исключительные операции. Один запуск automation объявляет ровно один lifecycle mode.

## Конфигурация, запуск и readiness

Accepted run получает pinned `configRevision`, `manifestRevision`, capability profile и resource binding set. Последующий deploy конфигурации не переназначает уже принятый run. В каждом статусе run можно увидеть эти версии без раскрытия secrets.

Liveness (`process отвечает`) не равен готовности принять работу. Readiness строится в следующем порядке:

1. schema и manifest валидны;
2. все required logical resources разрешены в конкретные provider IDs;
3. bindings доступны и соответствуют capability profile;
4. secret references разрешены, а их безопасные probes успешны;
5. durable state и backup metadata читаемы;
6. runtime имеет lease/fencing и может записать owner-issued receipt;
7. admission включается только после этих evidence.

Для `azure-cloud` capability profile должен быть явным в manifest; его добавление не изменяет France/default placement policy.

## Приём, неизвестный исход и результаты

Retry распространяется на три разные операции: повтор доставки клиентского запроса до durable admission receipt, повтор внутренней доставки между владельцами и повтор фактического execution attempt. Они используют разные idempotency keys и не сводятся к одному `retry`.

После `unknown_run` нельзя ставить execution attempt в очередь повторно только из-за неизвестного исхода. Новый attempt возможен лишь после авторитетного pre-admission refusal либо подтверждённых stop/fencing и reconciliation, которые исключают параллельное выполнение первого attempt. Состояние очереди не является таким доказательством.

`unknown` — не бесконечное ожидание: для него публикуются owner, deadline/SLO, последний проверенный receipt и следующая reconcile action. По истечении SLO владелец либо получает stop/fencing evidence и принимает решение о новом attempt, либо эскалирует incident с сохранённым состоянием.

Receipt разделяет по меньшей мере следующие факты: `accepted`, `started`, `execution-completed`, `result-persisted`, `validators-accepted`, `delivery-accepted`, `delivered`. Существование artifact, cleanup workspace или смена owner не доказывает persistence или acceptance. Каждый переход записывает receipt владельца с correlation к run/attempt/operation.

## Проверки и evidence

CI проверяет schema и manifests статически до deploy: уникальность logical names, все `requiredWhen`, отсутствие secret values, declared consumers, restore class, provider binding shape, capability profile и отсутствие неразрешённых implicit config reads. Проверка не требует доступа к live secret values.

Локальные/CI fixtures обязаны покрывать: fresh bootstrap, reconcile существующих IDs, restart с тем же state, synthetic key/ciphertext restore, unavailable binding, fake-worker crash после admission, unknown outcome без unsafe execution retry и cleanup только после `result-persisted` receipt.

Live sandbox drill запускается только в отдельном declared sandbox и оставляет evidence: environmentId, operationId, pinned revisions, resource IDs/fingerprints, status transitions, backup/restore verification и reset result. Он не использует sandbox текущего сквозного E2E. Границы разрешений и безопасный путь проверки документируются по [Environment Contract Template](ENVIRONMENT-CONTRACT-TEMPLATE.md).

### Как выбрать свободную sandbox-линию

Наличие Worker, успешный `/health` или запущенный `wrangler tail` не доказывают, что линия свободна: tail может читать только historical/diagnostic traffic, а downstream может быть общим. Перед live drill владелец сценария записывает в manifest или runbook полную цепочку `entrypoint → control plane → runner → execution worker`, человека/сессию-владельца, разрешённую нагрузку, reset owner и статус occupancy.

Выбор выполняется так:

1. Сопоставить внешний entrypoint с declared Worker и его service bindings; bot username сам по себе не достаточен.
2. Проверить health/readiness каждого звена и nonterminal runs/intake state в соответствующем owner store.
3. Сверить с владельцем текущего E2E, какая линия занята. При конфликте его подтверждение имеет приоритет над косвенными сигналами.
4. Записать в evidence выбранные `environmentId`, entrypoint, chain, время начала и reset owner.
5. После terminal outcome выполнить только объявленный reset и сохранить результат сверки.

Пример текущего раздельного назначения: `@probability_cat_bot` использует `trained-assist-tg-ux-sandbox → trained-assist-cp-telegram-ux-v1-sandbox → trained-assist-runner-api-telegram-ux-v1-sandbox`; текущий основной E2E закреплён за `@ptichka_status_bot`. Это пример inventory, а не универсальное правило о свободности bot username.

## Порядок внедрения

1. Составить inventory по каждому сервису и отметить `implicit` значения с owning issue.
2. Ввести schema, manifests и provisioning record в режиме read-only проверки.
3. Добавить локальные synthetic recovery и fake-worker fault fixtures.
4. После завершения текущего E2E выполнить disposable live drill в выделенном sandbox.
5. Включать reconcile/restore automation только после доказательства сохранения state и повторяемости evidence.

Сценарий изменения поведения проходит через [Scenario Change Management](../SCENARIO-CHANGE-MANAGEMENT.md); bootstrap scenario остаётся в [#231](https://github.com/trained-assist/trained-agent-architecture/issues/231) и его draft PR [#232](https://github.com/trained-assist/trained-agent-architecture/pull/232).
