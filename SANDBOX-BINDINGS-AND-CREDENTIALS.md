# Sandbox bindings и credentials — где что лежит

Проверено на хосте 30.09.2026. Дополнение к [Sandbox Plan](SANDBOX-PLAN.md) и разделу «Sandbox methods и gaps».

Sandbox Plan фиксирует, что credentials/test accounts привязываются при implementation. Этот документ отвечает на практическую половину: **где физически лежит каждый binding, кто им владеет и как его получить**, чтобы стадия I01 не начиналась с поиска.

**Правило: значений секретов в этом репозитории нет и не будет.** Только места хранения, имена переменных и процедура получения. Значение секрета в документации, в issue, в логе или в commit — инцидент, а не удобство.

## 1. Среды

| Среда | Адрес | Роль | Доступ агента |
|---|---|---|---|
| VM1 `alesa-vm` | 136.65.7.197 | Прод агента (`agent-master` → release-каталог) | `ssh vm` (alias, ключ профиля) — временный доступ, см. §6 |
| VM2 `vmi3617957` | 169.58.15.230 (Contabo) | Кандидат sandbox VM | с VM1: `ssh -i ~/.ssh/vm2_ed25519 root@169.58.15.230` |
| RU VM | 178.212.14.192 | Браузерный RU-контур | **shell-доступа нет** ни с VM1, ни из слота; доступен только инструмент браузера с RU-IP |
| Cloudflare | аккаунт `d740a05e9442c1d0feacae2dfc673e93` | Workers/Pages/D1/R2/Ladder/TG-шлюз | токен на сервере; из сессии — только `site_deploy`, ручной `wrangler` не работает |
| GitHub | `trained-assist`, аккаунт `kobzevvv` | Репозитории, issues, CI | `gh` в слоте, `GITHUB_ISSUES_TOKEN` в прод-секретах |

Факт для I01: VM2 — это не чистая машина. На ней уже лежит копия реального профиля (`users/vovako`) и `agent-data` с durable-tasks. Это одновременно и готовая заготовка эксперимента, и нарушение границы «в sandbox нет private профилей». Решение фиксируется до I01, а не после: либо VM2 очищается до пустого namespace, либо профиль удаляется, либо VM2 объявляется не-sandbox.

## 2. Карта secrets

`/home/vova/secrets.env` — EnvironmentFile сервиса агента на VM1, права 0600. Это единственный файл, который сервис читает при старте.

| Переменная | Что это | Sandbox-статус |
|---|---|---|
| `AGENT_SECRET` | Секрет между агентом и его клиентами | **нужен свой для VM2**, прод-значение не переносить |
| `OPENCODE_GO_API_KEY`, `OPENCODE_GO_API_KEYS` | Free-пул OpenCode Zen/Go | можно выдать sandbox-подмножество; см. §3 |
| `OPENCODE_MODEL`, `OPENCODE_PROFILE` | Выбор модели/профиля движка | копируются как config, не как секрет |
| `OPENROUTER_API_KEY` | Платный OpenRouter | **в sandbox не выдаётся**: free-only, paid fallback запрещён |
| `OPENAI_API_KEY`, `FAL_KEY`, `IDEOGRAM_API_KEY`, `RECRAFT_API_KEY` | Генерация изображений/медиа документов | только если стадия I03/I04 проверяет медиа-путь |
| `SERPER_API_KEY` | Поиск | sandbox-подмножество допустимо |
| `INN_DADATA_TOKEN`, `INN_DADATA_SECRET`, `INN_CHECKO_KEY` | Реестры компаний | нужны только для доменных сценариев с реальными данными |
| `CRED_ENCRYPTION_KEY` | Шифрование credential-хранилищ | **живёт только рядом с хранилищем, которое шифрует**; копирование ключа без данных бесполезно и опасно |
| `ZEROCREDS_ADMIN_TOKEN` | Управление выдачей форрм | sandbox-экземпляр или не используется |
| `GITHUB_ISSUES_TOKEN`, `CHECKLIST_API_KEY` | Внешние системы трекинга | на решение I09 (issue sink) |

Отдельного credential для **Google Cloud Storage нет вообще**: ни в `secrets.env`, ни в `~/.config/gcloud`, ни в token-store. Любая формулировка про «перенос профиля в GCS» сейчас не имеет запрашиваемого доступа. См. блокеры.

## 3. LLM: единственный честный free-путь

Проверенный факт (бенчмарк free-моделей): free-уровень OpenCode Zen/Go **работает только изнутри клиента opencode**. Прямой HTTP-запрос к нему возвращает `FreeTierError: can only be used from within OpenCode`. OpenRouter free — общий rate-limited пул, как основа не годится.

Следствия для Sandbox Plan:

1. Пункт «Fixed response/fault provider» для LLM нельзя закрыть внешним сервисом. Его реализует **наш собственный локальный stub** с детерминированными ответами и индуцированными сбоями — он и есть эмулятор.
2. Реальный free-smoke возможен только как `opencode run -m <provider>/<model>` **на машине, где установлен opencode**. На VM2 движка нет (`opencode`, `claude`, `codex` — MISSING; есть node/npm/git/rsync).
3. Ladder (`https://llm-ladder.trainedassist.store`) — отдельная точка входа; бенчмарку нужен `LLM_LADDER_TOKEN`, который живёт как GitHub org secret, а не в файле на VM. Для sandbox это binding, а не переменная прод-сервиса.
4. Детерминированные тесты (I00–I04, I07, I09) не должны зависеть от free-пула: rate limit там структурный, а не случайный.

## 4. Per-user и per-profile хранилища

| Что | Путь | Владелец |
|---|---|---|
| Сервисные токены по Telegram-id | `/home/vova/agent-tokens/<userId>/<service>` | пользователь; каталог 0700 |
| Профильные артефакты агента | `/home/vova/users/<profile>/.agent-home/agent-tokens/`, `…/contexts/` | профиль |
| Данные движка | `/home/vova/agent-data` | сервис агента |
| Релиз агента (что реально работает) | `/home/vova/agent-master` → `/home/vova/agent-releases/<sha>` | деплой |

В `/home/vova/agent-tokens` (~175 записей) лежат: `github`, `github-autofix-pat`, `gdrive`, `hh`, `weeek`, `telegram-bot-token`, `openrouter`, `dadata`, `gigachat`, `nalog`, `cloudflare`, `deepgram`, `namecheap`, `timeweb-creds`, `kinescope-*`, `tilda*`, `craigslist`, `publish-domain`, `getcourse` и другие. Это единая точка, где ищутся уже подключённые интеграции, — новый sandbox не должен начинать с нуля, но и не должен копировать этот каталог целиком: покопируются прод-токены.

Правило подключения нового sandbox-сервиса: binding = `<путь> + <имя переменной> + <владелец> + <процедура получения> + <дата ротации>`. Без последних двух пунктов binding считается недокументированным.

## 5. SSH-доступ

| Ключ | Путь | Куда |
|---|---|---|
| `vm_access` | `<profile>/.agent-home/.ssh/vm_access` | VM1, alias `vm` (`/etc/ssh/ssh_config.d/10-po-vm-access.conf`) |
| `vm2_ed25519` | `/home/vova/.ssh/vm2_ed25519` (только на VM1) | VM2, пользователь `root` |
| Публичные ключи | `authorized_keys` на VM1 и VM2 | — |

Временный доступ `vm` создан 28.09, чтобы обойти изоляцию слотов. Он сам по себе дыра: снятие — удалить ssh_config.d-фрагмент, ключ и строку в `authorized_keys`. Пока он жив, sandbox-приёмка не должна зависеть от него: fixture, который работает только через временный alias, не воспроизводим у другого человека.

## 6. Чего нет и что нужно создать

| Binding | Статус | Кто делает |
|---|---|---|
| Сервисный аккаунт к GCS-бакету | **отсутствует** | владелец: расшарить бакет на существующий VM-SA либо выдать отдельный ключ |
| Sandbox API key + scopes (C13) | отсутствует | работа I02A |
| Отдельный Telegram-бот для sandbox | отсутствует | владелец: @BotFather; **прод-токен бота на VM2 не переносить** (решение по #1808 Q-F) |
| Shell-доступ к RU VM | отсутствует | владелец; без него региональная приёмка I10 недоказуема |
| HH/CRM test-account режим | токены есть, режим не зафиксирован | I08: явно решить read-only test account |
| Отдельные Cloudflare bindings (Workers/KV/D1/R2) для sandbox | не созданы | I02B/I03: создать на отдельных именах, production bindings не наследовать |
| `LLM_LADDER_TOKEN` для sandbox | не выделен | владелец/админ org secrets |
| Локальный S3-совместимый backend (MinIO) для fixture | не установлен | I02B: поднимается как construction item |

## 7. Запреты, которые проверяет приёмка

- Прод-токены и прод-профили не копируются в sandbox. Snapshot исходников не равен копии секретов.
- Значение секрета не попадает в trace metadata, лог, issue, commit или этот репозиторий.
- Каждый sandbox-сервис имеет собственное имя endpoint, ключ и хранилище; пересечение с production проверяется явно, а не «по настройке».
- Ротация sandbox-секрета обязана быть безопасной для production: смена sandbox-ключа не должна требовать менять прод-ключ.
