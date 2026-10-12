# Continuous development — Epic #253

Локальный контроллер исполняет restart contract [Epic #253](https://github.com/trained-assist/trained-agent-architecture/issues/253).
Он восстанавливает уже согласованное поведение: один writer, durable intent, проверенный handoff,
отдельные статусы шага и Epic, остановка при неизвестном исходе. GitHub issues/PRs остаются
источником статусов; runtime JSON хранится вне Git. [Review](../../docs/reviews/EPIC-253-DEVELOPMENT-PROCESS-2026-10-12.md)
объясняет найденные причины drift и незакрытые integration gaps.

## Environment Contract

Target — локальная macOS/Linux среда с Python 3.10+, Git и проверенной сборкой OpenCode.
Implementation executor запускается локальным CLI; MCP acceptance probe по-прежнему
запускается через Session Manager из system prompt. Эти два запуска имеют разные IDs.
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
writer. Составить JSON handoff по [system prompt](system-prompt.md), с полным head_sha и
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
Каждый шаг получает свежий контекст, iteration_id и предыдущий JSON. Assistant должен
закончить ответ `<HANDOFF>{JSON}</HANDOFF>`. CLI `type=text` и SDK
`message.part.updated/properties.part` поддерживаются; tool output исключён из extraction.
Старый YAML handoff отвергается. Ненулевой exit или отсутствие валидного JSON сохраняет
прежний handoff и переводит active.json в NEEDS_RECONCILE; следующий executor не запускается.

WAITING_CI/WAITING_REVIEW/IN_REVIEW/BLOCKED останавливают цикл. Существующий внешний
timer/webhook должен делать небольшой read-only GitHub check и импортировать reconciled
handoff только после изменения фактов. В этом контроллере нет автоматического GitHub poller;
он не тратит новую LLM сессию на неизменившуюся очередь. DONE завершает строку backlog,
а `epic_complete=true` останавливает Epic только с A/B/C PASS evidence.

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
Это local controller component/E2E evidence; оно не закрывает OpenCode→gateway milestone A.
