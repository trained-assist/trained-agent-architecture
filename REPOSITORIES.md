# Репозитории Trained Assist: назначение и границы использования

Каталог всех **35 доступных репозиториев организации trained-assist**, проверенный 06.10.2026. Это карта ответственности и входов для разработчика. Точный ход работы, приёмка и deployed revisions находятся в issues/PR, а не в таблице ниже.

**Активный** означает, что repo владеет используемым или внедряемым контрактом. Это не обещание production deployment. **Legacy** относится к конкретному runtime/adapter, а не автоматически ко всему repo. **Sandbox/test-only** не означает, что код больше не нужен. **Не подтверждено** означает отсутствие достаточного evidence использования; это не разрешение удалить repo.

GitHub archived=false у всех 35 найденных repos; организационная пометка archived сама по себе не описывает архитектурную роль. Пустая/редкая история commits также не доказывает retirement.

## Быстрый выбор места работы

- Задача/ожидание/router/schedule/reporting — Control Plane.
- Запуск агента, receipt/result, workspace publication — Agent Runner; среда исполнения — конкретный worker.
- Общий MCP transport/catalog/authorization — MCP Host. Handler принадлежит capability repo.
- Сообщения Telegram и web UX — соответствующий gateway/UI.
- Таблицы, воронка и сценарии рекрутинга — recruiting application; HH transport — hh-skill; общая генерация диалога — communication-skills.
- Переиспользуемый доменный handler — его skill repo. Не добавлять новую копию в core только потому, что там есть старый mount.
- План выполнения и актуальная приёмка — issue владельца. Эта карта не заменяет Task Store или GitHub Project.

## Основной контур

| Репозиторий | Роль | Ответственность | Как читать использование |
|---|---|---|---|
| [trained-agent-architecture](https://github.com/trained-assist/trained-agent-architecture) | Активный источник контрактов | Архитектура, ownership, сценарии и правила разработки; не runtime. | Этот каталог, ARCHITECTURE и локальные спецификации. |
| [trained-assist-control-plane](https://github.com/trained-assist/trained-assist-control-plane) | Активная интеграция | Input/Router/Output, Task Store, Workflows, ожидания, расписание и GTD. | Код и Cloudflare sandbox; полный production cutover проверять в #140. Новые host engine defaults уже в main. |
| [ai-agent-runner](https://github.com/trained-assist/ai-agent-runner) | Активная интеграция | Собственный Agent Run API, launch/result/reconcile, trusted profile binding и WorkspaceService publication. | Profile lifecycle wiring уже в main; Run A → publish → Run B на deployed revisions остаётся gate #95. Native VM adapter и внешний GHA worker — разные пути, не взаимозаменяемые доказательства. |
| [trained-assist-tg-bot](https://github.com/trained-assist/trained-assist-tg-bot) | Активный gateway | Telegram ingress, durable buffering, channel UX, доставка и stop. | Compatibility/backend и отдельный CP sandbox adapter сосуществуют. Наличие CP-кода не означает переключения всех ботов. |
| [trained-assist-web](https://github.com/trained-assist/trained-assist-web) | Активный UI | Общий web: conversations, tasks, история, формы и действия пользователя. | Cloudflare Worker + SessionHub DO + assets. Общий web не является recruiting-web; все backend routes не считаются перенесёнными автоматически. |
| [trained-assist-llm-ladder](https://github.com/trained-assist/trained-assist-llm-ladder) | Активный общий сервис | Выбор модели/провайдера и учёт LLM-вызовов; не выбор типа Job. | Worker/DO, используется capabilities и CI. Отдельные relay dependencies проверять при выводе VM. |
| [trained-assist-mcp-host](https://github.com/trained-assist/trained-assist-mcp-host) | Активная интеграция, test-only | Общий MCP dispatcher: каталог, HTTP/stdio transport, per-call authorization и binding resolution. | Default branch пока feat/standalone-host-runtime. Test Worker #160 не содержит production providers; наличие endpoint не доказывает разрешённый tools/call. |
| [trained-assist-integration-gate](https://github.com/trained-assist/trained-assist-integration-gate) | Активный модуль, sandbox | Provider invoke/subscribe/reconcile/events, webhook inbox, receipts. | Контракты и HH pilot есть; все внешние подключения/почасовое выполнение в production не подтверждены этим каталогом. |
| [trained-assist-error-watcher](https://github.com/trained-assist/trained-assist-error-watcher) | Активный модуль, sandbox | Ошибки → инциденты, dedup/suppression, bounded diagnosis/report. | Aggregation реализована; общий live error feed и полный diagnosis path проверять отдельно. |
| [trained-assist-agent](https://github.com/trained-assist/trained-assist-agent) | Переходный repo; legacy orchestration | Старый server/session/cron/MCP composition плюс ещё используемые библиотеки, schemas и testkit. | Не новая цель для task/run orchestration. Legacy runtime не означает, что можно удалить весь repo или перестать читать его callers. |

## Доменные capabilities и приложения

| Репозиторий | Роль | Ответственность | Как читать использование |
|---|---|---|---|
| [software-engineering-playbooks](https://github.com/trained-assist/software-engineering-playbooks) | Активная библиотека | Исполняемые инженерные playbooks и dev/workspace tooling. | Это переименованный trained-assist-engineering, не второй сервис; compatibility checkout/id engineering-skills ещё встречаются в core. |
| [trained-assist-hh-skill](https://github.com/trained-assist/trained-assist-hh-skill) | Активный provider/domain repo | HH API, работа с кандидатами, cold search, сообщения и recruiting adapters. | Есть действующие callers и миграция; не путать provider API с самостоятельным UI recruiting-web. |
| [trained-assist-communication-skills](https://github.com/trained-assist/trained-assist-communication-skills) | Активный shared Worker | Conversation state → goal → draft message; resolve_user_intent. | Вызывается HH и CP; генерация сообщения не отправляет его кандидату. Host registration/readiness — отдельная граница. |
| [trained-assist-documents-skill](https://github.com/trained-assist/trained-assist-documents-skill) | Активная capability; интеграция Google | Экспорт документов/презентаций, Google Drive/Docs/Sheets. | Есть локальные render/Chromium зависимости и remote Google transport в PR. Не все методы нужно переносить в Worker; agent и UI используют один владеющий handler. |
| [trained-assist-sales-skill](https://github.com/trained-assist/trained-assist-sales-skill) | Активная domain capability | Sales/CRM, company/INN, DaData/Checko, exhibition operations. | Compatibility skill-sibling. Domain/app extraction не означает удаление provider commands. |
| [trained-assist-freelance-skill](https://github.com/trained-assist/trained-assist-freelance-skill) | Активная domain capability | Intake проектов, provenance/facts/requirements/solution и спецификации. | Есть standalone tooling и регистрация в core; readiness нового Host/Runner зависит от binding и приёмки. |
| [trained-assist-marketing-skill](https://github.com/trained-assist/trained-assist-marketing-skill) | Активная domain capability | Customer Development: материалы, стадийные рубрики и playbook. | Зарегистрирован как skill-sibling; подключение к новому Host отдельно от старого mount. |
| [trained-assist-speech-skill](https://github.com/trained-assist/trained-assist-speech-skill) | Активная capability | Единая транскрипция аудио и credential/status contract. | Core sibling и входная аудио-цепочка; наличие skill не означает, что всё видео обрабатывается здесь. |
| [trained-assist-search-skill](https://github.com/trained-assist/trained-assist-search-skill) | Активная capability | Веб-поиск и provider fallback. | Есть зарегистрированный sibling. Не предполагать, что Cloudflare перенос уже выполнен по одному архитектурному предложению. |
| [trained-assist-recruiting-web](https://github.com/trained-assist/trained-assist-recruiting-web) | Активная разработка, реализация в PR | Самостоятельное recruiting приложение: UI, domain data/processes и platform contracts. | В проверенном main только README; R-01–R-04 и R-03 реализации — в открытых ветках/PR. Не готовая замена старого recruiting UI. |

## Инженерные инструменты и измерения

| Репозиторий | Роль | Ответственность | Как читать использование |
|---|---|---|---|
| [pr-autofix](https://github.com/trained-assist/pr-autofix) | Активная CI-библиотека | Общие autofix workflows, development baseline и tooling. | Подключается workflows других repos; установка hook не доказывает исправление всех PR или разрешение merge. |
| [pr-autofix-sandbox](https://github.com/trained-assist/pr-autofix-sandbox) | Действующий испытательный стенд | Регрессионный smoke consumer autofix. | Намеренно сломанные ветки/PR — fixtures, не production backlog. |
| [trained-assist-mcp-eval](https://github.com/trained-assist/trained-assist-mcp-eval) | Активный eval | Каталог MCP names-only, corpus и измерение выбора инструментов. | Не product runtime и не Host. Экстракция реальных registries не означает исполнение tool handlers. |
| [trained-assist-free-models-benchmark](https://github.com/trained-assist/trained-assist-free-models-benchmark) | Активное измерение | Сравнение моделей для coding/autofix и LLM API. | Результаты benchmark не являются production model policy; policy остаётся в llm-ladder. |
| [conversation-bench](https://github.com/trained-assist/conversation-bench) | Активный eval | Генерация/оценка сообщений кандидатам. | Отдельный от отправки сообщений harness; не отправляет письма кандидатам. |
| [conversation-bench-data](https://github.com/trained-assist/conversation-bench-data) | Активные приватные datasets | Версионированные обезличенные корпуса для conversation-bench. | Приватный repo данных, не второй сервис. Сырые production logs не публикуются. |

## Отдельные продукты и переходные инструменты

| Репозиторий | Роль | Ответственность | Как читать использование |
|---|---|---|---|
| [call-tips](https://github.com/trained-assist/call-tips) | Отдельный desktop product | Cross-platform/Electron AI coach для интервью. | Работает с Deepgram и ladder напрямую; не часть критического пути Agent Run cutover. |
| [call-tips-mac](https://github.com/trained-assist/call-tips-mac) | Отдельный macOS product; текущее использование не подтверждено | Нативный macOS interview coach. | Низкая частота commit не доказывает retirement; не объявлять удалённым без решения владельца. |
| [trained-assist-checklist](https://github.com/trained-assist/trained-assist-checklist) | Отдельная утилита; роль в новой платформе не подтверждена | Checklist Worker/D1 с собственным UI/API. | README заявляет live endpoint. Не Task Store, не GTD manager и не источник текущего плана переезда. |
| [cloud-auth-bridge](https://github.com/trained-assist/cloud-auth-bridge) | Compatibility auth integration; текущее использование не подтверждено | Chrome extension, pairing и token relay. | Не новый credential authority. Проверить текущих consumers перед отключением/архивацией. |
| [trained-assist-bugs-and-features-pipeline](https://github.com/trained-assist/trained-assist-bugs-and-features-pipeline) | Переходная pipeline; VM cron — legacy dependency | Report → triage → issue → fixer. | GCP cron/install path нельзя использовать как новую инструкцию. Полезные report/contracts сохраняются; замена/перенос scheduler принадлежит #145, это не весь Error Watcher. |

## Одноразовые CI consumers

| Репозиторий | Роль | Ответственность | Как читать использование |
|---|---|---|---|
| [pr-autofix-r2-hosted-mur61jre](https://github.com/trained-assist/pr-autofix-r2-hosted-mur61jre) | Disposable fixture | README: disposable consumer; тестовые broken files и CI consumers. | Не платформа и не долговечный сервис. Сохранять нужную evidence; удаление/архивация отдельным действием. |
| [pr-autofix-r2-hosted-mur6vx3y](https://github.com/trained-assist/pr-autofix-r2-hosted-mur6vx3y) | Disposable fixture | README: disposable consumer; тестовые broken files и CI consumers. | Не платформа и не долговечный сервис. Сохранять нужную evidence; удаление/архивация отдельным действием. |
| [pr-autofix-r2-hosted-mur75ux9](https://github.com/trained-assist/pr-autofix-r2-hosted-mur75ux9) | Disposable fixture | README: disposable consumer; тестовые broken files и CI consumers. | Не платформа и не долговечный сервис. Сохранять нужную evidence; удаление/архивация отдельным действием. |
| [pr-autofix-r2-hosted-mur7hqdq](https://github.com/trained-assist/pr-autofix-r2-hosted-mur7hqdq) | Disposable fixture | README: disposable consumer; тестовые broken files и CI consumers. | Не платформа и не долговечный сервис. Сохранять нужную evidence; удаление/архивация отдельным действием. |

## Внешние repositories, участвующие в проекте

| Репозиторий / имя | Роль и подтверждение |
|---|---|
| [vovalikessmoothy-png/opencode-gha-runner](https://github.com/vovalikessmoothy-png/opencode-gha-runner) | Внешний GHA OpenCode worker. Worker publication/object materialization PR #21 и API lifecycle Runner #147 смержены. Совместный deployment и Run A → publish → Run B проверяются в Runner #95. |
| dynamic-ip-azure-agent-run | **Имя движка в API**, не найденный отдельный repo. README opencode-gha-runner связывает это имя с DynamicIpAzureAdapter. Не создавать вторую реализацию из-за различия названий. |
| [Zerocreds-com/safe-playwright](https://github.com/Zerocreds-com/safe-playwright) | Внешний browser automation component. Использовать проверенный descriptor/adapter; единая регистрация в новом Host и production readiness не подтверждены этим inventory. |
| [Deploy-Playbooks/serverless-ai-agent-run](https://github.com/Deploy-Playbooks/serverless-ai-agent-run) | Ранний **пустой** repo: size=0, Contents API сообщает empty repository. Это не текущая реализация Runner; актуальный owner — trained-assist/ai-agent-runner. |
| [flexi-consulting/exhibitions](https://github.com/flexi-consulting/exhibitions) | Connected Application, упомянутая в принятой архитектуре. API этой сессии вернул 404: статус/ветки/использование не проверены; 404 не доказывает отсутствие или удаление private repo. |
| ZeroCreds / credential services | Внешняя credential integration. Точный repo-owner и current deployment этим обходом не установлены; не угадывать repo по названию продукта. |

## Где граница legacy

Старый server/session/cron orchestration в trained-assist-agent и его GCP deployment — переходный путь. Новый execution flow принадлежит CP → собственный Runner API → выбранный worker. При этом core содержит ещё используемые schemas, testkit, provider loaders и compatibility adapters: удаление возможно после проверки consumers, не по названию repo.

trained-assist-engineering — **старое имя** software-engineering-playbooks. В исходниках core остаются checkout/registry identifiers старого имени; GitHub redirect не означает появления второго владельца.

UI-facing capability выполняется независимо от жизни Agent Run. Remote handler вызывают и UI, и run-local тонкий adapter; чисто локальные render/browser/filesystem capabilities могут оставаться worker-local. MCP Host, Integration Gate и доменный handler не являются тремя реализациями одной бизнес-операции.

Выводимая GCP VM не является development/fallback target. Serverless — по умолчанию; существующая VM во Франции допустима для действительно необходимого постоянного процесса/ресурса. Google Storage, credentials и прочие Google services не запрещены. Наличие live legacy dependency означает задачу переноса, а не разрешение продолжать её наращивать.

## Источники и сопровождение

- [ARCHITECTURE §9](ARCHITECTURE.md#9-репозитории-и-ownership) — целевое ownership; [Connected Applications](CONNECTED-APPLICATIONS-AND-AI-LAYERS.md) — границы доменов.
- [Core skill-siblings](https://github.com/trained-assist/trained-assist-agent/blob/65144da1997b8035bb4b6a8da5a8d1670403f427/src/skill-siblings.js) — подтверждает восемь compatibility providers и старое имя engineering. Registration не доказывает их mount на каждой машине.
- [Runner #147](https://github.com/trained-assist/ai-agent-runner/pull/147), [GHA #21](https://github.com/vovalikessmoothy-png/opencode-gha-runner/pull/21) — profile lifecycle source acceptance, без объявления live canary выполненной.
- [CP #63](https://github.com/trained-assist/trained-assist-control-plane/pull/63) — host-owned engine default; [Host #160](https://github.com/trained-assist/trained-agent-architecture/issues/160) — MCP discovery/call интеграция.
- [Integrator #140](https://github.com/trained-assist/trained-agent-architecture/issues/140), [workspace #95](https://github.com/trained-assist/ai-agent-runner/issues/95), [GCP exit #145](https://github.com/trained-assist/trained-agent-architecture/issues/145) — источники актуальной приёмки.
- [CI coverage inventory](docs/inventory/README.md) — отдельный генерируемый отчёт baseline/CI, **не** каталог runtime ownership. Его файлы вручную не правятся.

При создании, переименовании или retirement repo обновить эту карту и ссылку владельца в ARCHITECTURE в том же документационном PR. При изменении readiness — обновить issue с source/deployed SHA и evidence; commit или зелёный CI не считать подтверждением live использования. Отдельные продукты и datasets не переименовывать в legacy за отсутствие места в критическом пути.
