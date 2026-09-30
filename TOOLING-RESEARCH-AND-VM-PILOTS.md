# R00 — обзор инструментов и проверка на VM

Статус: первичный обзор официальной документации, 30.09.2026. Это исследовательский backlog, а не принятый runtime stack. В этой сессии инструменты на VM не устанавливались и не измерялись. Порядок реализации — в [плане](IMPLEMENTATION-AND-INTEGRATION-PLAN.md); среды и bindings — в [Sandbox Plan](SANDBOX-PLAN.md) и [карте bindings](SANDBOX-BINDINGS-AND-CREDENTIALS.md).

## Зачем этот этап

До написания собственной инфраструктуры проверяем, какие проблемы уже закрыты небольшими готовыми инструментами. Начинаем с вопроса и внешнего контракта, сравниваем кандидат с текущим минимальным решением. Подходящий инструмент должен сокращать наш код или время диагностики, оставаться заменяемым и не требовать нового тяжёлого слоя ради одной функции.

R00 охватывает все этапы и карточки. Первую партию проверяем до выбора runtime-зависимостей Runner; остальные — перед соответствующей реализацией. Полный обзор нужен сразу, установка всего списка одновременно — не нужна. Новые кандидаты дописываются сюда. Отсутствие полезного внешнего инструмента — допустимый результат исследования.

## Вопросы по всему плану

| Этап / карточки | Что хотим выяснить | Кандидаты и минимальный baseline |
|---|---|---|
| I00 · Z01–Z03 | Как быстро изучать repo, проверять CI и исправлять механические ошибки, не добавляя application build? | T16/T17; уже установленный Repomix, существующий PR Fix/AutoFix и штатные check/fix команды. Новый автофиксер без обнаруженного пробела не добавляем |
| I01 · P01–P03 | Чем реально ограничить filesystem, сеть и процессы агента? Как воспроизводить сбои и получать логи? | T01–T03, T06–T08; baseline отдельный OS principal, проверенные OS limits и JSONL/journald |
| I02A · P04–P06 | Как проверить admission, статус, SSE/replay, отмену, повторы и поздний результат? | T02–T05, T10; контрактные тесты через настоящий HTTP API |
| I02B · P07–P09 | Как передавать большие файлы, переживать частичный upload и сохранять прежний workspace? | T11–T13; существующий S3 SDK + отдельный R2 bucket. Backup не заменяет workspace version/commit contract |
| I03 · P10–P12 | Как проверить диалог, reconnect, delivery и тяжёлые вложения без production бота? | T03/T14/T18; Web sandbox, Telegram fixture и отдельный test bot |
| I04 · P13–P15 | Как проверить реальный вызов MCP tool, transport, readiness и scoped bindings? | T09/T03/T04; официальный SDK и тонкий adapter вместо нового agent framework |
| I05 · P16–P18 | Как ловить неверный JSON, неправильный route и необоснованную эскалацию? | T03/T04/T15; размеченный corpus и deterministic assertions |
| I06 · P19–P21 | Как измерить brief, one-call/two-call, missing input, latency и число вызовов? | T04/T05/T15; versioned corpus, собственные измерения и LLM Ledger |
| I07 · P22–P24 | Как проверить ранний ответ пользователя, таймеры, повторы событий и bounded GTD? | T05/T02; уже выбранный Workflow Port, P-DB и реальный cloud smoke |
| I08 · P25–P26 | Как проверить webhook duplicates, auth expiry и timeout мутации с unknown outcome? | T02/T03/T04; provider fixtures и разрешённый test-account smoke |
| I09 · P27–P28 | Как собрать ошибки разных модулей и подавлять шторм, сохраняя profile/task correlation? | T06–T08/T05; fingerprint/count/suppression в существующем Task Store, без новой incident DB |
| I10 · P29–P30 | Как доказать воспроизводимый deploy, rollback, recovery и границы регионов? | T02/T13/T16/T19; host manifest, preflight и существующие CI/setup |
| Все этапы | Как выдавать scoped credentials и отзывать их, не копируя общие секреты в каждый процесс? | T01/T19; текущие bindings/credential broker. Новое хранилище секретов не является prerequisite |
| P-DB / control plane | Что ещё не доказано при выборе Workflows + D1? | [Сравнение P-DB](pilots/p-db/COMPARISON.md) уже есть; cloud recovery/timers/deploy ещё проверяем. Новый набор workflow engines не открываем без нового требования |

Это coverage всех Z01–Z03/P01–P30, а не утверждение, что перечисленные инструменты решают бизнес-логику. Idempotency, attempt fencing, ownership, delivery receipts, GTD caps и сохранность данных остаются нашими контрактами.

## Кандидаты для теста

Все T01–T19 имеют статус **doc-screened → VM pending**. T16 включает уже внедрённый в этом repo Repomix: его существующее CI evidence учитывается отдельно, не выдаётся за новый VM-прогон. Для каждой программы при пилоте фиксируем точную версию, license и зависимости. «CLI» или «один binary» не доказывает малое потребление ресурсов.

### Runtime и диагностика

| ID / инструмент / источник | Где живёт и какую пользу проверяем | Сценарий на VM и причина отказа |
|---|---|---|
| T01 · [NVIDIA OpenShell](https://github.com/NVIDIA/openshell), [support matrix](https://docs.nvidia.com/openshell/latest/about/support-matrix) | Runtime boundary на host; ограничения filesystem/network/process и audit. Это наиболее существенный кандидат по новым зависимостям: проверяем Docker/Podman, kernel capabilities и полный footprint. GPU не требуется | Два synthetic tenants, запрещённый файл/egress, разрешённый provider/MCP, child process, crash, reconnect и retained workspace. Отказ: неподдержанный kernel, обход границы, потеря файлов, обязательный новый orchestration layer или неприемлемая измеренная нагрузка |
| T02 · [Toxiproxy](https://github.com/Shopify/toxiproxy) | Временный TCP proxy с HTTP control API в тестовой среде; latency/bandwidth/timeout/reset. Не входит в обычный Run | Между Runner и тестовым API/provider/storage: разрыв, задержка и восстановление. Проверить отсутствие второго запуска от потери связи. Отказ: не удаётся воспроизвести нужный сбой; для HTTP status/JSON используем T03, а не TCP proxy |
| T03 · [Undici MockAgent](https://github.com/nodejs/undici/blob/main/docs/docs/api/MockAgent.md) + небольшой `node:http` stub | MockAgent — dev library для клиента Undici в нашем процессе; HTTP stub — временная зависимость для внешнего OpenCode/Runner. Даёт controlled 429/401/budget error/invalid JSON/SSE | Запрет незамоканного egress, scripted chunks, mid-stream disconnect и delayed callback. MockAgent не перехватывает внешний agent process: его проверяем через реальный stub endpoint. Отказ: fixture не воспроизводит transport или незаметно вызывает платного провайдера |
| T06 · [Pino](https://github.com/pinojs/pino) | Node logging library, если в новом repo ещё нет подходящей JSONL-реализации. Redaction и общий event envelope — наша настройка | Error содержит profile/source/task/run refs, секрет отсутствует, burst не блокирует main path; shutdown даёт измеримый flush outcome. Отказ: теряется correlation, sink failure вызывает бесконечный retry или logger дублирует рабочий baseline |
| T07 · [Fluent Bit](https://github.com/fluent/fluent-bit) | Один host collector, если JSONL/journald недостаточно для доставки. Кандидат для tail/export и ограниченного disk buffering; не процесс на каждого агента | Collector/sink outage, rotation, disk cap и recovery: измерить потери/дубли и backlog. Отказ: unbounded buffering, отсутствует нужная redaction/correlation или overhead выше пользы. Приложение всё равно сохраняет обязательные state/effect receipts |
| T08 · [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/) | SDK/propagation для HTTP и межмодульной трассировки. Сначала локальный exporter; отдельный collector только при доказанной необходимости | API → Router → Runner → output сохраняют IDs; sampling не уничтожает обязательные ошибки/ledger events. Отказ: обязательный большой backend или raw private payload в spans. Trace ID не заменяет userTaskId, Run ID или audit log |

Для T01 дополнительно проверяем [workspace lifecycle](https://docs.nvidia.com/openshell/latest/how-it-works/sandboxes/overview) и [OCSF audit export](https://docs.nvidia.com/openshell/latest/observability/ocsf-json-export). Не использовать удаление окружения до confirmed artifact export. Agent exit, filesystem lifetime и finalization проверяются отдельно. Audit record обогащается нашими IDs вне недоверенного агента. Policy advisor/LLM approval loop не включаем в обязательный путь; аппаратный NVIDIA Sentry не нужен этому CPU-пилоту. OpenShell пока не принятое архитектурное решение.

### Контракты, MCP, интерфейсы и быстрые ответы

| ID / инструмент / источник | Где живёт и какую пользу проверяем | Сценарий на VM и причина отказа |
|---|---|---|
| T04 · [Ajv](https://ajv.js.org/) | Небольшой Node schema validator в нужном module; admission/outcome/LLM JSON проверяется без второго модельного вызова | Missing/wrong fields, unknown route, invalid JSON, version mismatch: typed error и bounded escalation. Схемы принадлежат сервису; не загружаются из недоверенного prompt. Отказ: silent coercion меняет смысл ответа или уже есть эквивалентный validator |
| T05 · [fast-check](https://fast-check.dev/) + [fake-timers](https://github.com/sinonjs/fake-timers) | Dev libraries: generated event sequences, seed replay/shrinking и управляемое время. Не scheduler и не runtime GTD | Ранний/повторный input, поздний result старой attempt, cancel/restart, повтор occurrence, suppression expiry. Записать seed и минимальную failing sequence. Fake clock не доказывает recovery облачного движка. Отказ: тесты проверяют только собственную модель, а не реальные handlers/contracts |
| T09 · [MCP Inspector](https://github.com/modelcontextprotocol/inspector) | CLI в engineering profile; UI необязателен. Проверяет list и настоящий tool invocation через поддержанный transport | stdio/HTTP по фактическому контракту: readiness, вызов, timeout/error и cleanup. Отдельно проверить principal/binding isolation; Inspector её не обеспечивает. Отказ: несовместимый transport/runtime или необходимость оставлять debug UI доступным для рабочих Runs |
| T10 · [Schemathesis](https://schemathesis.readthedocs.io/en/stable/) | Python CLI только для dev/CI: generated tests от опубликованного OpenAPI и stateful scenarios. Не runtime dependency API | Синтетический tenant: submit → status/cancel/replay; invalid request, duplicate key, unknown result и explicit OpenAPI links. Отказ: большой setup без дополнительной находки относительно Node contract tests; запуск разрешён только против sandbox mutations |
| T14 · [Playwright](https://playwright.dev/docs/intro) | Dev/CI harness с одним Chromium для начала. Browser dependencies измеряем; не устанавливаем браузер во все clean rooms | Пять реплик с restart между третьей/четвёртой; reconnect, awaiting user input, два principals, upload и delivery failure. Отказ: браузер обязан жить в каждом Run или suite нестабилен. Telegram fixture/test bot остаются отдельной приёмкой |
| T15 · [promptfoo](https://github.com/promptfoo/promptfoo) | CLI/library для corpus eval: templates, deterministic assertions, route correctness и сравнение one-call/two-call. Без обязательного SaaS/UI server | Тот же pinned corpus против stub, затем bounded free-provider smoke: correctness, latency, calls, token usage. Model judges, paid fallback и внешняя telemetry выключены/проверены в выбранной версии. Отказ: требует лишних вызовов LLM, добавляет большой набор зависимостей без пользы либо уступает простому existing eval runner |

### Артефакты, media, bootstrap и CI

| ID / инструмент / источник | Где живёт и какую пользу проверяем | Сценарий на VM и причина отказа |
|---|---|---|
| T11 · [Moto S3](https://docs.getmoto.org/en/latest/docs/services/s3.html) | Временный Python S3 fixture для upload/list/multipart/abort на synthetic bucket. Только необходимые extras; сравнить с небольшим storage stub | Прерванный multipart, повтор finalize, hash mismatch и retained local file. Эмулятор не доказывает реальные R2 auth/CORS/policy: отдельный live smoke обязателен. Отказ: несовместим нужный API или зависимости тяжелее достаточного stub |
| T12 · [rclone S3](https://rclone.org/s3/) | Host CLI для больших transfer/recovery, если нужен вне SDK. Agent не получает общий storage credential. Сравнить с уже выбранным S3 client | Transfer interruption, repeat, checksums и потоковая передача без загрузки целого файла в RAM; клиентские secrets/signed URLs не пишутся в logs. Отказ: не доказано возобновление для нужного режима/provider или нужен daemon. Не заменяет manifest commit/fencing |
| T13 · [restic](https://restic.readthedocs.io/en/stable/) | Host CLI для snapshot/restore долговечных VM workspaces; отдельная задача от доставки артефактов | Два snapshots → потеря тестового service → restore → следующий Run видит прежние файлы. Если snapshot содержит DB, нужен согласованный DB backup, а не копия открытого файла. Отказ: нельзя восстановить без исчезнувшего host или backup/key scope смешивает tenants |
| T16 · [Repomix](https://github.com/yamadashy/repomix), [actionlint](https://github.com/rhysd/actionlint), [Gitleaks](https://github.com/gitleaks/gitleaks) | Dev/CI: существующий context pack, статическая проверка workflows и secrets scan. Repomix здесь pinned `1.18.1`; rollout — Z03, без смены работающего generator ради исследования | Fixtures docs/Node/Python, broken workflow, dummy secret: CI outcome, короткая карта, source SHA и исключения. Gitleaks не ловит все возможные приватные данные; ручной scope review сохраняется. Отказ: реальные secrets в pack/logs, бессмысленные builds или новый fixer вместо исправления конфигурации |
| T17 · [uv tools](https://docs.astral.sh/uv/guides/tools/) | Host/dev CLI для pinned Python tools в отдельных environments, если нужны T10/T11. Изолирует Python dependencies; не является security boundary | Повтор pinned setup из пустого test root, отсутствие pip pollution, измерение cache/install size. Отказ: для одного редкого теста существующий venv проще либо установка меняет production Python/units |
| T18 · [ffprobe](https://ffmpeg.org/ffprobe.html) / [FFmpeg](https://ffmpeg.org/documentation.html) | Host media worker или ограниченный deterministic job: metadata, duration/size и нужное перекодирование. Не LLM и не пакет каждого агента | Synthetic audio/video: limits, malformed/truncated media, timeout и cancel child tree; bytes идут через object refs. Проверить license конкретной сборки. Отказ: unbounded CPU/disk, неограниченное чтение URL или преобразование без доказанной необходимости |
| T19 · [SOPS](https://github.com/getsops/sops) | Необязательный host/CI CLI для зашифрованных deployment bindings, если текущий secret backend не закрывает эту задачу. Ключ расшифрования хранится отдельно | Sandbox config → authorized decrypt → rotation/revoke → readiness error; plaintext не остаётся в repository/pack/temp logs. Отказ: появляется новый общий ключ у каждого агента. SOPS не credential broker и не runtime per-user authorization |

Основной artifact путь остаётся S3 SDK + object manifest + прямой upload/download. Для реального R2-пилота сверяем [presigned URL contract](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), CORS, expiry, scope и multipart API. Подписанная ссылка является временным bearer-доступом, её не публикуем в evidence. T11/T12/T13 решают разные вопросы и не требуют совместной установки.

## Порядок VM-пилотов

1. **Подготовка R01:** read-only host inventory, фиксируем текущие services/roots/ports, kernel capabilities и resource baseline. По [Sandbox Plan](SANDBOX-PLAN.md) VM2 уже содержит private profile/agent-data: создаём новый пустой experiment namespace. Ничего существующего не удаляем и не используем как fixture. SSH/bindings берём по карте доступа; адреса/значения ключей здесь не сохраняем.
2. **Первая партия R02:** T02/T03/T04 для воспроизводимых ошибок; T06 с нашим log envelope; T01 отдельно против OS baseline. Минимальный synthetic job создаёт два файла, передаёт результат, переживает разрыв связи и завершение процесса. Toxiproxy нужен только для fault runs. До установки OpenShell проверяем его prerequisites; обновление kernel/host runtime существующего сервиса не является автоматическим шагом пилота.
3. **Перед I02B/I03/I04:** T11 + реальный R2 smoke, T09; T12/T13 только для обнаруженного transfer/backup gap; T14/T18 по сценариям интерфейса и вложений. Ограничения на реальные R2/TG bindings остаются видимыми, их не подменяем PASS эмулятора.
4. **Перед I05–I09:** T05/T15 для routing/recovery/schedule/watchers; T07/T08 по обнаруженным потерям корреляции/доставки. Cloudflare workflow recovery проверяем в Cloudflare, VM-пилот его не заменяет.
5. **CI/bootstrap и promotion:** T16/T17/T19 по соответствующим карточкам; существующий CI baseline можно проверять параллельно первой партии. Не устанавливаем все collectors, validators и eval frameworks сразу.

Каждый включённый в партию кандидат получает настоящий VM transcript. Если по prerequisites/license/dependencies он исключён до установки, записываем `rejected-at-screening` с конкретной причиной: это результат обзора, а не VM PASS. Неисследованный кандидат имеет статус `pending`, никогда `accepted`.

## Единый протокол измерений и выбора R03

Перед прогоном фиксируем `pilotId`, target card(s), baseline, candidate/version/source digest, license, host/runtime/kernel versions, resource namespace и ограничения. Для candidate и baseline используем один synthetic workload. Version pinning относится также к images и схемам.

- Сначала измеряем idle host baseline, затем install footprint (binary/images/cache), cold/warm start, CPU, RSS/PSS/peak memory, disk writes, log volume и latency первого полезного результата. Host-shared daemon учитываем отдельно от per-Run overhead; image cache не считаем нулевой стоимостью.
- Начинаем с одного Run; сравнение 2/4 concurrent Runs допустимо в установленном resource budget. Метрики берём с host/cgroup/process measurements, а не из рекламной страницы. Численные caps определяем по текущей VM до старта и записываем в manifest; превышение останавливает пилот.
- Проверяем positive path и relevant fault, затем service/process restart и повтор процедуры. Потеря связи не разрешает второй Agent Run: report + wait/reconnect; новый запуск только по разрешённому сигналу. Смерть процесса не означает удаление диска. Повтор finalization/export не запускает engine.
- Сохраняем sanitized logs с profile/task/run refs, typed errors, event timestamps, tool version и pilot correlation. Список обязательных полей/TTL берём из [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md), не создаём вторую схему. Отдельно измеряем log sink outage/rotation и проверяем bounded retention.
- Фиксируем supported extension points: HTTP/stdio/files/config/plugin; меняем test provider/binding без fork инструмента. Проверяем uninstall/rollback: сервис работает на baseline, данные и публичные contracts сохранены.
- Сначала deterministic fixtures без LLM calls; live provider smoke использует разрешённый free-only профиль и cap. «Бесплатный тариф» не гарантирует доступность или отсутствие лимитов. Для OpenCode free smoke нужен реальный клиент согласно текущему Sandbox Plan.

Принятие требует одновременно: закрыт реальный вопрос, внешний контракт прошёл, overhead укладывается в записанные caps, зависимости/лицензия подходят, интеграция заменяема и rollback доказан. При равных результатах оставляем минимальный existing baseline. Dev-only overhead не переносим на production Run.

Решение: `accepted`, `rejected`, `deferred` или `pending`. Accepted относится к конкретной версии, роли и scope, а не ко всему продукту навсегда. R03 обновляет target card и при изменении архитектурного решения — [DECISIONS](DECISIONS.md); research shortlist не переписывает ARCHITECTURE сам по себе.

## Шаблон evidence и незакрытые вопросы

Для каждого пилота в implementation issue/PR прикладываем:

```text
pilotId / target cards / question:
baseline / candidate / pinned version / license:
sourceSha / host manifest ref / namespace / binding refs:
setup -> run -> faults -> restart -> collect -> teardown:
resource caps / baseline measurements / candidate measurements:
contract outcomes / logs refs / artifacts hashes:
emulated properties / live smoke still required:
extension / uninstall / retained-data evidence:
decision / reason / follow-up:
```

До первых VM-прогонов остаются: actual host inventory и выделенный namespace, caps по RAM/CPU/disk, OpenShell kernel/runtime compatibility, наличие sandbox engine/provider и нужных bindings. У этих пунктов статус `pending`; наличие VM по сообщению владельца не является их проверкой. Детальные access gaps уже ведутся в Sandbox Plan/Bindings, сюда копируем только ссылку и outcome пилота.

Не начинаем с установки Kubernetes, нового queue/workflow server, полного observability backend или нового agent framework: сейчас для них нет выявленного незакрытого контракта. Если исследование обнаружит такой вопрос, дописываем его, сравниваем альтернативы и измеряем отдельно. Цель R00 — найти полезные маленькие части, а не собрать максимальный стек.
