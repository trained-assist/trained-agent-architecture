# Sandbox — где лежат креды и как к ним достучаться

Draft v1 · 30.09.2026. Companion к [SANDBOX-PLAN.md](SANDBOX-PLAN.md): инвентарь уже привязанных
доступов, чтобы новая сессия (после `/clear` / compaction) восстанавливала контекст из этого файла,
а не из истории чата.

**Правило:** значения секретов сюда не попадают — репозиторий публичное. Здесь только имена,
пути и механизм чтения. Токен «где лежит» ≠ токен «какой он».

## Инвентарь

| Что | Где лежит (значение) | Как читать | Статус |
|---|---|---|---|
| Тестовый TG-бот sandbox (`@probability_cat_bot`, без webhook и пользователей) | GCP Secret Manager `SANDBOX_TEST_BOT_TOKEN` (проект `alesa-personal-assistent`) + живой копией в env sandbox-VM как `TELEGRAM_BOT_TOKEN` | `gcloud secrets versions access latest --secret=SANDBOX_TEST_BOT_TOKEN --project=alesa-personal-assistent`; на sandbox-VM — файл env | ✅ 2026-09-30, `getMe` проверен |
| Контакт sandbox-VM (IP, user, расположение ключей) | GCP Secret Manager `SANDBOX_VM2_SSH` + локальный инвентарь `accounts-access` (Mac, git без remote) | `gcloud secrets versions access latest --secret=SANDBOX_VM2_SSH` | ✅ 2026-09-30 |
| SSH-ключ sandbox-VM | каноническая копия — на прод GCP VM `…/.ssh/vm2_ed25519` (комментарий `vm1-to-vm2`); копия на Mac `~/.ssh/trained-assist-vm2_ed25519`, alias `vm2` в `~/.ssh/config` | `ssh vm2` (с Mac и с прод VM); key-only, пароль отключён, fail2ban+ufw | ✅ вход проверен с обеих сторон |
| `AGENT_SECRET` sandbox | только в env sandbox-VM — **намеренно другой** от продового | env-файл sandbox-VM, mode 600 | ✅ |
| Форма секретов на не-GCP хосте | `SECRETS_SOURCE=env` → env-файл на хосте (у sandbox-VM нет ADC, Secret Manager недоступен) | — | ⏳ постоянный env-manifest — эпик #1789 P1 |
| GitHub Actions secrets (`VM_SSH_KEY`, `TELEGRAM_BOT_TOKEN`, …) | репозиторий trained-assist-agent → Settings → Secrets | `gh secret list --repo trained-assist/trained-assist-agent` | ✅ |
| Cloudflare (Workers/KV/D1/R2, зона) | wrangler OAuth локально; `CF_API_TOKEN` — в GH secrets (tg-bot, llm-ladder) | `npx wrangler whoami` | ✅ R2-права проверены 2026-09-30: тестовый бакет создан и удалён (`wrangler r2 bucket create/delete`) |
| Прод-секреты (токен боевого бота, OpenRouter, OpenCode Go, …) | GCP Secret Manager, тот же проект; продовые env на GCP VM | `gcloud secrets list / versions access` | ✅ — **на sandbox-VM не класть** (см. правила) |
| LLM для sandbox (`service-llm` → llm-ladder) | GCP SM `LLM_LADDER_TOKEN`; на sandbox-VM продублирован в env + файл `$AGENT_TOKENS_DIR/llm-ladder/token` (mode 600) | POST `/v1/chat/completions` у `https://llm-ladder.trainedassist.store`, `model: deepseek` (основная лестница) или `free-ladder` (free-only профиль, без paid fallback) | ✅ проверено вызовом **из sandbox-VM** 2026-09-30 — обе модели отвечают |
| ~~Ключи моделей: 1× OpenCode Go + 2× OpenRouter для sandbox~~ | **не нужны** — все service-LLM-вызовы идут через llm-ladder (собственные ключи лестницы у воркера) | — | ✅ снято с повестки 2026-09-30 (решение владельца: лестница работает) |
| Решения Q-D/Q-E/Q-F (что едет с профилем, бэкенд архивов, P4-роутинг бота) | issue #1808 (trained-assist-agent) | `gh issue view 1808` | ⏳ открытые — без них боевые секреты на вторую VM не ставим |
| Известные дыры `scripts/setup.sh` (Node, скил-репо, секреты, пер-хост identity) | issue #1879 (trained-assist-agent) | `gh issue view 1879` | ⏳ открытые |

## Механизмы доступа — как это работает

- **GCP Secret Manager** — основной store для GCP-стороны. Локально: `gcloud` под аккаунтом с
  `owner` проекта. Агенты на GCP VM: default service account имеет `roles/secretmanager.secretAccessor`,
  читают через metadata-server (`gcloud secrets versions access …` или REST + token).
- **Sandbox-VM (не-GCP)**: ADC нет → все её секреты живут в env-файле на самом хосте
  (`SECRETS_SOURCE=env`), mode 600. Это осознанный фоллбек, а не забытый механизм.
- **GitHub secrets** — для CI/deploy; синхронность со списком держит `infra/env-manifest.json`
  + `node scripts/check-env-sync.js` (запускается в CI).
- **SSH**: одна ключ-пара на машину, отдельные файлы на каждой стороне (см. таблицу),
  никаких паролей.
- **LLM**: sandbox не хранит собственных ключей моделей — только общий токен llm-ladder;
  различение вызовов идёт по заголовкам `x-ladder-app` / `x-ladder-run` (worker пишет их в D1).

## Правила безопасности sandbox

1. **Значения секретов и IP адреса в этот репозиторий не пишем** — только имена и пути.
2. **Токен прод-бота на вторую VM не ставить до wave-3 / роутинга** (#1808 Q-F): иначе один бот
   отвечал бы с двух машин. Тестовый бот (`@probability_cat_bot`) создан ровно для того, чтобы
   sandbox мог проверять доставку, не трогая прод.
3. **Sandbox-креды ротируются свободно** — они не влияют на прод и наоборот.
4. После привязки нового креды — дописать строку в инвентарь выше в тот же PR/коммит,
   чтобы таблица не расходилась с реальностью.
