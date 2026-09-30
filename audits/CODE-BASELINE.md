# Code baseline: подтверждённая реализация и ограничения

Снимок проверки исходников · 30.09.2026. Это локальная справка по существующему коду, не альтернативная архитектура. Актуальная целевая модель — [ARCHITECTURE.md](../ARCHITECTURE.md). VM, фактические runtime настройки и rollout этой проверкой не подтверждены.

Проверены исходники и документы следующих репозиториев на конкретных ревизиях:

| Репозиторий | Ревизия |
|---|---|
| trained-assist-agent | `c83e6931d61ddb205779ee670e4c4c59b26580eb` |
| trained-assist-tg-bot | `b3b703fa3271a3b739bcf315ebf7d247a33c7dc7` |
| trained-assist-web | `be33bc0bce082693eaadc5b70e8ee78562d2dd8c` |
| software-engineering-playbooks | `bf9fd8845d9bea8938dc1b6e5f0f99a5e462243e` |
| trained-assist-llm-ladder | `9907dcb6b27307450bdfc826f67dd5490283d2c8` |

`trained-assist-engineering` переименован в `software-engineering-playbooks`. GitHub вернул для `Deploy-Playbooks/serverless-ai-agent-run` состояние пустого репозитория. Его прежний скачиваемый архив в эту проверку не вошёл. Проверка не включает доступ к VM, актуальные переменные окружения, фактический rollout и запуск тестов. «Есть в коде» не означает «включено в проде». «Не найдено» относится к просмотренным источникам.


## Ограничения найденного кода

### Изоляция T0 не равна целевому clean room

Документ T0 описывает опциональный rollout; `prepareEngineSpawn` в коде явно исключает Codex и cwd вне профиля из run-as. Там остаются env allowlist и bridge, но процесс работает с правами сервисного пользователя. В документации утверждение о fail-closed setup относится к ошибкам настройки и не отменяет этих исключений. Для архитектурных решений приоритет имеет реальный путь исполнения.

MCP servers работают как service user. Поэтому граница должна охватывать доступ инструментов к файлам/сети: изоляция CLI не ограничивает автоматически привилегированный MCP tool. Необходимо определить, что clean room может делать напрямую и что только через broker.

### Постоянный профиль сейчас является рабочей директорией

Запуск получает доступ к постоянному профилю, `.agent-home` сохраняется между запусками. В профиль попадают native state, engineering worktrees/mirrors и другие runtime-файлы. Это отличается от цели «в постоянной папке только текст и ссылки».

Флаг `GCS_WORKSPACE_SYNC` присутствует в логике mode bits, но сам по себе не доказывает реализованный перенос данных между машинами. Общий протокол snapshot → run → commit → cleanup в просмотренных исходниках не найден.

### Локальное single-owner не решает ownership между VM

`execution-owner-lock.js` удерживает SQLite-транзакцию, чтобы второй процесс не стал execution owner того же локального data root. Это полезная локальная гарантия. Для двух VM с независимыми SQLite она не исключает выполнение одной логической задачи обоими хостами.

Предлагается фиксировать task/run owner, lease expiration и fencing generation в авторитетном durable-состоянии. Новый владелец получает новое поколение; записи и результаты старого владельца отвергаются. Конкретный storage и механизм ещё не выбраны. Общий object bucket нельзя считать межмашинным transactional task store.

### Повтор попытки не должен повторять неизвестную внешнюю мутацию

Если сервис упал после отправки письма, создания PR или платежа, отсутствие локального ACK не означает отсутствие внешнего эффекта. При поддержке провайдера нужен idempotency key; иначе перед повтором требуется сверка внешнего результата либо состояние `needs_review`. Нельзя обещать exactly-once для произвольного стороннего API.

### Регион исполнения не равен региону каждой операции

Текущий TG router использует RU capabilities и aliases в тексте, а `forceRu` может напрямую выбрать RU. Он не реализует общий запрет Claude/Codex в RU. Web использует свой настроенный backend URL. Fallback между движками также должен заново проверять placement.

При комбинации «Claude вне RU + инструмент только с RU IP» возможен EU run с RU tool worker. Разрешён ли перенос входных данных между зонами — отдельное решение владельца. OpenCode как CLI не гарантирует доступность любой выбранной модели из RU.

### Наблюдаемость ещё не подтверждает полный учёт денег

В llm-ladder есть D1 row per call, attempts и nullable token usage; streaming usage этим logger не сохраняется. Идентификаторы необязательны. `service-llm.js` в просмотренной версии не передаёт `x-ladder-*` headers. В D1 schema отсутствует поле денежной стоимости.

Владелец сообщил, что LLM Ledger уже существует. Его отдельная реализация и полнота доставки в него этой проверкой не установлены. Нельзя считать найденный ladder trace доказательством покрытия всех Claude/Codex/OpenCode, Gemini, service calls и повторов.

### «Полный журнал» сейчас имеет ограничения

`session-trace-store.js` сохраняет поток OpenCode best-effort, ограничивает файл 4000 событиями и удаляет нетронутые файлы после 7 дней. Claude/Codex туда пока не пишут. Это рабочий fallback, но не гарантированный полный долговременный журнал.

### Credentials имеют разные правила приоритета

Registry — CI/migration contract, а не runtime resolver. Он сам документирует различия приоритетов readers. Например, `github-token.js` для issue-fixer сначала берёт platform env, затем GH_TOKEN, затем personal file. Это не обязательно правильный порядок для пользовательского playground.

Без `CRED_ENCRYPTION_KEY` store пишет plaintext с предупреждением. T0 передаёт некоторые credentials непосредственно движку; Codex auth writeback описан как last-writer-wins. Требуются явная политика разрешения credentials и отдельное владение refresh/rotation; нельзя копировать все секреты в clean room.


## Pinned sources

Все ссылки привязаны к проверенной ревизии, чтобы документ можно было перепроверить после изменений.

- [T0 isolation и ограничения](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/docs/agent-process-isolation.md)
- [Реальные исключения run-as](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/runner/engine-isolation.js)
- [Slot/env implementation](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/agent-isolation.js)
- [Пути и виды состояния](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/data-paths.js)
- [Локальный execution owner](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/execution-owner-lock.js)
- [GTD controller](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/gtd-controller.js)
- [Durable recovery](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/durable-recovery.js)
- [Recovery policy](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/recovery-policy.js)
- [Playbooks](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/docs/playbooks.md)
- [Playbook executor mapping](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/playbook-executor.js)
- [Concurrency contract](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/docs/architecture/channel-execution-concurrency.md)
- [TG router/client](https://github.com/trained-assist/trained-assist-tg-bot/blob/b3b703fa3271a3b739bcf315ebf7d247a33c7dc7/src/lib/agent-client.js)
- [TG durable outbox](https://github.com/trained-assist/trained-assist-tg-bot/blob/b3b703fa3271a3b739bcf315ebf7d247a33c7dc7/src/run-outbox.js)
- [Web gateway](https://github.com/trained-assist/trained-assist-web/blob/be33bc0bce082693eaadc5b70e8ee78562d2dd8c/worker.mjs)
- [R2 media lifecycle и rollout](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/docs/MEDIA-R2.md)
- [Credentials store](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/credential-store.js)
- [Credentials registry data](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/config/credentials.json)
- [GitHub credential precedence](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/github-token.js)
- [Session trace fallback](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/session-trace-store.js)
- [Service LLM client](https://github.com/trained-assist/trained-assist-agent/blob/c83e6931d61ddb205779ee670e4c4c59b26580eb/src/service-llm.js)
- [Ladder trace logger](https://github.com/trained-assist/trained-assist-llm-ladder/blob/9907dcb6b27307450bdfc826f67dd5490283d2c8/src/trace.js)
- [Ladder trace schema](https://github.com/trained-assist/trained-assist-llm-ladder/blob/9907dcb6b27307450bdfc826f67dd5490283d2c8/schema/ladder_calls.sql)
- [Engineering workspace boundary](https://github.com/trained-assist/software-engineering-playbooks/blob/bf9fd8845d9bea8938dc1b6e5f0f99a5e462243e/docs/WORKSPACE-LIFECYCLE.md)


## Более поздние уточнения проверки

Core input-router проверен на bbc0b91e503e65ede3adc0a87abf9bba59a1ad25: shadow classification не доказывает включённый universal LLM-first. HH cold search domain cron на 0a45af2e1173e3d2172f0d025fdd3f7fc100c2f4 поддерживает hourly interval, default 24h; enabled jobs на VM не проверены. Детали — [Task Router/MCP](../TASK-ROUTER-AND-MCP.md) и раздел текущей реализации общей архитектуры. Budget/provider selection не следует путать с типом Job.
