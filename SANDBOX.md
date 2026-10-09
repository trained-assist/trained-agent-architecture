# Sandbox — как строится и проверяется песочница каждого этапа

`alesa-personal-assistent/us-central1-a/alesa-vm` выводится из эксплуатации и не используется для новых sandbox, процессов или agent runs. Для Agent Run API слой размещается в Cloudflare Worker; французская VM может исполнять задачи как worker. CP sandbox подключает только Cloudflare Runner API, а Runner API маршрутизирует исполнение на французский worker по умолчанию. Предыдущие VM-прогоны не являются текущей схемой API. [Статус вывода GCP VM #145](https://github.com/trained-assist/trained-agent-architecture/issues/145).

v1.0 · 01.10.2026. Единый документ вместо прежних SANDBOX-PLAN, SANDBOX-BINDINGS-AND-CREDENTIALS и SANDBOX-CREDENTIALS-AND-ACCESS. Здесь только долговечная логика: как устроена песочница этапа, какие классы bindings/credentials ей нужны, как вызываются сбои и что проверяется в логах. Статус, пробелы, блокеры и чек-листы ведутся в issues и [Project «Trained Assist — Migration»](https://github.com/orgs/trained-assist/projects/1). Порядок работ — [план реализации](IMPLEMENTATION-AND-INTEGRATION-PLAN.md), общие правила — [Engineering Approach](ENGINEERING-APPROACH.md), схема логов — [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md).

Документ не заявляет готовность ещё не построенных sandbox methods. Если метод технически реализуем, его постройка — работа карточки, а не причина ждать.

## Что означает «fixture обязателен»

**Test fixture** — подготовленное состояние для воспроизводимого сценария: входные данные, настройки и зависимости, способ запуска, ожидаемый результат и cleanup. Лучше говорить «воспроизводимый тестовый сценарий обязателен», чтобы это не звучало как требование проверять всё на заглушках.

Fixture не равен mock. Основной путь запускает настоящий Runner, API, filesystem и нужные adapters. Fake/emulated dependencies используются, чтобы получить контролируемые timeout, invalid JSON, expired auth, двойной callback или неработающий storage. Затем отдельный live smoke проверяет настоящего провайдера в разрешённом test account.

Пример: synthetic profile → POST нового API → настоящий OpenCode → два файла → export → скачивание клиентом → hash equality → readable Run logs. Вторая версия того же сценария ломает object-store export и проверяет failed/export_pending outcome, сохранность единственной копии и безопасную очистку. Это acceptance, а не «тест повторяет реализацию».

## Главная граница: живой сервис сохраняется

Sandbox имеет свои users/keys, endpoints, data roots, storage bindings и retention. Не использует production webhook/бота/очередь для эксперимента. Текущие репозитории читаем как references; новую реализацию размещаем отдельно. Snapshot исходников не равен копии секретов или private профилей.

На одной имеющейся VM можно сначала построить sandbox, если она предназначена владельцем для этого: отдельные roots/services/resource limits. Если на VM одновременно production или лежат private данные, эксперимент получает новый пустой namespace; существующие данные не используются как fixture и не удаляются ради clean setup. Конкретную OS/runtime границу доказывает isolated tenant acceptance; название clean room само по себе не доказательство.

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
- Воспроизводимость у другого человека: сценарий не зависит от временных ssh-alias или ручных правок на хосте.

## Слои проверки и скорость

Contract/fixture checks дешёвые и воспроизводимые. Real engine smoke показывает полный vertical slice. Provider smoke — ограниченные test-account операции с явным outcome. Измеряем их отдельно: passing emulator не называется успешным live provider test.

Промежуточные artifacts и verbose logs имеют TTL. Стартовые сроки из Observability — errors/main events 30 дней, verbose 7; это draft config, не утверждение deployed настройки. Fixture с ускоренным clock проверяет expires/cleanup, не ждёт неделю.

Никакие production Runs, deploy, AutoFix patches или cutover этим документом не выполняются.

## Средства песочницы

### Live Telegram test lanes

Three Telegram ingress lanes exist. A bot that responds to `/health` is only an ingress check: full E2E readiness requires a working CP route, Cloudflare Runner API admission, selected France worker execution, persistence, and Telegram delivery. CP binds only the Cloudflare Runner API; never put a VM, GHA gateway, or launcher URL/credential in CP config. Current sandbox lane setup is tracked in [sandbox3 #193](https://github.com/trained-assist/trained-agent-architecture/issues/193). Use the acceptance criteria in [OPS-RUNNER-DEFAULT-01](scenarios/operations/SC-OPS-RUNNER-DEFAULT-01-serverless-to-france-worker.md) for the execution path. For a normal Telegram test, use the allowlisted account and bot without supplying a principal/profile in chat.

| Lane | Test bot / gateway Worker | Config | Control Plane | Downstream isolation |
|---|---|---|---|---|
| `tg-probability` | `@probability_cat_bot` / `trained-assist-tg-ux-sandbox` | `trained-assist-tg-bot/wrangler.sandbox-tg-existing-ux.toml` | `trained-assist-cp-telegram-ux-v1-sandbox` | Shares CP Task Store/Workflow and Runner route with `tg-shturman` |
| `tg-shturman` | `@Shturman_bot` / `trained-assist-tg-shturman-sandbox` | `trained-assist-tg-bot/wrangler.sandbox-tg-shturman.toml` | `trained-assist-cp-telegram-ux-v1-sandbox` | Shares CP Task Store/Workflow and Runner route with `tg-probability` |
| `tg-sandbox3` | `@ptichka_status_bot` / `trained-assist-tg-sandbox3` | See [TG sandbox3 PR #485](https://github.com/trained-assist/trained-assist-tg-bot/pull/485) | `trained-assist-cp-sandbox3` | Separate gateway storage, CP D1/Workflow/principal, and Runner API namespace; full E2E readiness remains gated by the live route, credentials, worker execution, and CP flags |

`tg-probability` and `tg-shturman` have separate per-chat collector/session state but **are not independent full-stack lanes**. Treat a claim or nonterminal work in their shared CP/Runner as contention for both. `tg-sandbox3` has separate component namespaces, but as of 2026-10-09 it has only passed a mock Runner API contract; a real Telegram → CP → Runner → delivery run is not yet proven. Follow [CP #159](https://github.com/trained-assist/trained-assist-control-plane/issues/159) and [Runner #173](https://github.com/trained-assist/ai-agent-runner/issues/173) for its live blockers. A merged deploy PR alone does not prove the public route or worker is live.

**Choosing and claiming a lane:** check the claims in [architecture sandbox issue #185](https://github.com/trained-assist/trained-agent-architecture/issues/185), the deployed versions, and current nonterminal tasks before starting. Prefer `tg-probability` when free and ready. If it is occupied or blocked, use another ready lane only after checking its shared downstream; otherwise fix the concrete blocker. Claim the chosen lane in #185, send one uniquely marked request from the allowlisted Telegram account, and keep one active E2E run at a time until Runner capacity/isolation are demonstrated. Do not create a new sandbox or clear shared storage to make a lane appear free. Record gateway/CP/Runner deployed SHAs, marker, task/run IDs, outcome and next action; release the claim with `RELEASE <lane>` after collecting evidence.

**Checking occupancy:** unauthenticated `/health` is not an occupancy check. The gateway's protected `GET /collector-state?chatId=<allowlisted-chat-id>` reports `busy`, `launching`, `buf`, `retryBatch`, and `controlPlaneBarrier` (`unresolvedLaunchCount`, `busyRequestCount`, `stopPending`). Read it only through the existing authorized integration script or with the sandbox webhook-secret header kept in the local secret store. Treat a lane as unavailable if a lease is active, `busy`/`launching` is set, held/retry input is non-empty, `stopPending` is true, or an unresolved launch exists. Do not clear this state to make a lane appear free. Reconcile nonterminal CP tasks and Runner admissions in the selected downstream before retrying; do not repeat an unknown old run.

**Adding another sandbox:** a complete lane needs its own Telegram bot/token and gateway Worker/storage, CP Worker/D1/Workflow/principal, Runner API namespace and worker capacity, route/auth bindings, and a verified delivery path. The [Runner API sandbox operations guide](https://github.com/trained-assist/ai-agent-runner/blob/main/docs/API-SANDBOX-OPERATIONS.md) describes repeatable *component* namespaces; an API namespace named `sandbox4` or `sandbox5` does not create a Telegram/CP lane. Use the tracked bootstrap work in [architecture #193](https://github.com/trained-assist/trained-agent-architecture/issues/193) and [CP #159](https://github.com/trained-assist/trained-assist-control-plane/issues/159), then verify each binding and a real E2E scenario before marking a new lane ready. Never copy production credentials or another lane's mutable data.

**Submitting and observing:** a human may send a normal message to the assigned test bot; the configured Telegram account/chat allowlist still applies. No API key is entered into Telegram. I can tail the exact Worker from the already authenticated workstation and correlate a unique marker with Task IDs; the user does not need to operate Wrangler. Commands for an operator/session with Cloudflare access:

```bash
cd trained-assist-tg-bot
npx wrangler tail trained-assist-tg-shturman-sandbox --config wrangler.sandbox-tg-shturman.toml
npx wrangler tail trained-assist-tg-ux-sandbox --config wrangler.sandbox-tg-existing-ux.toml
```

Cloudflare's Tail API is an administrative API and requires a Cloudflare API token/authorized account, unlike the test bot's normal Telegram UX ([Cloudflare Tail API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/tail/methods/create/)).

**No-login HTTP seed/feed:** there is currently no public endpoint that accepts arbitrary sandbox tasks and provides an SSE result subscription. `/health` is public liveness only; `/webhook`, `/collector-state`, `/deliveries`, and CP task routes retain their existing provider/principal authentication. Do not describe a raw unauthenticated submit or Cloudflare log-tail endpoint as available. The requested test convenience should be implemented as a distinct sandbox-only seed/feed adapter: no account/API-key login for test callers, fixed sandbox principal/profile and hard budget/rate/body limits, no production tools or credentials, per-run opaque receipt capability for a private SSE stream, bounded TTL, and no endpoint for listing other sessions' inputs/results. The opaque receipt is a scoped read capability, not a user account. Keep Cloudflare Tail credentials and protected collector diagnostics private. Implementation is tracked in [trained-assist-tg-bot#402](https://github.com/trained-assist/trained-assist-tg-bot/issues/402).

| Средство | Метод | Construction/проверка |
|---|---|---|
| Runner API / execution worker | Cloudflare Worker API + existing France execution worker, with isolated sandbox principals and worker namespace | Reproducible API/worker setup, authenticated dispatch, OS/process/resource boundary, two synthetic profiles; CP binds only the Worker API |
| Free LLM | Собственный локальный stub (fixed response/fault provider) + actual free profile smoke | Allowlist/quota, no paid fallback, rate limit/auth/errors. Бесплатность не значит unlimited |
| Cloudflare | Separate Workers/routes и distinct KV/D1/R2 bindings | Setup/recreate/cleanup test resources; не наследовать production bindings |
| Object storage | S3-compatible local test backend и separate cloud bucket smoke | CORS, signed URLs expiry, multipart/resume/abort, checksums/TTL |
| Web | Новый client adapter к new API | Private task view, reconnect/status/artifacts/cancel; никаких existing UI deploy changes |
| Telegram | Update/delivery emulator + separate real test bot | Distinguish fixture success от actual webhook/provider delivery |
| MCP | Local stdio и remote fixture, fake domain handler | Tool readiness/invoke/effect contracts и scoped auth |
| HH/CRM | Provider emulator + sanitized contract sample, safe test account reads | Не обещаем provider sandbox или webhook, если API их не поддерживает |
| Schedules/GTD | Virtual clock + synthetic CI/condition/input | Hour/day waits не требуют реального сна; no default GTD |
| Error Watcher | Registered event stream + storm fixtures | Reader replay, fingerprint/mute/reopen, self-loop guard, fake issue receipt |
| Regions/workers | Two-worker simulation, затем existing RU/EU readiness | Region constraints/fencing; data residency policy отдельно |

Fake provider позволяет автономный progress, но не заменяет live proof свойств провайдера.

### Две машины: прод и песочница

В распоряжении **две тачки**, и это нужно видеть до планирования любых проверок:

| | Прод-VM | Песочница VM |
|---|---|---|
| Роль | Единственный владелец прод-данных и прод-нагрузки; деплои | Только эксперименты, сборки и исследовательские задачи; прод-нагрузки нет |
| Доступ | Существующий прод-конвейер | Реквизиты в GCP Secret Manager `SANDBOX_VM2_SSH` (адрес, user, ключи, ssh-алиас `vm2`, backup-пароль). Значения в этот репозиторий, issues и коммиты не переносятся |
| ОС/рантайм | Ubuntu + Node 20 | Ubuntu 24.04, Node v20.20.2 (совпадает с продом) |

Как устроена работа на песочнице (проверено 01.10.2026):

- **Рабочее дерево** — `/opt/sb/<repo>`, владелец Unix-пользователь `sandbox`. Приватные репозитории орга обновляются **git-бандлами** с рабочей станции — на хосте нет ни одного GitHub-токена.
- **Прогон тестов ядра:** `su sandbox -c 'cd /opt/sb/trained-assist-agent && npm run test:cjs'` → **183/183**; `npx vitest run` → 1203 passed (+Chromium поставлен через `npx playwright install chromium`, один известный parallel-load flake, в изоляции зелёный).
- **Тесты нельзя запускать от root:** `test/agent-isolation.test.cjs` без root-проверки выполнит `--apply` ops-скрипта и создаст 10 slot-пользователей хоста; дальнейшие изоляционные тесты от этого падают. CI-раннер non-root — песочница повторяет это же правило.
- **Сиблинги обязательны:** тесты ядра ждут domain-репозитории рядом с core (`hh, sales, engineering, documents, speech, search, marketing`) — та же раскладка, что в CI.
- **Остаточная копия прода** лежит на песочнице в отдельном каталоге `/home/vova` — она НЕ читается и не используется в тестах (wipe необратим, решение владельца); рабочие проверки идут только в `/opt/sb`.
- **Движки** (opencode/claude/codex) на песочнице не установлены — ставятся точечно под задачу.

### LLM в песочнице

Free-уровень OpenCode Zen/Go работает только изнутри клиента opencode; прямой HTTP-запрос возвращает `FreeTierError`. OpenRouter free — общий rate-limited пул, как основа не годится. Отсюда:

1. «Fixed response/fault provider» — наш собственный локальный stub с детерминированными ответами и индуцированными сбоями; внешним сервисом его не закрыть.
2. Реальный free-smoke движка — `opencode run -m <provider>/<model>` на машине, где opencode установлен в scope эксперимента.
3. Service-LLM вызовы песочницы идут через llm-ladder: основная лестница или free-only профиль `free-ladder` без paid fallback. Песочница не хранит собственных ключей моделей, только токен лестницы; вызовы различаются заголовками `x-ladder-app` / `x-ladder-run`.
4. Детерминированные тесты не зависят от free-пула: его rate limit структурный, а не случайный.

## Credentials и bindings

**Значений секретов в этом репозитории нет и не будет** — только классы, имена переменных, места хранения и процедура получения. Значение секрета или адрес машины в документации, issue, логе или commit — инцидент, а не удобство.

### Правила, которые проверяет приёмка

- Прод-токены и прод-профили не копируются в sandbox. Snapshot исходников не равен копии секретов.
- Значение секрета не попадает в trace metadata, лог, issue, commit или этот репозиторий. Signed URL целиком не пишется.
- Каждый sandbox-сервис имеет собственное имя endpoint, ключ и хранилище; пересечение с production проверяется явно, а не «по настройке».
- Ротация sandbox-секрета безопасна для production: смена sandbox-ключа не требует менять прод-ключ, и наоборот.
- Прод-токен бота не ставится на вторую машину: один бот не должен отвечать с двух машин. Для проверки доставки есть отдельный тестовый бот.
- Ключ шифрования credential-хранилища живёт только рядом с хранилищем, которое шифрует; копирование ключа без данных бесполезно и опасно.
- Binding документирован, только если указаны `<место хранения> + <имя переменной> + <владелец> + <процедура получения> + <дата ротации>`. Новый binding дописывается в тот же PR, что его вводит.
- Каталог подключённых пользовательских интеграций прода не копируется целиком: песочница получает только нужное sandbox-подмножество.

### Где лежат credentials — механизмы

| Механизм | Что там | Как читать |
|---|---|---|
| GCP Secret Manager (проект прод-агента) | Прод-секреты и sandbox-секреты GCP-стороны: тестовый бот `SANDBOX_TEST_BOT_TOKEN`, контакт sandbox-VM `SANDBOX_VM2_SSH`, `LLM_LADDER_TOKEN` | `gcloud secrets versions access latest --secret=<name>`; агенты на GCP VM — через default service account с `secretAccessor` |
| Env-файл сервиса прода (`secrets.env`, 0600) | EnvironmentFile агента на прод-VM | Только прод; в sandbox не переносится |
| Env-файл sandbox-VM (0600, `SECRETS_SOURCE=env`) | Секреты не-GCP хоста без ADC: собственный `AGENT_SECRET`, `TELEGRAM_BOT_TOKEN` тестового бота, токен llm-ladder | Файл на хосте; осознанный fallback, не забытый механизм |
| GitHub Actions secrets / org secrets | CI/deploy (`VM_SSH_KEY`, `CF_API_TOKEN`, `LLM_LADDER_TOKEN` и др.) | `gh secret list --repo <repo>`; синхронность со списком — env-manifest + проверка в CI |
| Cloudflare | Workers/KV/D1/R2 и зона | `wrangler` OAuth локально; `CF_API_TOKEN` в GH secrets |
| Per-user token store | `<agent-tokens>/<userId>/<service>` (каталог 0700) — подключённые интеграции пользователей | Только владелец/сервис; в sandbox — отдельный store с synthetic users |
| SSH | Одна ключ-пара на связь машин, отдельные файлы на каждой стороне, key-only, без паролей | Alias в ssh config; адреса и ключи не публикуются |

Классы переменных прода и их судьба в sandbox:

| Класс | Примеры имён | В sandbox |
|---|---|---|
| Секрет агента ↔ клиентов | `AGENT_SECRET` | свой, намеренно отличный от продового |
| Модели | `OPENCODE_GO_API_KEY(S)`, `OPENROUTER_API_KEY` | не выдаются: вызовы через llm-ladder; платный OpenRouter запрещён (free-only) |
| Конфиг движка | `OPENCODE_MODEL`, `OPENCODE_PROFILE` | копируются как config, не как секрет |
| Медиа/поиск | `OPENAI_API_KEY`, `FAL_KEY`, `IDEOGRAM_API_KEY`, `RECRAFT_API_KEY`, `SERPER_API_KEY` | sandbox-подмножество, только если этап проверяет этот путь |
| Реестры компаний | `INN_DADATA_*`, `INN_CHECKO_KEY` | только доменные сценарии с реальными данными |
| Шифрование хранилищ | `CRED_ENCRYPTION_KEY` | только рядом со своим хранилищем |
| Формы доступа | `ZEROCREDS_ADMIN_TOKEN` | sandbox-экземпляр или не используется |
| Трекинг | `GITHUB_ISSUES_TOKEN`, `CHECKLIST_API_KEY` | по решению для issue sink (I09) |

Централизованный credential-контур для Runner на разных VM — [Credential Broker, #30](https://github.com/trained-assist/trained-agent-architecture/issues/30).

## Уроки пробного запуска VM2

Источник: [VM2 wave 0](https://instant-publish.trainedassist.store/p/vm2-wave0-done), 29.09.2026, отчёт о запуске существующего агента. Это bootstrap/liveness evidence, не прохождение нового ai-agent-runner, API, isolation или engine end-to-end acceptance. Уроки задают требования к новому setup.

| Наблюдение в отчёте | Требование к новому setup | Проверка |
|---|---|---|
| Node не устанавливается, unit жёстко использует другой путь; ручной симлинк после 203/EXEC | Runtime устанавливается/обнаруживается с pinned версией, путь валидируется до unit start | Чистая VM → setup → service start без ручной правки; wrong/missing binary диагностируется |
| setup клонирует только core; 8 соседних domain repos пришлось добавить вручную | Declared dependency manifest, pinned revisions и component modes; standalone Runner не зависит от всех доменов | Minimal Runner без доменов; enabled domain устанавливается и проверяет readiness; missing dependency не маскируется |
| Без TELEGRAM_BOT_TOKEN crash-loop; инструкция только про GCP secrets неприменима не-GCP хосту | Env-manifest с required/optional bindings по роли; secret backend configurable; preflight перед start | Standalone без bot token работает; required key missing даёт bounded readiness error; placeholder не считается рабочим ключом |
| Unit наследует VM_NAME и primary cron role первой VM | Host-manifest отдельно от общего release: workerId, region, roots, endpoints, roles, configVersion и refs secrets | Две VM имеют разные identity; новый host по умолчанию schedule/delivery off; повтор setup не включает их |
| Порт слушает все interfaces, но firewall блокирует снаружи | Явный ingress policy с внутренней/внешней проверкой, не вывод из bind address | Local health доступен; внешний порт недоступен согласно policy; trusted control-plane ingress проверяется отдельно |
| Настроены SSH keys, password auth off, fail2ban; часы UTC | Host bootstrap описывает настройки доступа и единое время логов | Проверяем заявленные свойства; не копируем адреса, ключи или пароли в публичные manifests |

Host-manifest хранит различающиеся параметры машин; release/setup остаётся общим. Env-manifest определяет bindings, а не публичные значения секретов. Liveness (`alive`) не означает готовность engine/provider/tools; readiness показывает capabilities и причины blocked. Не копировать bot identity/боевой token или public delivery route первой VM, чтобы «завести» вторую; подключение выполняется по единому ingress/delivery ownership. Роль off проверяется отсутствием фактических schedules/delivery.

## Этапы

Для каждого этапа: что запускаем, какие сбои вызываем, какой результат ожидаем, какие классы bindings нужны и какие logs checks обязательны. Общий envelope, scope, delivery и TTL — [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md). Статус, пробелы и чек-листы этапа — в его эпике.

### R00 — исследование инструментов

- **Запускаем:** baseline и отдельный tooling candidate в новом namespace на существующей VM; кандидаты и протокол измерений — [Tooling Research](TOOLING-RESEARCH-AND-VM-PILOTS.md). Host collector учитывается один раз, per-Run dependency — на каждый Run; dev/CI tools не ставятся в каждую clean room.
- **Сбои:** relevant fault/restart, превышение resource cap, uninstall/rollback.
- **Результат:** transcript, measured overhead и решение; непроверенное остаётся pending.
- **Bindings:** SSH к sandbox-VM, новый experiment namespace, sandbox-подмножество ключей; для пилотов с Run — llm-ladder `free-ladder`. Private данные VM недоступны пилоту.
- **Logs:** pilotId/tool/version/source refs, baseline/candidate measurements, controlled errors и decision/evidence refs. При Run сохраняются profile/task/run refs. Redaction, bounded logs и cleanup; непроверенное не обозначено VM PASS.
- **Статус:** [эпик R00 #31](https://github.com/trained-assist/trained-agent-architecture/issues/31).

### I00 — baseline репозиториев

- **Запускаем:** fixture repo + isolated snapshots всех participating repos. Docs-only repo использует profile проверки Markdown/schema/context, а не application build. Общие scripts/config reusable; в repo тонкие settings.
- **Сбои:** intentional lint/schema issue, clean повтор, stale/missing context, failed check перед Repository context job.
- **Результат:** bounded AutoFix/verify и source-pinned map с source refs; нет production merge. AutoFix имеет attempt cap и verify, не автоматические merge/deploy/GTD.
- **Bindings:** GitHub-доступ к fixture repo/test branch с минимальными правами; free-only LLM profile для bounded LLM fix; без production merge/deploy прав.
- **Logs:** AutoFix — check/fix before-after, rule ID, tool/version, attempt count, patch/PR refs и residual failure. Context compression — source commit/catalog version, included/omitted paths, byte/token budget и build errors; secrets excluded. Проверить no-change повтор и synthetic failed check.
- **Статус:** [эпик E0 #16](https://github.com/trained-assist/trained-agent-architecture/issues/16).

### I01 — Agent Runner execution worker

- **Запускаем:** execution worker в изолированном namespace на существующей VM во Франции; Serverless Runner API размещён отдельно как Cloudflare Worker и направляет на него попытки по trusted policy. Локальный fake engine adapter покрывает lifecycle; два synthetic principals проверяют изоляцию.
- **Сбои:** fake engine start failure, child hanging, provider timeout, rate limit, invalid output, stop/restart, log sink outage; missing runtime/dependency/required secret, недоступный secret backend, ошибочная identity/role — до старта; firewall снаружи и reachability изнутри.
- **Результат:** observed Run lifecycle, correct scoped logs, no cross-profile access, cleanup; readiness отделена от liveness; timestamps UTC.
- **Bindings:** CP получает только service binding к Cloudflare Runner API; API и France worker используют отдельные dispatch credentials через их secret stores. Административный SSH к VM — только для управления worker host, не для установки/запуска Runner API. LLM Ladder credential выдаётся только worker runtime для разрешённого live smoke; локальные тесты используют stub. Bot token не требуется: standalone Runner API работает без Telegram.
- **Logs:** Run start/exit/cancel/process-tree/heartbeat/recovery, profile/task/run/engine/provider refs, structured errors и cleanup. Intentional failed startup/timeout обязаны оставлять диагностируемую запись.
- **Статус:** [эпик E1 #17](https://github.com/trained-assist/trained-agent-architecture/issues/17).

### I02A — Serverless Agent API и worker dispatch

- **Запускаем:** Serverless Runner API как Cloudflare Worker, durable admission/state binding и внешний test client (SDK/CLI fixture); API dispatch-ит на France execution worker. Control Plane обращается только к API service binding и не хранит worker URL/credential. Выбор движка и worker — trusted policy API.
- **Сбои:** duplicate submit/conflict, reconnect, crash API/worker, late event, invalid keys, concurrency caps, restart с принятым request.
- **Результат:** durable receipt/result и replay по sequence, один dispatch owner; всё проходит без Telegram/Web.
- **Bindings:** sandbox API keys/scopes для test principals (C13), hash-only registry/policy и worker-dispatch credentials на стороне API/worker; отдельные Cloudflare Worker/Durable Object bindings и deploy-доступ Cloudflare класса `CF_API_TOKEN`/wrangler. GHA workflow/endpoint не используется как неявный execution fallback.
- **Logs:** request receipt/idempotency/auth scope, dispatch/run state, event sequence/replay, reconnect/cancel и client-visible outcome. Profile/principal сохраняется и без folder; secret/API key не логируется.
- **Статус:** [эпик E2 #18](https://github.com/trained-assist/trained-agent-architecture/issues/18), [P-DB #32](https://github.com/trained-assist/trained-agent-architecture/issues/32).

### I02B — артефакты и workspace

- **Запускаем:** Runner files + separate object store + client download без профиля.
- **Сбои:** interrupted multipart, expired URL, hash mismatch, export fail, conflicting version, wrong principal, CORS browser path, path traversal.
- **Результат:** manifest и точные bytes клиента; cleanup только после export ACK.
- **Bindings:** локальный S3-совместимый backend для fixture; отдельный R2 bucket песочницы для cloud smoke; GCS — прод-вариант, требует доступа VM service account. Signed URLs короткоживущие и не логируются.
- **Logs:** artifactId/hash/size/version, upload multipart state/abort, export commit/fail, snapshot conflict и cleanup. Signed URL не пишется целиком; TTL не стирает единственную копию до export ACK.
- **Статус:** [эпик E3 #19](https://github.com/trained-assist/trained-agent-architecture/issues/19).

### I03 — Web, затем Telegram

- **Запускаем:** первый Web conversation slice к новому control plane; затем TG emulator и separate test bot.
- **Сбои:** пять уточнений и restart между 3-м/4-м; затем dedup, batch/media, invalid key, delivery failed, Web reconnect.
- **Результат:** контекст сохранён, latency/cost измерены; полный возврат результата и known profile/channel; old production untouched.
- **Bindings:** отдельные Workers/KV/D1 для Web adapter и test storage; тестовый TG бот (`SANDBOX_TEST_BOT_TOKEN`), никогда прод-бот/webhook; synthetic users/profiles.
- **Logs:** ingress request/native message ref, profile/channel/destination, Task correlation, dedup/media preparation, delivery attempts/ACK и Web reconnect. Ошибка в TG/Web fixture прослеживается до scoped result/report.
- **Статус:** [эпик E4 #20](https://github.com/trained-assist/trained-agent-architecture/issues/20).

### I04 — MCP и доменные capabilities

- **Запускаем:** real local MCP fixture + scoped fake domain/remote servers; shared handlers с API facade.
- **Сбои:** startup/handshake/tool timeout, missing binding, effect unknown, auth expiry, duplicate callbacks.
- **Результат:** действительный tool invoke и receipt, не только method listed; чужой binding недоступен.
- **Bindings:** scoped test credentials per binding для fixtures; значения не видны модели; при наличии — через Credential Broker (#30).
- **Logs:** MCP readiness/handshake/invocation/timeout/cleanup, capability/version/scoped binding и effect receipt. Credential values не логируются; stdio/native details доступны приватным diagnostic ref.
- **Статус:** [эпик E5 #21](https://github.com/trained-assist/trained-agent-architecture/issues/21).

### I05 — первый fast path

- **Запускаем:** Router + fixed recipe + actual API user flow; корпус [stories/FAST-REPLIES](stories/FAST-REPLIES.md).
- **Сбои:** URL quoted vs live research, invalid JSON, auth/budget missing, model timeout.
- **Результат:** template/LLM/OpenCode путь правильный; one continuation owner.
- **Bindings:** llm-ladder free-only профиль; sanitized corpus без profile data.
- **Logs:** routing reason/policy/context refs, template/recipe/agent mode, schema outcome/needs_executor, escalation attempt и first useful reply timing. Incorrect fast answer/error проходит scoped error contract.
- **Статус:** [эпик E5 #21](https://github.com/trained-assist/trained-agent-architecture/issues/21).

### I06 — capability catalog

- **Запускаем:** versioned catalog + labelled sanitized corpus; one-call vs two-call на одном корпусе.
- **Сбои:** missing email/login, stale brief/cache, wrong profile, mid-input constraint.
- **Результат:** readiness/inputs не выдуманы; measured one-/two-stage comparison.
- **Bindings:** как I05.
- **Logs:** catalog/brief version, selected capability/readiness, included schema refs/input insufficiency, eval case ID, one-/two-stage calls, latency и usage. Не сохранять user raw prompt в общий corpus.
- **Статус:** [эпик E5 #21](https://github.com/trained-assist/trained-agent-architecture/issues/21).

### I07 — расписание, планы, выборочный GTD

- **Запускаем:** virtual clock + synthetic CI/events + selected actual playbook.
- **Сбои:** occurrence duplicates, wait/input, failed gate, cap exhaustion, crash replay.
- **Результат:** GTD только opt-in, stable plan/step IDs, no endless control. Hour/day waits не требуют реального сна.
- **Bindings:** synthetic CI provider; реальные внешние bindings не нужны.
- **Logs:** schedule/occurrence dedup, gtdId только opt-in, plan/step/version/control registration reason, wait/deadline/next-step/outcome ACK. Проверить, что simple scheduled success не создаёт GTD events.
- **Статус:** [эпик E5 #21](https://github.com/trained-assist/trained-agent-architecture/issues/21).

### I08 — External Integration Gate

- **Запускаем:** новый Integration Gate + provider API emulator/test binding; safe test account reads отдельно.
- **Сбои:** signed callback duplicate, auth expiry, mutation timeout.
- **Результат:** profile binding/correlation и outcome reconciliation; no blind effects retry.
- **Bindings:** signing secrets эмулятора; режим HH/CRM test account (read-only) фиксируется решением; principal из binding через Credential Broker, не от модели.
- **Logs:** provider operationId/external refs, auth/readiness, callback signature/dedup, normalization/cursor и unknown→reconciled. Profile/task/channel correlation из binding; raw provider payload приватный.
- **Статус:** [эпик E6 #22](https://github.com/trained-assist/trained-agent-architecture/issues/22).

### I09 — Error Watcher

- **Запускаем:** registered error readers + incident store + fake report/issue sink.
- **Сбои:** 1000 repeat events, mute expiry/regression, diagnostic self-error.
- **Результат:** bounded LLM/OpenCode calls; original user error retained; no self-loop.
- **Bindings:** fake issue sink; реальный sink (класс `GITHUB_ISSUES_TOKEN`, sandbox-репозиторий) только по решению.
- **Logs:** errorEvent/incident/sourceTask/diagnosticTask, fingerprint/count, mute/reopen/expiry, diagnosis attempts/report/issue receipts и self-loop guard. Suppressed events агрегируются с TTL, не исчезают без trace.
- **Статус:** [эпик E6 #22](https://github.com/trained-assist/trained-agent-architecture/issues/22).

### I10 — promotion, совместимость, RU/EU

- **Запускаем:** staged deployment + two-worker simulation на одной VM, затем existing workers.
- **Сбои:** drain/failover/late output, rollback, incompatible mapping, partition.
- **Результат:** no double dispatch; original live tasks stay with old owner; pinned config.
- **Bindings:** release/config registry; второй worker; shell-доступ к RU VM для региональной приёмки; paid profiles off.
- **Logs:** release/config/worker/region/ownerGeneration, promotion/cohort/rollback, fencing/drain/failover и retention health. Smoke evidence коррелирует API/Web/TG task/run IDs; prod/sandbox различимы.
- **Статус:** [эпик E7 #23](https://github.com/trained-assist/trained-agent-architecture/issues/23).

## Логи обязательны для каждой итерации

Каждый work item R01–R03/Z01–Z03/P01–P30 проходит logs checks своего этапа (раздел «Этапы» выше) поверх общего [Observability contract](OBSERVABILITY-AND-ERROR-CONTRACT.md). Positive/controlled failure evidence обязательно по [Engineering Approach](ENGINEERING-APPROACH.md). Done требует transcript/evidence; нельзя ограничиться обещанием «у нас есть console.log» или успешным ответом агента.

## Проверки связи, диска и финализации

Основание — [ARCHITECTURE §4.6](ARCHITECTURE.md#46-связка-workflow--runner--рабочие-данные), карточки P03/P06/P07/P09/P30.

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
