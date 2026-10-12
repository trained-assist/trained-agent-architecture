# Continuous development — Epic #253

Локальный контроллер исполняет restart contract [Epic #253](https://github.com/trained-assist/trained-agent-architecture/issues/253).
Он восстанавливает уже согласованное поведение: один writer, durable intent, проверенный handoff,
отдельные статусы шага и Epic, остановка при неизвестном исходе. GitHub issues/PRs остаются
источником статусов; runtime JSON хранится вне Git. [Review](../../docs/reviews/EPIC-253-DEVELOPMENT-PROCESS-2026-10-12.md)
объясняет найденные причины drift и незакрытые integration gaps.

## Environment Contract

Target — локальная macOS/Linux среда с Python 3.10+, Git и проверенной сборкой OpenCode.
Implementation executor запускается локальным CLI; MCP acceptance probe по-прежнему
запускается через Session Manager по [probe contract](references/opencode-probe.md). Эти два запуска имеют разные IDs.
CLI получает prompt через stdin: credentials и полный prompt не попадают в argv.
Выбор provider/model/бюджета и isolated project config нужно проверить до запуска.
Контроллер не переключает глобальные настройки OpenCode.

Для одного Epic все операторы используют **один и тот же state-dir**. Advisory file lock
защищает этот каталог; другой каталог/машина требует отдельной внешней координации.
Каталог имеет режим 0700, JSON 0600; umask 077 защищает новые logs. Raw JSONL может содержать
tool output и хранится приватно. Не публиковать его без redaction. Reset удаляет только
завершённые собственные fixtures; runtime state нельзя стирать ради обхода блокировки.
Нет cloud deploy, migrations или production promotion в самом контроллере.

## Первичная подготовка и запуск

Сначала сверить Epic/comments и реальные PR merge/reviews/CI, проверить checkout и текущего
writer. Составить JSON handoff по [формату handoff](references/handoff-format.md), с полным head_sha и
доказательствами выбранного шага. Неподтверждённый этап не объявлять DONE. Пустой state-dir
сам по себе не разрешает начать план заново. Import не запускает модель.

```sh
python3 tools/continuous-dev/controller.py \
  --state-dir "$HOME/.local/state/trained-assist/epic253" \
  --import-handoff /absolute/private/reconciled-handoff.json

python3 tools/continuous-dev/controller.py \
  --state-dir "$HOME/.local/state/trained-assist/epic253" \
  --cwd /absolute/verified/execution-checkout
```

`--loop` продолжает готовые шаги с интервалом `--interval` (по умолчанию 300 секунд).
Каждый шаг получает свежий контекст, iteration_id и компактную карточку запуска. Assistant должен
закончить ответ `<HANDOFF>{JSON}</HANDOFF>`. CLI `type=text` и SDK
`message.part.updated/properties.part` поддерживаются; tool output исключён из extraction.
Старый YAML handoff отвергается. Ненулевой exit или отсутствие валидного JSON сохраняет
прежний handoff и переводит active.json в NEEDS_RECONCILE; следующий executor не запускается.

WAITING_CI/WAITING_REVIEW/IN_REVIEW/BLOCKED останавливают цикл. Существующий внешний
timer/webhook должен делать небольшой read-only GitHub check и импортировать reconciled
handoff только после изменения фактов. В этом контроллере нет автоматического GitHub poller;
он не тратит новую LLM сессию на неизменившуюся очередь. DONE завершает строку backlog,
а `epic_complete=true` останавливает Epic только с A/B/C PASS evidence.

## Формат контекста запуска

[Постоянный prompt](system-prompt.md) содержит только общие правила. В handoff записывается
`next_task`: один step, goal, непустые acceptance assertions, references и prerequisites.
Target repo/checkout/branch/full SHA наследуются из handoff только для того же repository;
для другого repo задаются явно. Для другой среды next_task содержит sandbox. После DONE
next_task должен указывать новый step. Старый handoff можно импортировать, но до добавления
явной задачи launcher отказывается от запуска: ссылка на весь Epic не заменяет выбор работы.

Карточка содержит выбранную задачу, краткое предыдущее состояние, environment/probe state,
execution cwd и абсолютные ссылки на полный handoff и подробные инструкции. История, test
outputs и весь Epic не копируются. Полный handoff сохраняется без потерь вне Git. Подробности
читаются по необходимости: [sandbox/integration](references/engineering.md),
[OpenCode](references/opencode-probe.md), [GitHub](references/github-workflow.md),
[output schema](references/handoff-format.md). Файлы instructions версионируются вместе с кодом.

Перед spawn контроллер read-only получает метаданные selected issues/PRs, latest checks/statuses
на их head SHA и review states. Все страницы checks/reviews/statuses обрабатываются; raw bodies,
transcripts и API payloads в prompt не передаются. Snapshot содержит checked_at и links, не
утверждает acceptance или branch-policy approval. Источник credentials: GH_TOKEN/GITHUB_TOKEN,
затем default GitHub Keychain item из инструкций проекта; секрет используется только в памяти.
При failed fetch указан PARTIAL/UNAVAILABLE и агент обязан проверить факты самостоятельно.
`--offline` пропускает prefetch и явно маркирует snapshot NOT_FETCHED.

Сгенерированная карточка сохраняется в private `launch-<iteration>.json` до spawn; active.json
содержит prompt_characters и digest. Task ограничен 5000 символами, prompt — 12000: oversized
контекст отвергается с просьбой вынести детали в references, без обрезания критериев. Это
ограничения символов, а не tokenizer estimate. Перемещение текста в файл не экономит контекст,
если агент всё равно читает его целиком; инструкции предписывают выборочное чтение.

## Авария и перенос со старого контроллера

active.json сохраняет intent до spawn, PID сразу после spawn, heartbeat, CLI session ID,
private log path и prompt digest. После аварии STARTING/RUNNING/NEEDS_RECONCILE не снимаются
по таймеру: PID/Session Manager session, PR/deploy/key-issuance effects проверяются оператором.
PID может быть переиспользован; наличие процесса трактуется консервативно. Проверить также
запущенный acceptance probe: UNKNOWN/STARTING/OBSERVING блокирует новую implementation сессию.

После доказанного завершения executor и reconcile side effects:

```sh
python3 tools/continuous-dev/controller.py \
  --state-dir "$HOME/.local/state/trained-assist/epic253" \
  --import-handoff /absolute/private/reconciled-handoff.json \
  --reconcile-iteration <iteration_id-from-active.json>
```

Старый `/trained-agent-architecture/continuous-dev/controller.sh` обнаруживается по process
table: новый launcher отказывается от adoption, пока старый работает. Перед переключением
остановить только дальнейшие запуски старого scheduler, дать текущей сессии закончиться,
проверить effects и импортировать состояние. Не запускать новый loop параллельно. Правки
versioned controller не меняют уже работающий старый процесс и не активируют новую модель.

## Verification

```sh
python3 -m unittest discover -s tools/continuous-dev -p 'test_*.py' -v
```

Изолированный fake OpenCode принимает реальный stdin и выдаёт CLI JSONL. Проверяются
успешный цикл, ненулевой exit, потерянный/невалидный handoff, tool-output spoof, restart
после crash intent, настоящий file lock, unresolved probe и adoption при живом executor.
Packet tests проверяют сохранность task criteria, исключение history/logs из prompt,
отказ от запуска без next_task, pagination GitHub metadata и явный unavailable status.
Это local controller component/E2E evidence; оно не закрывает OpenCode→gateway milestone A.
