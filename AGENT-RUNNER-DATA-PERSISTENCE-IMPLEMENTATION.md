# Запуск агента с сохранением данных: имплементационная архитектура шагов 1–2

Статус: lifecycle — предложение; постоянный workspace — решение владельца, контракт для реализации · v0.3 · 04.10.2026 (ссылки перенацелены на текущий план: отдельного документа миграции в репозитории больше нет).

Документ детализирует **запуск агента с сохранением данных** в терминах текущего [IMPLEMENTATION-AND-INTEGRATION-PLAN](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) («Актуальный порядок старта»): **шаг 3** — первый интеграционный slice с рестартом и сохранением контекста (P10/P12 + нужные части P02/P05/P06) и **шаг 4** — standalone Runner → API → artifacts (P01–P09). Названия этапов **M2/M3** ниже — из легаси-эпика #1784 (Context Textification, trained-assist-agent), а не из отдельного плана миграции. Основа — [ARCHITECTURE](ARCHITECTURE.md) §4.6 (рабочие данные переживают процесс), §5.1 (runtime state сессии), [EXECUTION-RUNTIME](runtime/EXECUTION-RUNTIME.md), [SERVERLESS-AGENT-API](SERVERLESS-AGENT-API.md).

Ключевая ценность этого документа: **протокол «материаловать → выполнить → сохранить → прибраться» уже построен, проверен в проде и замерен на живой legacy-системе** (trained-assist-agent, M2-контур эпика #1784). Здесь он переносится в целевую модель — с указанием, что брать как есть, что адаптировать и что не копировать. Фактическая выжимка опыта — в [audits/LEGACY-LEARNINGS](audits/LEGACY-LEARNINGS-TRAINED-ASSIST-AGENT-2026-09-30.md).

## 1. Область

**Входит:** протокол данных для запуска агентского Run (clean room), сохранение workspace и runtime state сессии между запусками, чтение (materialize-on-read), целостность и журнал, блокировки, поведение при отказах, маппинг legacy → новые компоненты, чеклист верификации на legacy.

**Не входит:** реализация control plane/Task Store и переключение когорт. Контракт provisioning/import/publish пользовательского workspace описан в разделе «Постоянный пользовательский workspace» ниже; старые открытые вопросы о Git repository этим решением закрыты.

## 2. Что уже построено и проверено (legacy, M2-контур #1784)

Все компоненты ниже **смержены 30.09.2026 и живут в legacy-проде** (проверено 02.10.2026 на `gcp-main`: файлы на месте в релизе), смоук пройден 30.09.2026:

| Компонент | Что делает | Legacy |
|---|---|---|
| Blob-store клиент | gzip-объекты в object storage: `upload/download/exists`, sha256+generation, ADC без ключей на диске, все вызовы с дедлайном; клиент инжектируется (тесты — фейк-бэкенд) | `src/session-blob-store.js` |
| Фаза архивации | dry-run по умолчанию, ledger **до** действия, quarantine (никогда unlink), verify, revert байт-в-байт, профиль-лок → drain → flush перед мутацией | `scripts/profile-migrate/phases/archive-sessions.cjs` + движок #1841 |
| Materialize на чтение | admission-хук **до** резолва сессии: скачивание тела/транскрипта с проверкой sha до записи на диск; аудит всех синхронных читателей вне рана | `src/session-materialize.js` (PR #1933) |
| Post-run sweep | после рана (и quick-answer) отложенно: лок → flush → нет in-flight на ту же сессию → upload+verify+маркер+удаление → легкая уборка; провал загрузки = ничего не удаляем | `src/session-sweep.js` (PR #1942, смержен 30.09 19:01Z) |
| Секреты вне git-образа | действие `EXCLUDE` в clean list: секреты профиля живут только локально, генератор `.gitignore` | #1928 |
| Провижининг доступа | приватный git-репо на профиль в орге + инвайт юзеру по запросу (проверено: создание/push/инвайт) | `scripts/profile-repo.mjs` (#1931) |

**Замеры смоука (профиль-тестовик):** apply 16/16, verify ok=16, между ранами на диске **0 тел сессий** (остались только указатели), materialize из боевого бакета — sha сошёлся, JSON читается, профиль после теста не тронут. Dry-run на самом тяжёлом профиле: 494 файла / 134.9 МБ к архивации, git-worktree корректно отфильтрованы (это отдельная фаза).

## 3. Протокол данных для шагов 1–2

### 3.1 Классы данных и владельцы

| Класс | Где живёт между Run'ами | Владелец | Примечание |
|---|---|---|---|
| Рабочие файлы профиля (projects, contexts, persona, индексы, указатели) | Диск VM, читают обе системы | Профиль, писатель один | Без изменений |
| **Тела разговорных сессий и транскрипты движков** | **Object storage** (после Run), в профиле — только индекс с маркерами `{key, sha256, size}` | Profile/Artifact storage | **Уточнение к разделу переноса данных** (см. 3.2) |
| Runtime state сессии движка (во время Run) | Clean room, свой lifecycle | Agent Runner | ARCH §5.1: получает при старте, отдаёт при завершении |
| Задачи, шаги, ожидания, outbox | Task Store | Control plane | INV-20 |
| Секреты | Legacy: файлы профилий на VM; sandbox: не копируются (план: sandbox не копирует секреты) | Credential Broker (открыт, ARCH §13) | INV-12 |
| Артефакты (крупные файлы) | Object storage, в Task Store — refs + sha | Artifact Storage | ARCH §106 |

### 3.2 Уточнение к разделу переноса данных: где живут тела сессий

Прежняя редакция плана миграции говорила: «Разговорные сессии и привязки чатов — JSON-файлы, TTL 4 ч — не переносим: переключаем в тихое окно». Это верно для **переключения когорт**, но неполно для новой системы: к моменту M5 тела сессий в legacy **уже архивированы в object storage** (M2-контур), на диске остаётся индекс с маркерами. Следствие:

- Импорт в Task Store при переключении идёт по **индексу + объектам storage**, а не по файлам диска.
- Новая система сразу наследует модель «между запусками тел нет», а не переносит их обратно на диск.
- Статус: предложение внести это в текущий план (карточка переноса данных) строкой «Тела сессий/транскрипты — object storage (legacy M2-контур) → Task Store (refs) + storage; индекс — Task Store».

### 3.3 Lifecycle одного Run (целевой, в терминах новой системы)

```
Вход (шлюз → API → Runner)
  1. Runner startAttempt(RunSpec, operationId)          # EXECUTION-RUNTIME API
  2. Проверка владения/аренды: ownerGeneration/fencing   # INV-02, capacity lease
  3. MATERIALIZE (еager, в clean room):
       - workspace snapshot профиля (C05: version + refs)  — файлы VM/снапшот
       - runtime state сессии движка, если Run продолжает сессию:
         тело сессии + транскрипт из object storage,
         проверка sha ДО записи на диск (bytes в temp → verify → rename)
  4. start engine (адаптер: OpenCode по умолчанию)        # ARCH §5.3
  5. ... Run, события (claimed, materialized, started, ...) # contracts
  6. FINALIZING (разделено с исполнением, идемпотентно):   # ARCH §184
       - экспорт результатов в object storage → committed manifest  # INV-09
       - SWEEP (отложенно, не в critical path):
         archive workspace/runtime-данные Run'а → upload → verify sha
         → запись маркера → удаление локальной копии
       - запись статуса/итога в Task Store (финализация ≠ удаление)
  7. cleanup clean room — ТОЛЬКО отдельным подтверждённым переходом  # ARCH §186
```

**Чтение вне Run** (продолжение диалога, `session_search`, история в Web): **materialize-on-demand** — скачать объект, проверить sha, отдать из памяти/буфера; **не оставлять тело на диске** (инвариант legacy: между Run'ами на VM нет тел). Ленивый materialize — дополнение к eager-пути SERVERLESS-AGENT-API §39 («вход материализуется из разрешённых input refs»): оба способа, один контракт.

> **Отклонение от legacy, которое надо принять осознанно:** legacy-контур пишет тело локально при чтении и удаляет при следующем sweep'е. В чистой целевой модели дешевле читать через буфер (без записи), но для native `--resume` движок требует файл на диске → поэтому materialize-on-disk остаётся для транскриптов при старте Run, а для read-only сценариев предпочтителен буфер.

### 3.4 Схема данных (перенято из legacy, проверена)

- Ключи объектов: `profiles/<profileId>/sessions/<sessionId>.json.gz`, `profiles/<profileId>/transcripts/<slug-cwd>/<engineSessionId>.jsonl.gz`. Slug = абсолютный cwd профиля — **стабилен, пока профиль не переезжает между машинами** (для межмашинного переезда — пересоздание slug из profileId, отдельная задача).
- Маркер в индексе/Task Store: `{key, sha256, size, at}` — sha256 **сохранённых байтов** (gzip), это то, что verify/revert обязаны воспроизвести байт-в-байт.
- Ref-формат — как в legacy R2 media: `storage, version, id, sha256, size`, **никогда presigned URL в записях данных** (URL — производный, для выдачи клиенту, с TTL).
- Повторная архивация того же Run перезаписает объект (GCS versioning/R2 versioning — история для отката).

### 3.5 Целостность и журнал

Legacy-принципы, обязательные к переносу:

1. **Запись до действия**: журнал (ledger) — до mutate; краш оставляет данные на месте, verify находит расхождение, а не бесхозную копию.
2. **Никаких необратимых удалений без подтверждённой загрузки**: sha загруженного совпал с локальным → только потом unlink. Провал = данные целы + статус `pending`/`failed`.
3. **Revert байт-в-байт**: выгрузка из storage, sha-сверка, восстановление; конфликт (на месте уже другой контент) — не перезаписывать, решает оператор.
4. **Verify — отдельный проход** по журналу: `ok | pending | recreated | fail`, где `pending` = «обе копии есть, доделает sweep».
5. Журнал в новых терминах: события Journal/Task Store (ARCH), не отдельная JSONL. Retention классами (OBSERVABILITY).

### 3.6 Блокировки и конкурентность

| Legacy (работает) | Целевая модель |
|---|---|
| Профиль-лок (O_EXCL, TTL, stale-detect) передо **всей** мутацией профиля | capacity lease + `ownerGeneration` (INV-02), fencing при записи |
| Drain in-flight ранов по журналу pending | Один владелец профиля в каждый момент (план: писатель один) |
| `flush` буферизованных JSONL **до** снапшота (500, пока буфер не пуст) | Перед snapshot/export — синхронизация append-only буферов; иначе снимок отстаёт (legacy R2 из red-team) |
| Admission: quick-answer тоже под локом | Вход в Task Store транзакционен (DECISIONS: одна транзакционная база) |
| Sweep: skip, если на ту же сессию есть in-flight | Повторный запуск Run при живом владельце запрещён (фейсинг) |

### 3.7 Поведение при отказах (перенесённое из legacy + ARCH)

- **Upload не удался** → файлы на месте, статус `failed`, повтор при следующем событии. Единственная копия никогда не стирается молча (PLAN «Уточнение» §734).
- **Storage недоступна при чтении** → честная ошибка пользователю/оператору, **не** silent-null и не «создать пустую сессию» (legacy-ловушка admission'а — воспроизводится только при отсутствии хука до резолва).
- **connection_lost ≠ failed** (ARCH §181): потеря связи при живом движке — отдельное состояние, без автоперезапуска.
- **Crash в finalizing** → идемпотентный повтор экспорта, engine не перезапускается (P07).
- Числовые лимиты legacy: дедлайн на каждый вызов storage, retry с backoff, abort после N последовательных неудач.

## 4. Маппинг legacy → целевая модель

| Legacy (что есть) | Целевой дом | Вердикт по ARCH §6 |
|---|---|---|
| `session-blob-store.js` (инжектируемый клиент, ключи, sha) | Profile/Artifact storage adapter (C05) | **С правками**: контракт C05 + бэкенды (GCS/R2/local-S3) |
| `session-archive.js` (архивация/маркировка) | Runner: фазы finalizing (§4.6) | **Как есть** (механика), домен — Runner |
| `session-materialize.js` (admission-хук, verify до записи) | Runner: materialize в clean room + read-path API | **Как есть** |
| `session-sweep.js` (пост-рановая отложенная архивация) | Финализация/архиватор (§185) | **Как есть** |
| Фаза `archive-sessions` + движок (ledger/quarantine/revert) | Инструмент миграции M4 импортёр + runtime-journal проверок | **С правками**: журнал → события Journal |
| Профиль-лок + drain + flush | capacity lease + generation + синхронизация буферов | **Заменяем** на целевые примитивы (INV-02) |
| `credential-store.js` (AES-GCM, грейс без ключа) | Credential Broker (C06/C07) | **С правками**: размещение открыто |
| EXCLUDE-секреты + генератор `.gitignore` | Правила образа workspace для clean room | **Как есть** |
| Провижининг git-репо на профиль (`profile-repo.mjs`) | Постоянный workspace: ensure + versioned publish (решение 04.10 ниже) | **С правками**, интеграция не подтверждена |
| native resume по слагу cwd | Engine adapter contract (перенос slug при переезде) | **С правками** |
| `opencode.db` (SQLite, класс SYSTEM) | Runtime state / журнал — **не переносить как есть** (9+ ГБ на legacy) | **Заменяем**: журнал сессий по контракту OBSERVABILITY |

## 5. Backend хранения: как выбрать

- **Что проверено в legacy:** GCS (`trained-assist-workspaces`, versioning on) — ADC через metadata-сервер VM, `storage.objectAdmin` у сервис-аккаунта, объекты/smoke прошли. Доступ с legacy VM — факт.
- **Что принято как цель:** Artifact Storage на R2 (ARCH §83, media-pipeline в проде на R2), Presigned URLs — выдача клиенту.
- **Что есть в песочнице нового репо:** GCS-кредов нет (песочница без GCS-кредов, см. [SANDBOX](SANDBOX.md)) → обход: локальный S3-совместимый backend + отдельный бакет R2.

**Предложение (статус: Предложено):** один storage-контракт (C05: put/get/head, sha256, generation, versioning), три реализации: `gcs` (legacy-прод), `r2` (песочница и цель), `s3-local` (sandbox). Инжекция клиента — как в legacy (`createBlobStore({backend})`), тесты всегда на фейке. Backend выбирается переменной окружения среды, не кодом.

## 6. План работ по шагам 1–2 (подзадачи с приёмкой)

Привязка: текущий план, шаги 3–4 и карточки P01–P09 (этапы M2/M3 — легаси-эпик #1784). Где живёт код: `ai-agent-runner` (Runner), `trained-assist-control-plane` (контракты/Task Store), этот репо — текстовые контракты.

| # | Подзадача | Карточки | Приёмка (evidence) |
|---|---|---|---|
| **D1** | Storage contract v1 текстом + машинная схема: ref/marker/manifest, sha, generation, no-presigned-in-records, retention-классы | C05, P07 | Схема смержена; два бэкенда (R2/local-S3) проходят общий конформити-тест |
| **D2** | Runner lifecycle: materialize до start, sweep в finalizing, cleanup отдельным переходом; события `materialized/exported/swept` в потоке | P02, P06, P07, §4.6 | Прогон: файлы после Run в storage, локально только refs; kill в финализации → повтор не дублирует экспорт |
| **D3** | Runtime state сессии: индекс сессии в Task Store (refs), тела в storage, materialize-on-read для продолжения диалога; **сквозной сценарий: 5 реплик с рестартом исполнителя между 3-м и 4-м** | P05, P06, P12, ARCH §5.1 | Рестарт между репликами: продолжение видит все 5 (не lossy-fallback); тел на диске между Run'ами нет |
| **D4** | Журнал целостности + reconcile: запись до действия, verify, revert, статусы ok/pending/fail | P03, P07, INV-09/13 | Контролируемые сбои [SANDBOX](SANDBOX.md) (kill, обрыв выгрузки, потеря volume): данные либо целы, либо явная потеря с записью |
| **D5** | Секреты в Run: по binding профиля, без копий в clean room после завершения; отсутствующий секрет → readiness error | P01, P03, INV-12 | Sandbox-прогон: после Run в workspace нет credential-файлов; missing secret = ошибка старта |
| **D6** | Референс-инструмент миграции: legacy-фазы (dry-run → apply → verify → revert) как образец для импортёра M4 | M4, P29 | Пробный импорт на копии профиля: идемпотентно, с журналом перенесённого |

Порядок: D1 → D2/D5 параллельно → D3 (зависит от D1+D2) → D4 → D6. D3 даёт первый интеграционный slice (5 реплик), D4/D6 закрывают evidence-требования M2/M4.

## 7. Что проверить на legacy (чеклист уверенности)

**Уже проверено 30.09.2026:**
- [x] Запись в object storage с VM (ADC, права `storage.objectAdmin`).
- [x] Фаза: dry-run → apply → verify → revert-контракт на тестовом профиле (16/16, ok=16).
- [x] Materialize: sha/gunzip/чтение, профиль не загрязняется.
- [x] Между Run'ами тел на диске нет (индекс с маркерами, указатели — на месте).
- [x] EXCLUDE: секреты не попадают в git-образ (класс виден в dry-run).
- [x] Провижининг: создание приватного репо, push, инвайт collaborator'ом.

**Осталось (блокирует только перенос кода, не дизайн):**
- [ ] Post-run sweep в проде: PR-D в CI (legacy #1942) → после мержа — что quick-answer и обычный Run убирают тела автоматически.
- [ ] Реальный диалоговый resume после архивации через API (не node-уровнем) — проверить на тестовом профиле.
- [ ] Массовая миграция тяжёлых профилей (dry-run product-owner готов: 494/134.9 МБ) — по решению владельца.
- [ ] Поведение `opencode.db` (9+ ГБ, класс SYSTEM) — не архивируется, чистка отдельной задачей.
- [ ] Пустой/недоступный бакет из песочницы новой системы (нет GCS-кредов — см. песочницу): поднять local-S3/R2 и прогнать D1-конформити.

## 8. Открытые вопросы

1. **GCS или R2 как основной backend** для workspace/session-данный (§5) — предложение: контракт один, бэкенд по среде; residency RU/EU (ARCH §13) может заблокировать отдельные когорты.
2. **Тела сессий → Task Store или storage?** Предложение: storage + refs в Task Store (тела большие, поисковые сценарии — отдельный индекс).
3. **Git-репо на профиль:** принято 04.10 как постоянное рабочее состояние; методы и приёмка — в разделе ниже. Legacy evidence не доказывает новую интеграцию.
4. **Slug cwd** — при переезде профиля между машинами пересоздаётся из profileId; порядок фиксации — с D3.
5. Уточнение §3.2 (где живут тела сессий) — внести в карточку переноса данных; отдельного документа миграции в репозитории нет.

## Постоянный пользовательский workspace — контракт методов, 04.10.2026

Решение владельца: профиль имеет связанный приватный Git repository. Тексты, структура папок и manifest ссылок хранятся в Git; тяжёлые артефакты — в долговечном object storage; credentials — в Broker. Это рабочее состояние между Run, а не только архив или репозиторий инженерной задачи. Логи и engine resume state имеют отдельные контракты.

### Ownership и параллельная разработка

Profile Workspace service/module владеет provisioning, binding, версиями, публикацией и конфликтами. Runner материализует выданный snapshot, выполняет engine, сохраняет разрешённый manifest изменений и вызывает публикацию; control plane хранит связь задачи/Run с результатом публикации. Модуль сначала независимо разрабатывается в новом ai-agent-runner в отдельной директории и ветке с инжектируемыми Git/object-store/binding ports; он не импортирует legacy internals. Его методы доступны host API и scoped tools; орговый credential создания repository не передаётся агенту.

Второй агент может реализовать модуль и тесты, не меняя lifecycle Runner, общий RunSpec, workflow или production. Первый агент владеет интеграцией и сквозной приёмкой. Отдельный repository сервиса не является обязательным условием; выделение возможно по независимому deployment lifecycle. Методы ниже — спецификация, не заявление об их реализации.

### Методы

| Метод | Назначение и результат |
|---|---|
| `ensure_profile_repository` | После создания профиля идемпотентно создать/проверить private repo, связать его с tenant/profile; вернуть bindingId, repository, headRevision и readiness. Ошибка provisioning видна и повторяется независимо от регистрации пользователя. Коллизия имени или чужой существующий repo не принимаются автоматически. |
| `provision_existing_profile_repositories` | Возобновляемая административная batch-операция: inventory → dry-run → ensure → import → verify; cursor, operationId и результат каждого профиля. Создание repo не означает импорт файлов. Существующая Git history сохраняется. |
| `prepare_profile_workspace` | Получить разрешённые пути профиля/проекта на конкретном commit: workspaceSnapshotId, baseRevision, manifest, durable artifact refs. Runner materialize использует этот manifest; агент не выбирает чужой binding. |
| `sync_profile_workspace` | Явная host-команда «синхронизировать»: direction pull/publish, baseRevision и manifest для publish. Pull не затирает грязный workspace: возвращает local_changes/conflict либо подготавливает новый snapshot. Publish использует тот же протокол, что publish_run_changes. Нет неявного двустороннего last-writer-wins. |
| `publish_run_changes` | После Run сохранить разрешённые добавления, изменения и удаления относительно baseRevision; вернуть publicationId, status и committedRevision либо conflictId/pendingReason. Это сохранение состояния, не archive и не cleanup. |
| `get_workspace_publication` | Читать durable состояние публикации после timeout/restart по publicationId/operationId, не повторять engine. |
| `resolve_workspace_conflict` | По conflictId подготовить детерминированный или агентский merge candidate; фиксировать base/run/current revisions, resolver Run и evidence. Возвращает candidateId либо awaiting_user_input/unresolved. Сам вызов не даёт агенту произвольное право push. |
| `publish_workspace_resolution` | Проверить candidate, пути, права и artifacts; опубликовать с expectedHeadRevision. Если head вновь изменился — новый merge/conflict, без force push. Результат читается через get_workspace_publication. |

### Общий контракт и IDs

Host выводит tenantId/profileId и права из авторизованной identity. Общие поля: operationId (идемпотентность), bindingId; для Run — userTaskId/runId/ownerGeneration, workspaceSnapshotId и baseRevision. Сохранение добавляет publicationId, конфликт — conflictId, решение — candidateId и resolverRunId. Git commit SHA — версия состояния, не Run ID.

Один operationId с тем же содержимым возвращает тот же результат; другой payload под тем же ключом — ошибка. Durable журнал операции хранит hash manifest и commit metadata до внешнего вызова; неизвестный исход push сначала сверяется с Git/binding journal, а не вызывает новый engine или безусловный повтор. Generation защищает от устаревшего execution owner, а baseRevision — от конкурирующих изменений; это разные проверки. Pending после engine exit обрабатывает host finalizer, а не уже завершённый engine.

### Публикация и конфликт

1. Сформировать manifest только разрешённых путей: additions/updates/deletions и исходные hashes. Secrets, .git, runtime config, HOME и произвольные symlinks не экспортируются.
2. Upload тяжёлых объектов с owner/checksum/size verification; Git manifest не указывает на неподтверждённые bytes.
3. Сохранить durable Run candidate, достаточный для восстановления публикации. Получить текущий head.
4. Если head = baseRevision, применить изменения и publish с compare-and-swap. Иначе выполнить three-way merge: base, Run candidate, current head. Непересекающиеся правки автоматически объединяются; edit/delete, rename и ссылки на бинарные artifacts проверяются явно.
5. Git ref обновляется только при expectedHeadRevision; конкурентная публикация приводит к повторному вычислению merge с ограниченным числом попыток. Нет глобального замка на весь Run профиля и нет force push.
6. При конфликте сохранить все три состояния и conflictId. Детерминированное слияние — первым; ограниченный отдельный resolver Agent Run — только по принятой политике. Он получает относящиеся к конфликту данные и права, не запускает рекурсивный GTD/AutoFix и не меняет production. Семантические/неоднозначные правки переводятся в Awaiting user input. Конфликтный proposal не становится каноническим до publish_workspace_resolution.
7. Статусы publication: pending, publishing, published, conflict, awaiting_user_input, failed. Engine status хранится отдельно: успешный engine не означает успешную публикацию.
8. Cleanup разрешён после verified durable recovery copy всего необходимого. При pending/conflict локальный workspace можно удалить только когда candidate, artifacts и journal переживут его удаление; иначе sole copy сохраняется. При conflict следующий Run получает canonical head, а не непубликованные правки; продолжение conflict candidate допускается только по явному binding.

### Sandbox и приёмка отдельного модуля

Использовать synthetic profiles, disposable Git repositories и mock failures; затем private test repo с настоящим Git API. Проверить идемпотентный ensure и batch resume; импорт без credentials с сохранением дерева и hashes; Run A publish → новый Run B materialize на другой директории/VM; binary artifact download; чужой profile denied; два Run с общей base (непересекающиеся edits и same-file conflict); edit/delete; повторная смена head во время resolution; crash до/после push; timeout с неизвестным исходом; storage failure и sole-copy guard; stale owner; resolver failure и Awaiting user input без циклов. Логи методов содержат IDs, stage/status/error и TTL по Observability, без содержимого секретов.

Legacy script profile-repo.mjs — reference для ensure/invite; его существование не доказывает saveback. Runner #69 materialize и #52 lifecycle — готовые building blocks, не свидетельство автоматического постоянного profile binding. Массовый импорт legacy использует копию/проверку; финальный cutover согласуется с единственным писателем legacy, чтобы не потерять изменения между inventory и переключением.
