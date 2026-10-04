# План реализации и интеграции Trained Assist

Draft v0.9 · 04.10.2026. Это документ implementation/integration: долговечная структура плана — решения владельца, путь интеграции, этапы, зависимости, общие правила приёмки, scope репозиториев и риски. Статус карточек и чек-листы ведутся в [Project «Trained Assist — Migration»](https://github.com/orgs/trained-assist/projects/1) и issues. Это не runtime GTD/checklist. Документ задаёт план, а не запускает инфраструктуру. Уже выполненные прогоны учитываются по ссылкам и границам evidence; migrations и production переключения требуют отдельной приёмки.

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

На 03.10.2026 Runner/API/storage/MCP и control-plane admission/adapter/Web/reporting реализованы. Это не полная приёмка изоляции и автоматической очистки Agent clean room; точные остатки и live evidence — в срезе ниже.

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
2. Предпосылки control plane документированы и проверены: P-DB cloud smoke завершён (PR #93), [схема Task Store v1](TASK-STORE-SCHEMA-V1.md) и [conversation contract](CONVERSATIONAL-SESSION-CONTRACT.md) смержены (#89/#88). Их реализация уже смержена в control-plane repo; ближайшие остатки — production-shaped own-API dogfood и clean room lifecycle (срез ниже). Защита терминальных состояний (#90) обязательна до приёмки; условия деплоя/пробуждения (#91/#92) входят в release и latency проверки.
3. Первый интеграционный slice: новый control plane + Web, пять уточнений с рестартом и сохранением контекста (P10/P12 плюс нужные части P02/P05/P06). Для него достаточно bounded default route; полный MCP/fast path не prerequisite.
4. Параллельно готовить standalone Runner → API → artifacts (P01–P09). Standalone API не зависит от platform GTD/Telegram и не заменяет разговорную приёмку.
5. Расписание — ранний отдельный пилот после Workflow Port/Task Store (P22), без обязательного GTD. MCP/catalog, fast replies и GTD/playbooks развиваются по своим контрактам после базового slice.
6. Gate/Watcher — независимые последующие интеграции. Promotion — по проверенным сценариям, а не только по номеру последней итерации.

Это уточнение зависимостей, не переименование 33 карточек и не объявление их выполненными. Для первой интеграции части карточек можно выделять в малые PR; полная карточка Done только после всей её приёмки.

## Актуальная приёмка и критический путь — 04.10.2026

**Ближайшая цель own-API dogfood достигнута по отчёту исполнителя; повторять этапы среза 03.10 ниже не нужно.** Этот раздел имеет приоритет для текущего порядка работ. Отчёты не равны независимому повторному прогону и массовому production cutover.

### Где остановилась работа

Последний опубликованный результат Runner — [PR #69](https://github.com/trained-assist/ai-agent-runner/pull/69), смержен **04.10 03:49 МСК**: материализация refs/snapshot с проверкой владельца, пути, sha256/size и staging. [Итог #52](https://github.com/trained-assist/ai-agent-runner/issues/52#issuecomment-5975132790) снимает предшествующий СТОП по snapshot. По GitHub видно последнее завершённое действие; состояние/причину смерти локальной сессии этот аудит не устанавливает.

Control plane после own-API работы продолжил fast-path: [#29](https://github.com/trained-assist/trained-assist-control-plane/pull/29) P16, [#30](https://github.com/trained-assist/trained-assist-control-plane/pull/30) P17, [#31](https://github.com/trained-assist/trained-assist-control-plane/pull/31) P20 (последний merge **04.10 06:20 МСК**). Поэтому «агент остановился» не означает незавершённый запуск ядра.

### Что реально подтверждено

| Контур | Evidence | Граница |
|---|---|---|
| Own API | Control plane #24–28 в main; [финальный report #23](https://github.com/trained-assist/trained-assist-control-plane/issues/23#issuecomment-5974803166) | Deployed Cloudflare → VM Runner → настоящий OpenCode free; настоящий engineText, пользовательский ответ отдельно |
| Артефакты и teardown | Тот же report: answer.txt/index.html/report.md, sha256 совпал, ключа в URL нет; room/workspace/home/tmp отсутствуют после persist | Нельзя подменять этим проверку неизвестного набора domain tools |
| Restart / unknown | startedCount=1, admissions 1→1 после restart; connection_lost = unknown без rerun; host ask durable wait/answer/continuation | Контролируемые сценарии отчёта, не обещание восстановления любой VM/потерянного диска |
| OS boundary | [#51 evidence](https://github.com/trained-assist/ai-agent-runner/issues/51#issuecomment-5973258177): разные Unix uid, cross-run EACCES/EPERM, 81/81; последующие #59/#61–68 исправили VM-дефекты | В отчёте #51 строка «два настоящих OpenCode одновременно» осталась открыта. Более поздний #23 доказывает реальный engine, но не явно эту concurrent matrix |
| Materialize / snapshot | Runner #69, #52 closed: snapshot указывает на durable artifact bytes; checksum/path/owner guards до spawn, следующая попытка читает разрешённые refs | Проверить, что deploy Runner включает #69: merge main сам по себе не подтверждает установленную версию сервиса |
| Fast-path | P16/P17/P20 в main | Не требуется для fixed-route API dogfood; самостоятельная приёмка корпуса/режимов/UX остаётся по карточкам |

### Обновление evidence — 04.10.2026, 16:30 МСК

- [Control plane #32](https://github.com/trained-assist/trained-assist-control-plane/pull/32) смержен: snapshotId проходит public Task input → RunSpec → Runner. Report: Run A экспортировал, Run B прочитал SEED-42, 14/14. **Граница:** CP локальный, VM Runner/OpenCode настоящие; это не повтор deployed Cloudflare snapshot пути и не автоматический Git saveback.
- [Runner #70](https://github.com/trained-assist/ai-agent-runner/pull/70) и [#71](https://github.com/trained-assist/ai-agent-runner/pull/71) смержены: исправлена гонка exit/stdio при resolveSlot. На VM2 два настоящих OpenCode разных uid одновременно, report 12/12; concurrency больше не невыполненный пункт.
- [Architecture #131](https://github.com/trained-assist/trained-agent-architecture/pull/131) смержен: постоянный репозиторий профиля принят.
- [Runner #72](https://github.com/trained-assist/ai-agent-runner/pull/72) смержен (`743c7e4e`): независимый `src/workspace`, восемь методов + `evaluate_workspace_cleanup`; report 101 локальный тест, 485 passed/3 skipped всего. Это готовый кандидат для ревью, не подключённый lifecycle и не live Git/storage acceptance.
- [Architecture #133](https://github.com/trained-assist/trained-agent-architecture/pull/133) смержен: уточнения workspace контракта (v0.4) — двенадцать уточнений в раздел «Постоянный пользовательский workspace».
- [Control plane #33](https://github.com/trained-assist/trained-assist-control-plane/pull/33) смержен: дедлайн старта + детектор «принято, но не начато» (arch#132 R1–R5).
- [Control plane #34](https://github.com/trained-assist/trained-assist-control-plane/pull/34) закрыт без мержа: add/add с #33 по `stuck-input-watchdog.ts`; работа поглощена #35.
- [tg-bot #345](https://github.com/trained-assist/trained-assist-tg-bot/pull/345) закрыт без мержа: пересечение по `intake-buffer.js` с уже принятым решением.
- [Agent #2095](https://github.com/trained-assist/trained-assist-agent/pull/2095) и [#2097](https://github.com/trained-assist/trained-assist-agent/pull/2097) смержены: прямые вызовы провайдера убраны из `media-vision`, `site-connector`, `intake-gate`, `llm-client`; `OPENROUTER_API_KEY` убран из реестра секретов. Issue [#2092](https://github.com/trained-assist/trained-assist-agent/issues/2092) закрыт.

### Критический путь — 04.10.2026, 16:30 МСК

1. ✅ **Закрепить текущий deploy и повторить короткий own-API smoke.** Runner `d20c274` (`vm2-final-cp23-r10`, cfg 12) + CP `ed65278d`. Smoke: 12/12 (два настоящих OpenCode одновременно, 47 с перекрытием), snapshot ref 14/14. **Закрыто.**
2. ✅ **Закрыть concurrent OpenCode строку #51.** Гонка exit/stdio исправлена (#70), два настоящих OpenCode разных uid одновременно (#71, 12/12). **Закрыто.**
3. 🔄 **Замкнуть постоянный workspace пользователя до переноса существующих профилей.** Контракт принят в [#131](https://github.com/trained-assist/trained-agent-architecture/pull/131), уточнён в #133 (v0.4). Модуль `src/workspace` реализован в [Runner #72](https://github.com/trained-assist/ai-agent-runner/pull/72) (8 методов, 101 тест). **Не сделано:** hooks H1–H5 не подключены к lifecycle Runner и control plane, живой прогон на private repo с настоящим Git API и object storage не выполнен, массовый импорт профилей не выполнялся. Перенос пользователей блокируется до интеграции и живой приёмки; разовый own-API dogfood не блокируется.
4. ⬜ **Подключить только нужные первому пользователю capabilities.** Service capabilities — Cloudflare API с тонким MCP adapter на VM; run-local tools — в clean room. Решение и приёмка: [agent #2061](https://github.com/trained-assist/trained-assist-agent/issues/2061), communication [#2034](https://github.com/trained-assist/trained-assist-agent/issues/2034). Доменный UI и Agent Run вызывают одну реализацию; клики UI не создают агентскую сессию. Полный перенос всех MCP не блокирует запуск.
5. ⬜ **Выбрать один реальный канал/сценарий и принять compatibility.** Sandbox Web либо API client, затем Telegram; проверить полный input/context, профиль/проект, статус/stop/continue, настоящее awaiting choice/form, результат и файл. Не переключать все каналы по зелёному transport test.
6. ⬜ **Разрешённый cohort и rollback.** Только новые задачи идут новому owner, старые остаются legacy. Отдельное решение о переключении endpoint; данные/события читаются после rollback, mutation с неизвестным исходом не повторяется.

### Новый критический путь — подключить постоянное состояние и принять канал

1. **Принять workspace PR #72 и согласовать #133.** Проверить реализацию ports, durable journal, tenant binding, CAS/merge и recovery; не писать методы заново. Проверить несовпадение cleanup policy: #131 допускает удаление при verified durable candidate, #72 удерживает среду до published. Консервативное удержание допустимо для первого slice, но должно быть явно отражено в статусе/ёмкости, а не названо завершённой cleanup.
2. **Интегратор подключает H1–H5.** Composition root с настоящими repository-admin/binding/object-store ports; versioned export policy; prepare до engine; publish после engine exit до разрушительного export/prune/sweep; publication status/conflict/reconcile в Reporting. baseRevision/binding/policy привязываются host к runId в durable state или согласованном RunSpec, не только в памяти. Existing Runner #69 и CP #32 переиспользуются.
   **Обязательные проверки интеграции:** prepared profile bytes переводятся в существующий ArtifactStore/snapshot; редактируемые файлы имеют явно определённые пути. Сейчас materialize пишет .inputs/<snapshotId>/, а workspace export исключает входы: нельзя предполагать, что изменение этих файлов попадёт в saveback. определить mapping вход → рабочий файл → publication manifest, включая удаления. Недоступный artifact ref с warnings не должен молча выглядеть полным input: host выбирает явный partial/blocked outcome. Export, publication и sweep не должны удалять bytes, которые ещё нужны другому этапу.
3. **Живой постоянный workspace через наш Task API.** Disposable private repository, synthetic profile и настоящие Git/object storage adapters: ensure → A prepare → OpenCode edit/create → publish → cleanup → B prepare на новой среде видит результат. Проверить тяжёлый artifact, concurrent edits/conflict, timeout/crash push unknown, storage failure и sole copy. Resolver Agent Run не обязателен для первого slice: durable conflict + Awaiting user input достаточны; автоresolver принимается отдельно.
4. **Закрепить единый deployed release.** Runner с #70/#72 и hooks после их принятия, соответствующий CP с #32; записать SHA/config refs. Повторить короткий authenticated deployed Cloudflare → VM smoke с profile snapshot/saveback, status/download/restart без дубля. Локальный CP smoke #32 не подменяет deployed проверку. Concurrent #71 не повторять без изменения границы.
5. **Параллельно подготовить один канал и нужные capabilities.** API client/Web sandbox первым либо выбранный Telegram sandbox. Только tools первого сценария: service capabilities через общий API/тонкий MCP adapter, run-local внутри clean room. [Agent #2061](https://github.com/trained-assist/trained-assist-agent/issues/2061), [#2034](https://github.com/trained-assist/trained-assist-agent/issues/2034). Проверить profile/project, полный input, status/stop/continue, host choice/form без лишнего Run, текст и файлы. Полный fast-path не блокирует fixed-route slice; если включаем fast-path, отдельно принять реальный provider/context и continuation, не только routing fixtures.
6. **Импорт копии одного legacy профиля → cohort → rollback.** Dry-run/import/verify, сохранение секретов вне Git, учёт изменений legacy между копией и cutover; один canonical writer после переключения. Только новые задачи новому owner, старые legacy не переносятся незаметно. После rollback результаты и publication journal доступны, mutations с неизвестным исходом не повторяются.

**Можно сейчас:** существующие внутренние own-API задачи с разрешёнными/synthetic данными и разовые Runs. **Блокер переезда накопленных пользовательских данных:** review #72 → реальные ports и H1–H5 → live saveback/recovery → deployed+канал → проверенный импорт/cohort. GTD/fleet/watchers/массовый MCP перенос не добавляются перед этим. Параллельные агенты работают по границам: workspace модуль отдельно; lifecycle/RunSpec/workflow/deploy и финальная приёмка — у интегратора.

## Исторический срез реализации — 03.10.2026

Цель текущей итерации: **мы сами используем свой API для настоящего OpenCode Run в отдельной Agent clean room; ответ и файлы сохраняются, временная среда очищается автоматически**. Это не массовое переключение старого Telegram/Web. M1 transport и demo conversation уже построены; их не начинаем заново.

Проверенные main: Runner `4f4a0d1f540a26337e8a096d18f74b30f173ca62`, control plane `8bd71c10014b1d58afc1ea5c0d142a7efd2e7bec`. Смерженный код, тесты, VM transcript и production readiness различаются. Статусы карточек — в issues/Project; срез не закрывает их повторно.

| Область | Уже сделано | Граница доказательства / остаток |
|---|---|---|
| Control plane | PR [#6](https://github.com/trained-assist/trained-assist-control-plane/pull/6), [#8](https://github.com/trained-assist/trained-assist-control-plane/pull/8), [#9](https://github.com/trained-assist/trained-assist-control-plane/pull/9), [#11](https://github.com/trained-assist/trained-assist-control-plane/pull/11), [#12](https://github.com/trained-assist/trained-assist-control-plane/pull/12), [#14](https://github.com/trained-assist/trained-assist-control-plane/pull/14), [#15–19](https://github.com/trained-assist/trained-assist-control-plane/pull/19), [#20](https://github.com/trained-assist/trained-assist-control-plane/pull/20): admission, replay/status, cancel/delivery, Web sandbox, awaiting, pilot routing, настоящий Runner adapter и reporting | `database_id` placeholder; README явно говорит, что новый control plane на Cloudflare не deployed. Внешнюю проверку ключа перед trusted `X-Principal` надо реально подключить; клиентский заголовок не удостоверяет личность |
| VM Runner ↔ control plane | [#122 live report](https://github.com/trained-assist/trained-agent-architecture/issues/122#issuecomment-5958159459): local control plane → ssh tunnel → настоящий VM Runner, engine=fake; artifact HTTP 200, связь lost → unknown, восстановление возвращает тот же Run | Не доказан полный Cloudflare → VM → OpenCode путь. Runner standalone OpenCode dogfood и fake adapter smoke — два отдельных evidence |
| Runner API и storage | [#36](https://github.com/trained-assist/ai-agent-runner/pull/36) capabilities/conversation/artifacts, [#43](https://github.com/trained-assist/ai-agent-runner/pull/43) VM transcripts, [#44](https://github.com/trained-assist/ai-agent-runner/pull/44) C01–C03 compatibility, [#45](https://github.com/trained-assist/ai-agent-runner/pull/45) export/upload/snapshot в main; recovery и reboot уже есть | `materialize()` сейчас mkdir + clone, не полный input/profile snapshot loader. Snapshot metadata и безопасные artifact paths не доказывают автоматический restore всей следующей попытки |
| Clean room | API выдаёт уникальный `workspaces/<runId>`; API owner/scopes и путь проверяются | `OpenCodeAdapter.spawn` работает под service UID, capabilities: `osIsolation=not_proven_service_uid_only`. Отдельный cwd не ограничивает shell/read. Остаток: [Runner #51](https://github.com/trained-assist/ai-agent-runner/issues/51) |
| Persist / cleanup | Export загружает объявленные `spec.outputs` и проверяет storage перед удалением их локальных копий | Не удаляет весь cwd/HOME/tmp. `cleanupStatus()` может вернуть completed без sweep workspace. Sole copy нельзя удалять; нужен recoverable sweep: [Runner #52](https://github.com/trained-assist/ai-agent-runner/issues/52) |
| MCP / interaction | Runner [#46](https://github.com/trained-assist/ai-agent-runner/pull/46)/[#47](https://github.com/trained-assist/ai-agent-runner/pull/47): per-run MCP, bridge, scoped bindings, общий handler. [#115](https://github.com/trained-assist/trained-agent-architecture/issues/115) spike выбрал host-owned interaction; [#116](https://github.com/trained-assist/trained-agent-architecture/issues/116) и [#121](https://github.com/trained-assist/trained-agent-architecture/pull/121) доказали durable outbox на пилоте | Не считать закрытые spike/pilot полной VM-интеграцией каждого domain/interaction tool. Связка host ask → реальный Run → continuation проверяется отдельно |
| Workflow pilot | [#111](https://github.com/trained-assist/trained-agent-architecture/pull/111) guard/deploy diagnostics и #121 outbox в main; #90/#91/#92/#116 отсутствуют среди открытых issues | Cloud pilot не deployment нового приложения. Release-version и wake/recovery проверки повторяются на выбранном production-shaped пути, без автоматического rerun неизвестных эффектов |
| Расписание / GTD / fleet | Control plane [#21](https://github.com/trained-assist/trained-assist-control-plane/pull/21)/[#22](https://github.com/trained-assist/trained-assist-control-plane/pull/22): P22/P23; Runner [#48](https://github.com/trained-assist/ai-agent-runner/pull/48)/[#49](https://github.com/trained-assist/ai-agent-runner/pull/49)/[#50](https://github.com/trained-assist/ai-agent-runner/pull/50): promotion/placement и VM probe | Полезные готовые блоки, но не доказательство OS boundary, полного sweep или миграции пользователей. Не расширять ими ближайший one-VM dogfood |
| Fast-path | Architecture [#126](https://github.com/trained-assist/trained-agent-architecture/pull/126)/[#127](https://github.com/trained-assist/trained-agent-architecture/pull/127): versioned corpus, baseline/label gate, profile-data prohibition | P16/P17/P19–P21 и research остаются отдельным треком; baseline не доказывает снижение числа агентских запусков |
| Tooling и каналы | AutoFix/context tooling и совместимые TG/Web сценарии подготовлены ранее | Z01–Z03 остаются открытыми. Scope-specific приёмку не заменяет org-wide rollout. Перенос Telegram и чистка legacy не блокируют запуск нового isolated API sandbox |

### Что в плане было запутано

1. Предыдущий срез ставил реализацию admission/adapter/Web и закрытие #115/#116 впереди. Эти реализации/spike уже есть; остаток теперь **интеграция и подтверждение**, а не повторная разработка M1.
2. В демо `conversation-plan.ts` после `submit-runner` безусловно открывается `mark-awaiting`, а result.answer берётся из ответа человека. Для обычного one-shot запроса wait должен возникать только по реальной необходимости; конечный ответ обязан быть результатом агента.
3. `RunnerApiAdapter.submit` пока не передаёт output/repository/MCP/snapshot bindings; demo dispatch даёт `inputRefs=[]`. Байты и identity не передаются через модель; нужен согласованный host mapping разрешённых refs и результатов.
4. **Отдельная папка ≠ изоляция; output prune ≠ clean room sweep; engine exit ≠ результат доставлен.** Закрытые карточки остаются историей своей приёмки; новые найденные интеграционные остатки заведены ниже.
5. «Serverless» — интерфейс для заказчика. Не создаём/удаляем VM на каждый Run. Постоянные API daemon и supervisor живут; engine/MCP и временные ресурсы конкретного Run завершаются. Долгая архивация — отдельная фаза с durable ownership файлов.

### Новый критический путь: собственный API → clean room → результат → очистка

| Порядок | Работа / owner | Приёмочный результат |
|---|---|---|
| 1 | [Control plane #23](https://github.com/trained-assist/trained-assist-control-plane/issues/23): one-shot путь, полный разрешённый Task → RunSpec mapping и реальный конечный ответ | Обычный запрос не требует demo «да». Наш клиент идёт в тот же Task API, что Web/TG; control plane вызывает Runner `POST /v1/runs`, без прямого spawn/ручного upload результата |
| 2 | [Runner #51](https://github.com/trained-assist/ai-agent-runner/issues/51): минимальная OS boundary | Два реальных Run не читают чужой cwd/HOME/secrets, не управляют чужими процессами; сломанная изоляция отказывает до spawn |
| 3 | [Runner #52](https://github.com/trained-assist/ai-agent-runner/issues/52): materialize, verified persist, recoverable sweep | Агент получает refs/snapshot, сохраняет ответ/файл; после подтверждённого persist cwd/HOME/tmp/MCP config очищены. Storage failure сохраняет sole copy с cleanup pending; crash не повторяет execution |
| 4 | #23: изолированный Cloudflare sandbox + authenticated доступ к VM API | Настоящие bindings/миграции, доказанная auth boundary, ключ Runner из SM/binding. Локальный ssh tunnel больше не единственный доступ. Выбор private/public network transport фиксируется явно |
| 5 | #23 + Runner [#7](https://github.com/trained-assist/ai-agent-runner/issues/7): own-API OpenCode dogfood | Бесплатный OpenCode через весь путь создаёт MD/HTML; наш пользователь читает реальный ответ и скачивает файл после cleanup. Duplicate/reconnect/restart/unknown проверены; версии deployed совпадают с transcript |
| 6 | Разрешённый pilot/rollback по M1, затем Web/TG integration | Новые задачи идут выбранному owner, старые остаются legacy. Реальный host ask, callback форм и continuation проверены перед заявлением поддержки интерактивных сценариев |

Пункты 1–3 можно подготовить независимо по разным путям/репозиториям; совместная VM приёмка идёт только после согласования контрактов. На VM уже можно выполнять технический dogfood с synthetic данными; **цель «каждый Run изолирован и среда убирается» достигнута только после 2–3**. Нет новой покупки VM и нет требования закончить весь MCP/fast-path/GTD/fleet/AutoFix backlog перед этим исследовательским прогоном. Обязательные baseline/logs/free-only/secret gates остаются; открытый I00 нельзя объявлять Done или скрыто отменять.

Финальный transcript должен быть одним связанным сценарием, а не суммой независимых PASS: наш API client → authenticated Task API → control plane → VM Runner API → настоящий OpenCode → verified external artifact/result → clean room sweep → чтение результата после restart. Все IDs и deployed SHA закреплены; никаких production переключений этой правкой.

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

Созданные новые repos (30.09.2026, публичные): [trained-assist-control-plane](https://github.com/trained-assist/trained-assist-control-plane) — control plane; [trained-assist-integration-gate](https://github.com/trained-assist/trained-assist-integration-gate) — I08; [trained-assist-error-watcher](https://github.com/trained-assist/trained-assist-error-watcher) — I09. Control plane уже содержит Task Store и Workflow Port (срез выше); Gate/Watcher пока без принятой прикладной реализации. Runner — уже существующий ai-agent-runner. Остальной I00 onboarding (AutoFix, staging) — по Z01/Z02.
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

## Research B: интерактивность и user-action без лишнего Run

02.10.2026: [INTERACTIVE-EXECUTION-AND-USER-INPUT.md](INTERACTIVE-EXECUTION-AND-USER-INPUT.md) описывает interaction policy отдельно от execution mode, typed choices/forms, ZeroCreds adapter, durable waits и возобновление без живого agent process. Research A расширен multimodal inputs, domain/intent tagging и candidate tool docs (§12 Router); naming mapping входит в него.

Можно вести обе части одной research-сессией, но два набора labels/evidence. Работу разместить в согласованных pilot paths отдельной ветки/worktree control plane, не трогать текущие PR/production. Сначала собрать и утвердить sanitized corpus (Research A §11.8/12, Research B §8), затем deterministic interaction/multimodal replay и live-model holdout. Новый native agent loop, массовый rename и production rollout не входят в research.

Первый acceptance fixture: пользователь нажал «Ввести ключ» → host открыл mocked form; 0 LLM calls, 0 Agent Runs. Callback обновил readiness и продолжил правильную задачу после restart; duplicate/cancelled/stale responses не повторяют execution. Реальный ZeroCreds/Broker callback и engine checkpoint — отдельная integration приёмка.
