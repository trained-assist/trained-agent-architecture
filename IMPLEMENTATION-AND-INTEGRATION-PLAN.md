# План реализации и интеграции Trained Assist

Draft v0.3 · 30.09.2026. Это рабочий документ implementation/integration; GitHub Project отложен по решению владельца. Это не runtime GTD/checklist. Сейчас планирование; VM, агенты, миграции и production переключения не запускаются.

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

Стадия 0: AutoFix + сжатие context всех репозиториев + обязательный observability baseline. Далее порядок владельца сохранён: existing VM → external Agent API → folder/artifacts → Web/TG → MCP → fast replies → compact capability brief → optional GTD/playbooks. Добавлены Gate/Watcher и promotion как последующие самостоятельные этапы.

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

Факт текущего inventory: ai-agent-runner содержит только README и draft ARCHITECTURE, отдельная реализация не готова. Plan не предполагает готовые API/clean room только потому, что они описаны.

## Структура плана и будущего Project

Предлагаемый organization project: **Trained Assist — Implementation / Sandbox First**.

- Work items Z01–Z03 и P01–P30; будущий Project может представить их draft items. Issue в implementation repo создаётся/привязывается при выборе задачи в работу, без преждевременного потока 33 issues.
- Status: Draft, Ready, In progress, Verification, Blocked, Done. Done требует acceptance evidence.
- Поля: Stage (Ixx), Component/target repo, Depends on, Sandbox, Acceptance evidence, Architecture links, Risk, Decision needed.
- Views: Iteration board; dependency table; sandbox gaps; acceptance/review; later rollout.
- Stage — milestone grouping. Календарные sprint dates/estimates не выдумываем до первого measured cycle.
- Начальный Ready только Z01; остальные Draft. P02/P03 становятся Ready по готовности environment/setup contract. Это release readiness, не runtime gtdState.
- GitHub Project не источник Run/task state; execution receipts/logs остаются в платформе.

Draft items могут иметь title/body/custom fields; Project API и draft items описаны в [GitHub Projects documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects). GitHub Project отложен: текущий рабочий план — этот документ и Sandbox Plan. Draft IDs Z01–Z03/P01–P30 сохраняются, чтобы позже перенести план без перенумерации.

## Итерации и зависимости

| Stage | Результат | Зависимости |
|---|---|---|
| I00 | AutoFix, context compression и logs baseline для всех repo | Нет; перечислить participating repos |
| I01 | Agent Runner на существующей sandbox VM | I00 accepted; VM существует по сообщению владельца |
| I02A | Внешний Serverless Agent API | I01 accepted |
| I02B | Артефакты и пользовательский workspace через API | I02A; object-store sandbox |
| I03 | Web и Telegram на том же API | I02B; sandbox Workers/bindings и channel fixtures |
| I04 | MCP и доменные capabilities | I03; первые fake domain adapters |
| I05 | Первый надёжный fast path | I04; старт corpus collection с I01 |
| I06 | Компактный capability catalog и глубокая проверка быстрых ответов | I05; P18 baseline |
| I07 | Расписание, планы и выборочный GTD | I06; durable task state и MCP artifact bindings |
| I08 | External Integration Gate | I04 базовый handler; MVP может идти параллельно I05–I07 |
| I09 | Error Watcher | I01 error contract, I05/I06 diagnosis routing; не блокирует первые API Runs |
| I10 | Promotion, совместимость и RU/EU | Accepted core path I01–I07; подключённые Gate/Watcher пилоты когда готовы |

Card-level зависимости имеют приоритет над milestone порядком: P18 corpus collection начинается сразу после P03/P12; P27 aggregation можно готовить раньше I09, diagnosis P28 ждёт fast-path contracts. I08 может идти после I04 параллельно быстрому ответу. I09 использует уже накопленные errors, но не является блокером первых Runs. I10 — promotion gate, не обещание полного релиза до всех незакрытых требований.

## Общая приёмка каждой карточки

- Positive и controlled failure sandbox сценарий, no unbounded retries.
- Trusted profile/Task/Run correlation, channel/destinationRef когда известны; platform errors явно scoped.
- Structured errors + главные lifecycle events + TTL policy.
- Test fixture воспроизводима из setup manifest, доступные live smokes отмечены отдельно.
- PR/commit version, test transcript, result/artifact IDs и release/config refs доступны review.
- Обратная доставка результата и restart/replay проверены, когда затронуты.
- Точный scope changes; rollback/compatibility при замене старого пути.

## Sandbox и требования к логам

Конкретные окружения, значение test fixture, принудительные сбои и logging acceptance каждой итерации вынесены в [Sandbox Plan](SANDBOX-PLAN.md). Каждая карточка ниже сохраняет свой обязательный logging gate. Нельзя объявить её Done только по успешному ответу агента.

## Scope границ репозиториев

Runner/API/artifact adapters — ai-agent-runner; reusable storage contract по общей архитектуре.
Web/TG — существующие gateways. Task Router — выбранный отдельный repo, имя пока предложение.
MCP/domain methods — domain repos, тонкие platform facade/adapters.
GTD/task queues — границы выбраны, конкретные repos/package extraction требуют решения при P12/P23.
Integration Gate и Error Watcher — самостоятельные repos после создания владельцем либо отдельно авторизованной provisioning задачи.
Ни одна карточка не требует предварительно создать repo для каждого логического прямоугольника.

## Implementation work items

### I00 — AutoFix, сжатие контекста и observability baseline для всех репозиториев

Цель: одинаковый быстрый вход агента в каждый implementation repo, короткая диагностика и воспроизводимые проверки до начала Runner.
Зависимости: нет. Применение ко всем текущим участвующим repo и шаблон для новых; тяжёлая инфраструктура не требуется repo с одними docs.

**Logs acceptance (I00):** AutoFix: check/fix before-after, rule ID, tool/version, attempt count, patch/PR refs и residual failure. Context compression: source commit/catalog version, included/omitted paths, byte/token budget и build errors; secrets excluded. Проверить no-change повтор и synthetic failed check. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

Трактовка «сжатия»: compact repository map + task-relevant context bundle/brief с refs; исходный код не удаляется. Название/продукт автофиксера пока не задан, используем configurable AutoFix contract.

#### Z01 — Inventory и общий development baseline

Planning readiness: Ready · Stage: I00
Component/target repo: все participating trained-assist repositories; reusable engineering tooling
Depends on: Нет
Sandbox: isolated checkout + fixture repo с намеренно внесёнными ошибками.

Работа: inventory repo types/check entrypoints и current auto-fix tooling; для каждого профиля check/fix/verify, context-build и log contract. Docs-only profile не получает бессмысленный application build. Общая reusable конфигурация/скрипты живут в engineering tooling, repo хранит тонкий config.

Acceptance: таблица coverage по всем участвующим repo, onboarding нового repo, воспроизводимый setup. Missing methods имеют construction tasks; значения credentials не попадают в inventory.

Logs acceptance: I00 baseline; source/profile/request correlation, AutoFix check/attempt/patch refs либо context version/manifest/size; controlled failure, no-change repeat и retention evidence обязательны.

#### Z02 — Bounded AutoFix workflow

Planning readiness: Draft · Stage: I00
Component/target repo: engineering tooling + тонкие CI/config adapters всех repo
Depends on: Z01
Sandbox: fixture repo + separate test branch/PR, fake CI failures.

Работа: deterministic formatter/linter/schema corrections первыми; разрешённый LLM/OpenCode fix как bounded fallback там, где нужен. Small patch, repeat verify, отчёт unchanged/fixed/needs-human. Без самостоятельного merge/deploy и recursive GTD.

Acceptance: намеренная ошибка исправлена, повторный fix не меняет чистый repo, неподдержанная ошибка останавливается по cap. Rule ID/check output и patch evidence видны; бесплатный profile fallback не снимает limits.

Logs acceptance: I00 baseline; source/profile/request correlation, AutoFix check/attempt/patch refs либо context version/manifest/size; controlled failure, no-change repeat и retention evidence обязательны.

#### Z03 — Repository context compression и logs baseline

Planning readiness: Draft · Stage: I00
Component/target repo: reusable context builder + все repo profiles
Depends on: Z01, Z02
Sandbox: fixture repos и isolated reads текущих repo.

Работа: compact map (entrypoints/contracts/dependencies/check commands), filtered task bundle, refs к полным источникам, source commit/version и invalidation. Включить error/lifecycle registration, safeSummary/private details, scope/correlation и configurable TTL; log fixture для любого нового module/iteration.

Acceptance: map не теряет критичные constraints, fixture показывает missing/stale context, secrets/generated/native bulky logs excluded. После source change builder не отдаёт старый bundle как свежий. Каждый repo profile проходит intentional failure с читаемым error event. Agent может раскрыть original source ref.



### I01 — Agent Runner на существующей sandbox VM

Цель: Запустить OpenCode без старого core/frontend/GTD и получить полный наблюдаемый lifecycle.
Зависимости: I00 accepted; VM существует по сообщению владельца.

**Logs acceptance (I01):** Run start/exit/cancel/process-tree/heartbeat/recovery, profile/task/run/engine/provider refs, structured errors и cleanup. Intentional failed startup/timeout обязаны оставлять диагностируемую запись. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P01 — Воспроизводимый sandbox Runner

Planning readiness: Draft · Stage: I01
Component/target repo: ai-agent-runner/setup
Depends on: Z03
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Зафиксировать setup/config manifest, отдельные workspace/credentials/log roots и teardown. VM сейчас sandbox; reuse как production только после clean reprovision и smoke, с новым отдельным sandbox.

Acceptance: Повторный setup не ломает окружение; teardown удаляет только experiment namespace; сохранены release/config refs.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P02 — OpenCode Run и structured logs

Planning readiness: Draft · Stage: I01
Component/target repo: ai-agent-runner/engine
Depends on: P01
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Fake engine adapter для lifecycle + реальный OpenCode через бесплатный provider profile/LLM Ladder. RunSpec, start/exit, limits, cancel process tree, profile/task/run correlation; без GTD.

Acceptance: Успех, nonzero exit, startup/auth failure, timeout, cancel и child cleanup имеют typed outcome и логи. Два test principals не читают чужие workspace.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P03 — Fault injection и error source registry

Planning readiness: Draft · Stage: I01
Component/target repo: Runner + model gateway fixtures
Depends on: P02
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Контролируемые rate limit, invalid output, provider unavailable, kill/restart, log sink outage. Live free-provider smoke отдельно от детерминированных проверок.

Acceptance: Каждый failure воспроизводим; logging failure bounded; scope/replyContext и TTL cleanup проверяются. Автоматический paid fallback выключен.

Уточнение владельца 30.09.2026: Сетевой partition при продолжающем работать engine: connection_lost/report, отсутствие автоматического нового Run; выход процесса не удаляет volume. Отдельно моделировать потерю самого диска.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I02A — Внешний Serverless Agent API

Цель: Тестовый внешний клиент запускает, наблюдает и останавливает агента по API.
Зависимости: I01 accepted.

**Logs acceptance (I02A):** Request receipt/idempotency/auth scope, dispatch/run state, event sequence/replay, reconnect/cancel и client-visible outcome. Profile/principal сохраняется и без folder; secret/API key не логируется. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P04 — Admission и durable receipt

Planning readiness: Draft · Stage: I02A
Component/target repo: Runner/API admission
Depends on: P03
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: API keys/test principals, scope/engine/region/quota, idempotency, минимальный durable request/result store. Typed ai-agent-job прямо к Runner adapter, без полного Task Router/GTD.

Acceptance: Duplicate submit возвращает тот же receipt; несовместимый payload conflict; unauthorized principal не запускает Run.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P05 — Status и replayable streaming

Planning readiness: Draft · Stage: I02A
Component/target repo: Runner/API events
Depends on: P04
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: submit/status/cancel/result/events. SSE с sequence/cursor либо эквивалентный replay transport; reconnect и snapshot. Structured progress и доступный native output, без обещания скрытых reasoning traces.

Acceptance: Разрыв stream не теряет итог; queued/starting/running/terminal различимы; export state отдельно; cancel requested не притворяется stopped.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P06 — Recovery API-сессии

Planning readiness: Draft · Stage: I02A
Component/target repo: Runner/recovery
Depends on: P05
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Test client SDK/CLI fixture, Runner/API restart, late events, lease/ownership reconciliation, invalid keys и concurrency caps.

Acceptance: Принятый request не исчезает после restart; повтор не запускает две копии; клиент узнаёт failed/unknown/cancelled через status. Полностью проходит без Telegram/Web.

Уточнение владельца 30.09.2026: Reconnect/replay без rerun; авторизованный сигнал на следующую попытку с дополнительными инструкциями; сверка и stop/отзыв прав прежнего процесса до нового запуска. Повтор сигнала дедуплицируется, userTaskId сохраняется, runId меняется.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I02B — Артефакты и пользовательский workspace через API

Цель: Клиент получает файлы агента и передаёт вход без тяжёлых payload в control API.
Зависимости: I02A; object-store sandbox.

**Logs acceptance (I02B):** artifactId/hash/size/version, upload multipart state/abort, export commit/fail, snapshot conflict и cleanup. Signed URL не пишется целиком; TTL не стирает единственную копию до export ACK. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P07 — Artifact manifest и export

Planning readiness: Draft · Stage: I02B
Component/target repo: Runner/artifact export
Depends on: P06
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: artifactId, bytes/hash/MIME, scope, createdByRun, immutable version; export local files → object storage → committed manifest. Input snapshot и output delta/ref.

Acceptance: Run создал HTML/source/files; no-profile client скачал точные bytes. Cleanup не удаляет единственную копию при export failure; partial manifest объявлен явно.

Уточнение владельца 30.09.2026: Execution/finalizing разделены; тяжёлый локальный файл, crash/restart export и повтор commit не запускают engine. Export progress/ошибка доступны клиенту; sole copy не удаляется до подтверждённого сохранения.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P08 — Direct upload/download и большие файлы

Planning readiness: Draft · Stage: I02B
Component/target repo: Storage adapter + API
Depends on: P07
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: API выдаёт scoped upload/download session и короткоживущие signed object URLs. Multipart/resume для большого input; list manifest/optional archive. Без FTP и передачи гигабайт через Gateway.

Acceptance: Expired URL, wrong principal, CORS browser path, size/hash mismatch, interrupted upload/resume и abort cleanup проверены. API передаёт IDs/метаданные, bytes идут напрямую.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P09 — Workspace snapshots и конфликты

Planning readiness: Draft · Stage: I02B
Component/target repo: Storage/snapshot
Depends on: P07, P08
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Text+artifact refs пользователя или одноразовый input; snapshot version, разрешённый output destination, commit/export ACK и retention.

Acceptance: Два writers не перезаписывают молча одну версию; path traversal/escaping export отвергнут; no-profile и folder modes работают. Граница cleaned after durable export проверена.

Уточнение владельца 30.09.2026: Workspace/volume task-scoped и переживает процесс; следующая разрешённая попытка видит прежние файлы/checkpoints через новую clean room. Старые процессы/секреты не наследуются. Cleanup отдельно, retention/квоты явны.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I03 — Web и Telegram на том же API

Цель: Сквозной пользовательский workflow и обратная доставка результата, без дубля orchestration в каналах.
Зависимости: I02B; sandbox Workers/bindings и channel fixtures.

**Logs acceptance (I03):** Ingress request/native message ref, profile/channel/destination, Task correlation, dedup/media preparation, delivery attempts/ACK и Web reconnect. Ошибка в TG/Web fixture прослеживается до scoped result/report. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P10 — Тонкий Web client и task view

Planning readiness: Draft · Stage: I03
Component/target repo: trained-assist-web
Depends on: P09
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Сначала Web: test profile, submit/status/events/artifacts/cancel; отдельный Worker/API origin и test storage. Thin task facade отображает public receipt/userTaskId.

Acceptance: После reconnect видно существующую Task; состояние и файлы через общий API; private scopes проверены. Run из Web совпадает с наблюдаемым API Run.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P11 — Telegram-equivalent fixture и sandbox bot

Planning readiness: Draft · Stage: I03
Component/target repo: trained-assist-tg-bot
Depends on: P10
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Эмулятор inbound update/delivery receipts для CI, затем отдельный реальный test bot + chat smoke. Channel IDs/receipts/media normalize в Gateway, selection вне него.

Acceptance: Batch updates/dedup, user profile mapping, return report, file refs и delivery retry работают; production bot/webhook не переключён sandbox setup.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P12 — Primitive Input/Output и routing

Planning readiness: Draft · Stage: I03
Component/target repo: Input/Output + Task Router
Depends on: P10, P11
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Извлечь минимум queue/handoff/result/delivery contract; default route OpenCode, typed deterministic commands; LLM executor только для известного фиксированного recipe. Бесплатный allowlist.

Acceptance: Один userTaskId виден от ingress до результата; durable ACK и replays; /stop/status не проходят LLM; delivery fail не меняет execution success.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I04 — MCP и доменные capabilities

Цель: Агент и host могут вызвать разрешённые методы с одинаковым contract; GTD пока отсутствует.
Зависимости: I03; первые fake domain adapters.

**Logs acceptance (I04):** MCP readiness/handshake/invocation/timeout/cleanup, capability/version/scoped binding и effect receipt. Credential values не логируются; stdio/native details доступны приватным diagnostic ref. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P13 — MCP lifecycle и scoped bindings

Planning readiness: Draft · Stage: I04
Component/target repo: Runner + MCP facade
Depends on: P12
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Per-run stdio process/proxy и fake remote service fixture, handshake/readiness/timeout/cleanup; shared handlers с API facade.

Acceptance: Tool вызван реально, а не только виден в list; чужой binding недоступен; failed startup отражён в logs. MCP service UID не заявлен доказанной OS isolation.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P14 — Доменные tools и playbook artifact retrieval

Planning readiness: Draft · Stage: I04
Component/target repo: software-engineering-playbooks + domain
Depends on: P13
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Начать с одного engineering/domain read и безопасного deterministic handler; получить pinned playbook artifact как data/resource. Templates — definitions, MCP — интерфейс.

Acceptance: Версия/bindings/permissions явны; read не запускает plan; fake provider mutation подтверждена receipt. Advisory playbook возможен без gtdId.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P15 — MCP integration sandbox

Planning readiness: Draft · Stage: I04
Component/target repo: Domain/MCP fixtures
Depends on: P14
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Provider success/error/delay/auth expiry/duplicate callbacks fixtures. HTTP/stdIO contract smoke; реальные доступные test-account read операции отдельно.

Acceptance: Одинаковый action outcome по transport facades; event IDs/profile/reply context не потеряны. Для unsupported external sandbox строится emulator, не ждать production testing.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I05 — Первый надёжный fast path

Цель: FAQ/clarify/known action дают быстрый результат без лишнего agent Run.
Зависимости: I04; старт corpus collection с I01.

**Logs acceptance (I05):** Routing reason/policy/context refs, template/recipe/agent mode, schema outcome/needs_executor, escalation attempt и first useful reply timing. Incorrect fast answer/error проходит scoped error contract. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P16 — Route policy и high-precision rules

Planning readiness: Draft · Stage: I05
Component/target repo: Task Router
Depends on: P15
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Typed commands/template answers первыми; URL/keywords — features плюс intent/capability, не blind URL⇒agent. Explicit live research/unknown adaptive action → OpenCode.

Acceptance: Текст с цитированной ссылкой не запускает agent без нужды; задача чтения live data не выдаёт выдуманный fast answer; permissions не выводятся regex.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P17 — Bounded reply-or-route recipe

Planning readiness: Draft · Stage: I05
Component/target repo: Router + LLM recipe
Depends on: P16
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Один полезный вызов reply/clarify/needs_executor; Output continuation с тем же U и новым Job/Run. Fixed LLM без tools; нужный handler вызывает host.

Acceptance: Schema invalid, model timeout, budget/provider failure, awaiting input и insufficient context имеют корректные outcomes; one continuation owner; OpenCode конечный auto executor.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P18 — Corpus и baseline eval

Planning readiness: Draft · Stage: I05
Component/target repo: Router eval + observability
Depends on: P03, P12
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Sanitized current fast-path errors/requests по read-only extraction; если данных мало, fixtures. Known answer/action/fresh data/middle constraints/attachments; latency, correctness, unnecessary-agent, provider calls.

Acceptance: Corpus versioned, profile data не публикуются; tests воспроизводимы, live free smoke отдельно; collected logs не считаются истинной разметкой без review.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I06 — Компактный capability catalog и глубокая проверка быстрых ответов

Цель: Небольшой scoped brief объясняет, что умеет система и как исполнять каждый метод.
Зависимости: I05; P18 baseline.

**Logs acceptance (I06):** Catalog/brief version, selected capability/readiness, included schema refs/input insufficiency, eval case ID, one-/two-stage calls, latency и usage. Не сохранять user raw prompt в общий corpus. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P19 — Четыре режима capability

Planning readiness: Draft · Stage: I06
Component/target repo: Domain metadata + shared catalog
Depends on: P14, P17, P18
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: supportedModes=[template,deterministic,llm,agent], preferredMode, inputs/required bindings, effect/readiness/version/freshness и brief label. Может быть несколько допустимых modes.

Acceptance: Template — deterministic-job response handler, не четвёртый Job type. Описание возможности отдельно от user enabled/ready; неподдержанное не рекламируется доступным.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P20 — Brief builder и retrieval

Planning readiness: Draft · Stage: I06
Component/target repo: Router/context
Depends on: P19
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Tier-1 явные короткие names/aliases+mode tags, Tier-2 relevant schemas/details. Build из verified capability metadata, scoped context cache. Native MCP names сохраняют стабильность.

Acceptance: Brief содержит data/task ограничения и ссылки на оригинал; summary не придумывает права; cache keyed profile/context/catalog/policy; output size budget measured.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P21 — One-call vs two-call и required-input UX

Planning readiness: Draft · Stage: I06
Component/target repo: Router + Web wait
Depends on: P20
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Сравнить reply-or-route и route-then-handler/reply на том же corpus. Нет обязательных двух LLM для templates/scripts. Missing email/login → structured required input + безопасная инструкция.

Acceptance: Фиксируются correctness/latency/provider calls/cost; выбран путь по evidence. Web Awaiting user input идемпотентен; не теряет userTaskId; сложное reasoning без tools остаётся LLM.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I07 — Расписание, планы и выборочный GTD

Цель: Проверять именно следующий шаг там, где он действительно нужен.
Зависимости: I06; durable task state и MCP artifact bindings.

**Logs acceptance (I07):** Schedule/occurrence dedup, gtdId только opt-in, plan/step/version/control registration reason, wait/deadline/next-step/outcome ACK. Проверить, что simple scheduled success не создаёт GTD events. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P22 — Schedule без обязательного GTD

Planning readiness: Draft · Stage: I07
Component/target repo: Schedule module (repo decision)
Depends on: P12, P21
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Virtual clock occurrences/timezone/dedup/overlap/catch-up; обычный hourly task → Output. gtdId отсутствует при terminal result.

Acceptance: Disable schedule не равен cancel accepted task; crash replay не создаёт второй occurrence; простой cron не начинает control loop.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P23 — GTD opt-in и bounded control

Planning readiness: Draft · Stage: I07
Component/target repo: GTD Manager (repo decision)
Depends on: P22
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Registration reason, next trigger/check, criteria, deadline/attempt caps; Output→GTD ACK и один owner continuation. CI/wait/input сценарии.

Acceptance: Одна явная managed task получает G; остальные нет. Wait не держит agent токены, self-GTD не создаётся; caps завершают progression, не обходятся новым control record.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P24 — Реальные playbooks и адаптация плана

Planning readiness: Draft · Stage: I07
Component/target repo: Engineering playbooks + GTD
Depends on: P23
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Engineering feature/integration split, migration dependency; pinned definition/compiled plan, stable step IDs. CI fake provider и controlled artifact edits.

Acceptance: PR→CI→verify gates имеют evidence; native playbook retrieval не подменяет execution plan; edit не меняет running step IDs. HH simple schedule по-прежнему без GTD.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I08 — External Integration Gate

Цель: Выделить provider transport и webhook lifecycle в самостоятельный repo.
Зависимости: I04 базовый handler; MVP может идти параллельно I05–I07.

**Logs acceptance (I08):** Provider operationId/external refs, auth/readiness, callback signature/dedup, normalization/cursor и unknown→reconciled. Profile/task/channel correlation из binding; raw provider payload приватный. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P25 — Gate extraction и provider sandbox

Planning readiness: Draft · Stage: I08
Component/target repo: Integration Gate repo
Depends on: P15
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Новый repo после его создания, versioned invoke/subscribe/reconcile/events. Provider emulators, signed callbacks, expired auth, webhook inbox и effect operationId.

Acceptance: Бизнес-плейбуки остаются в доменах; read/poll/webhook маршруты сохраняют scope; timeout mutation = unknown до reconcile; нет двух adapter implementations после переключения.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P26 — HH/домен pilot

Planning readiness: Draft · Stage: I08
Component/target repo: Gate + trained-assist-hh-skill
Depends on: P25, P22
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Один реалистичный provider adapter с safe test account или emulated equivalent; существующий cold search cron mapping к schedule occurrences.

Acceptance: Hourly поддержка не выдаётся за production enabled; unsupported provider webhook не обещан; integration data/results возвращаются через общий task flow.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I09 — Error Watcher

Цель: Ошибки сами порождают ограниченную диагностику и полезный report.
Зависимости: I01 error contract, I05/I06 diagnosis routing; не блокирует первые API Runs.

**Logs acceptance (I09):** errorEvent/incident/sourceTask/diagnosticTask, fingerprint/count, mute/reopen/expiry, diagnosis attempts/report/issue receipts и self-loop guard. Suppressed events агрегируются с TTL, не исчезают без trace. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P27 — Incident aggregation и suppression

Planning readiness: Draft · Stage: I09
Component/target repo: Error Watcher repo
Depends on: P03, P18
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Подключаемый repo, registered readers/cursors, exact fingerprint store, duplicate counts, timed/permanent scoped mute, reopen по regression/expiry.

Acceptance: Шторм 1000 events не создаёт 1000 LLM calls; исходные task errors не исчезают; unknown profile ops reconciliation, не случайная user delivery.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P28 — Diagnosis LLM→OpenCode и report

Planning readiness: Draft · Stage: I09
Component/target repo: Watcher + Router + delivery
Depends on: P27, P21
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Отдельный diagnosticUserTaskId/incidentId/sourceUserTaskId; workaround/issue adapters сначала fixtures, затем configured permission. Default без GTD.

Acceptance: Profile/channel correlation до ответа; issue создан только после receipt; diagnostic failure не расследует себя рекурсивно; delivery outage видна в Web/API.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

### I10 — Promotion, совместимость и RU/EU

Цель: Сохранить working old clients, перенести sandbox VM в production воспроизводимо и иметь отдельный sandbox.
Зависимости: Accepted core path I01–I07; подключённые Gate/Watcher пилоты когда готовы.

**Logs acceptance (I10):** Release/config/worker/region/ownerGeneration, promotion/cohort/rollback, fencing/drain/failover и retention health. Smoke evidence коррелирует API/Web/TG task/run IDs; prod/sandbox различимы. Общий обязательный baseline: trusted profile/tenant, Task/Run IDs когда есть, известный replyContext, source/environment/version, registered errors/main events и retention class/TTL; positive и controlled failure evidence.

#### P29 — Promotion и fleet acceptance

Planning readiness: Draft · Stage: I10
Component/target repo: Runner + gateways deployment
Depends on: P24, P09
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Reprovision/clean experiment data/config; recreate sandbox; feature-flag cohort и rollback. Current VM reusable после baseline, новые VM не закупаются в этом плане.

Acceptance: Pinned release/config, smoke through API/Web/TG, logs retention и rollback evidence; paid profiles default off; ownership/replay не расходятся.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

#### P30 — Multi-worker/region contract

Planning readiness: Draft · Stage: I10
Component/target repo: Runner/fleet
Depends on: P29
Sandbox: воспроизводимый сценарий соответствующей итерации из [Sandbox Plan](SANDBOX-PLAN.md); он может включать настоящий сервис.

Работа: Two-worker simulation на одной VM, затем существующие RU/EU workers после readiness. Region/provider/credential/data constraints, drain и fencing.

Acceptance: Нет double execution после failover; OpenCode region по provider constraints; Codex/Claude вне RU при разрешённом explicit profile; storage residency утверждается отдельно.

Уточнение владельца 30.09.2026: Partition не означает failover/rerun: ждать восстановления либо явного сигнала. До перехода на другой worker исключить записи прежнего владельца; проверить доступность сохранённых данных с нового worker и отдельно потерю volume.

Logs acceptance: пройти stage-specific checks выше и общий Observability contract; ссылка на sanitized log transcript обязательна в evidence.

Evidence: pinned PR/commit, setup/config refs, sandbox transcript и IDs. Применяются общие observability/retention требования.

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

Не блокирующие вопросы для refinement: место хранения workspace/artifacts в RU/EU; стартовые quotas/concurrency/TTL; ID выбранной VM и sandbox base URL в config registry; первое реальное доменное capability для P14. До получения ответов используются local fixtures и существующая заявленная VM. Точные credentials в Project не размещаются.

Архитектурные refinements опубликованы: [Engineering Approach](https://github.com/trained-assist/trained-agent-architecture/blob/main/ENGINEERING-APPROACH.md), [Capability Catalog](https://github.com/trained-assist/trained-agent-architecture/blob/main/CAPABILITY-CATALOG-AND-FAST-REPLIES.md). Все карточки являются planning items, никакие implementation Runs не запускались.

## Дополнение 30.09.2026

Стадия 0 — prerequisite implementation. AutoFix/context compression применяются ко всем репозиториям через общий reusable workflow и repo-specific profile, без центрального mega-build. Для нового repo — тот же onboarding. Requirements по logs теперь явно указаны у каждой итерации и карточки; Done без diagnostic evidence невозможен.

Связанный документ: [SANDBOX-PLAN.md](SANDBOX-PLAN.md). При расхождении прежних proposal о замене live core действует правило параллельной новой реализации из этого документа.

## Уточнение: потеря связи и lifecycle рабочих данных — 30.09.2026

Применяется к существующим карточкам, без изменения порядка итераций. Нормативная граница — [ARCHITECTURE §4.6](ARCHITECTURE.md#46-связка-workflow--runner--рабочие-данные); Runner и [Serverless API](SERVERLESS-AGENT-API.md) согласованы с ней.

Workflow/control plane хранит управляющее состояние вне VM и принимает решения о запуске; Runner исполняет и финализирует. Connection_lost — неизвестный исход, уведомление и ожидание связи/явного сигнала, без автоматического rerun по heartbeat/lease timeout. Смерть процесса не означает потерю диска. Данные задачи переживают Run и доступны следующей разрешённой попытке. После engine exit финализация сохраняет артефакты; её повтор не повторяет исполнение.

Обязательные logs/evidence в затронутых карточках: connection_lost/reconnected, restart signal и его источник, previous/new runId и generation, workspace/volume refs, manifest/checkpoint versions, finalization/export progress/commit/error, cleanup decision. Секреты и signed URLs не логируются. Retention-классы задаются отдельно для рабочих данных, результатов и журналов; timeout не стирает единственную копию молча.
