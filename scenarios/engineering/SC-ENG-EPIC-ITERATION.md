# SC-ENG-EPIC-ITERATION: наблюдаемый цикл разработки

Target scenario для локального исполнителя [Epic #253](https://github.com/trained-assist/trained-agent-architecture/issues/253).
Акторы: оператор, controller, builder, verifier, независимый reviewer. Researcher/integrator
подключаются при конкретной гипотезе или межрепозиторной проверке. Основание — опыт
[playbooks #153](https://github.com/trained-assist/software-engineering-playbooks/issues/153)
и [anti-spin #137](https://github.com/trained-assist/software-engineering-playbooks/issues/137).
Acceptance record — [PR #263](https://github.com/trained-assist/trained-agent-architecture/pull/263).
[PR #258](https://github.com/trained-assist/trained-agent-architecture/pull/258) — исходный controller baseline.

## Trigger и результат

Оператор возобновляет согласованную цель с requirements revision, явной задачей, target
SHA, критериями и ограничениями. Controller запускает свежую сессию с общими короткими
правилами, одним role overlay и task packet. Он не повторяет фиксированный парад ролей
без новой задачи. Независимые workspaces обязательны для одновременных writers;
этот launcher исполняет роли последовательно и не создаёт multi-agent workflow engine.

Builder сохраняет изменение/evidence; verifier отдельно проверяет реальный пользовательский
путь на exact versions; reviewer проверяет frozen requirements/diff/evidence. Название роли
не доказывает другую model family. Если actual model metadata или независимое evidence
недоступны, результат inconclusive; недоступный reviewer не считается согласием.

Heartbeat подтверждает живость. Meaningful progress требует новых content-addressed
artifacts, изменённого source SHA либо проверенного критерия/отрицательного эксперимента
с сохраняемым evidence. Изменение времени, iteration ID или текста отчёта не считается
прогрессом. После первого no-progress нельзя повторять тот же срез; допускается явная
bounded diagnostic/replan задача. Второй no-progress останавливает автоматический цикл.
Ожидание внешнего события не увеличивает stagnation counter.

## Отказы, остановка и доставка

Harness failure отличим от product failure и incomplete acceptance. Invalid harness
не даёт метрик качества и не позволяет принять продукт. Internal PASS/exit 0/merge/health
endpoint не доказывают пользовательский результат. Delivered связывает requirements
revision, source/tested/installed revisions, настоящий CLI/UI outcome и независимый review.
Для multi-repo flow фиксируются все participating revisions; mismatch удерживает delivery.

Operator stop запрещает следующие запуски, в том числе после restart. Ограничения числа
сессий и длительности хранятся в controller state и не сбрасываются новым процессом.
Deadline или исчезновение executor переводят состояние в unknown/reconcile; внешние эффекты
не повторяются вслепую. Status доступен без запуска модели: phase, role, session ID, deadline,
last evidence/progress, budget, stop reason и следующий action. Raw transcript остаётся приватным.

Canonical runtime state — существующий private state-dir controller; GitHub остаётся
источником requirements/status projection. Изменение launcher не объявляется rollout
playbook epic-delivery и не создаёт второй task store. Production promotion сохраняет
owning Environment Contract; подготовка цикла не запускает его на реальных проектах.

## Acceptance scope

Semantic gate связывает сценарий с #253/#153/#137. Local component/replay E2E используют
fake CLI и synthetic artifacts: fresh roles, stale verdict/version mismatch, failed harness,
повтор отчёта, negative experiment, waiting condition, durable session budget, stop/restart
и unknown outcome. Native OpenCode→gateway acceptance A и опубликованные consumer versions
требуют отдельных live runs; local controller evidence их не закрывает.

## Local evidence

Controller replay suite покрывает две итерации с одинаковым evidence и одну bounded
diagnostic; цикл остаётся STAGNATED и не запускает третью сессию. Проверены persistent
stop, deadline→reconcile, восстановление бюджета после handoff import, checkpoint/status,
новый code diff, negative experiment, frozen reviewer checkout и delivery gate с drift,
невалидным harness и неизвестной model family. Это local/synthetic component + CLI replay,
без live model/provider, без изменения работающего legacy executor.
