# Agent Runner: граница для выделения из core

Статус: нормативная граница Agent Runner. Реализационные evidence и deployment readiness фиксируются в owning issues/Environment Contracts и не выводятся из этой спецификации.

## Названия

**Agent engine** — Claude Code, Codex или OpenCode, то есть программа, исполняющая агентский цикл. **Run/attempt** — один её запуск. **Agent clean room** — изолированная среда доступа. **Execution slot** — арендуемая ёмкость хоста; сейчас непривилегированный Unix-пользователь ta-agent-N. **Agent Runner** — инфраструктурный компонент, который создаёт среду, запускает engine, наблюдает его и очищает ресурсы.

Это разные сущности. Отдельного уникального инфраструктурного термина «агент внутри среды» не требуется: это agent process в agent clean room. Clean room может быть реализован без контейнера; свойства границы должны быть проверены для каждого движка и tool.

## Runtime ownership and deployment boundary

Runner API — serverless Cloudflare Worker: он авторизует admission, сохраняет durable receipt/status и выбирает execution worker по trusted policy. API Worker не размещается на execution VM и не запускает длительный agent process.

Для обычного Telegram Agent Run default execution worker — существующий worker во Франции. Он создаёт clean room, запускает engine, наблюдает процесс, сохраняет разрешённые результаты и очищает ephemeral ресурсы. Runner API обращается к нему через worker adapter; CP обращается только к Runner API и не получает физические адреса/секреты worker или launcher. GHA не является автоматическим fallback.

Состав deployment, endpoint и live readiness фиксируются в Environment Contract owning repository и issue evidence. Этот документ задаёт target boundary, а не утверждает, что конкретная версия API/worker развёрнута или принята.

## Рекомендация по репозиторию

Runner lifecycle/worker implementation belongs to [trained-assist/ai-agent-runner](https://github.com/trained-assist/ai-agent-runner); the serverless Cloudflare admission/placement API is its public boundary. Component code and live readiness are separate facts: consult the owning issues and Environment Contract. The retired `trained-assist-execution-runtime` name is not an additional service. Task ownership remains distributed across Input/Output, Task Router and GTD according to the [system architecture](../ARCHITECTURE.md).

| Остаётся в core/control plane | Выходит в execution runtime | Живёт отдельно |
|---|---|---|
| Task/session/project IDs, durable plan и acceptance | Clean room/slot lifecycle, engine adapters и process supervision | Gateways и channel renderers |
| Admission, logical leases и task budgets | Resource limits, local capacity и heartbeat | Profile/artifact storage |
| GTD, scheduler и delivery coordination | Materialize/export/cleanup исполнение по storage contract | Domain tools, playbook registry |
| Выбор разрешённой policy/region/engine | Проверка host capability и исполнение resolved RunSpec | Credential broker и LLM gateway/ledger |

Runner не решает, какой бизнес-результат нужен, не создаёт GTD продолжения и не владеет Telegram messages. Profile storage владеет permanent data, runtime лишь материализует их локально. Credential broker владеет secrets; runtime получает минимальные bindings.

## Минимальный логический API

- startAttempt(RunSpec, operationId) → accepted attempt receipt. Повтор совместимого operationId возвращает ту же attempt; несовместимый payload — conflict.
- cancelAttempt(attemptId, ownerGeneration) → cancel requested; stopped приходит отдельно.
- getAttempt(attemptId) → current state + last heartbeat + persisted result refs.
- event stream/replay → sequence, attempt state, exit reason, export/cleanup status.
- capabilities/health → supported engines, isolation modes, region, capacity, readiness.
- reconcile → перечень фактических процессов/attempts и состояния восстановления для control plane.

Текущий транспорт выделенного Runner — authenticated HTTP Serverless Agent API; control plane уже имеет RunnerApiAdapter. Внутренний вызов library допустим для тестов, но own-API dogfood и gateway integration проходят тот же публичный контракт.

## Этапы выделения

1. Зафиксировать RunSpec/events, границы ownership и совместимость без переноса кода.
2. Выделить library + fake runner adapter и прогнать одинаковые lifecycle сценарии на legacy и новом adapter. Core остаётся владельцем durable task state.
3. Извлечь реальные engine/process/clean room компоненты. Проверить stop, child cleanup, краш при export, отсутствующие creds и каждый движок. Не сохранять незаявленный privileged fallback.
4. Подключить worker API/leases, если требуется remote execution. Проверить потерю worker, повтор start, поздние events и fencing; не запускать один task двум независимым schedulers.
5. Добавить snapshot/commit/cleanup и remove legacy path после rollout evidence.

Граница репозитория уменьшает связанность только если runtime не импортирует внутренние модули core напрямую. Связь через versioned contract/adapter. Выделение не должно превращаться в копирование существующего runner с собственной второй БД задач.


## Уточнение терминов владельцем — 30.09.2026

Публичный термин среды — **Agent clean room**. Это целевое имя, не название используемого фреймворка. **Agent run** — одна попытка выполнения: процесс движка и его дочерние процессы. **Agent Runner** — компонент управления жизненным циклом запуска. Технический slot в текущем коде — не процесс, а эксклюзивно арендуемый Unix user из пула; он существует до запуска и используется повторно. В архитектурном описании называем это **арендой ресурса исполнения**; текущие AGENT_SLOT_* и имена файлов не переименовываются этой правкой.

Clean room означает изоляцию доступа и целевой цикл загрузки/сохранения/очистки. Полная очистка пользовательских данных ещё не реализована текущим T0: постоянный профиль и .agent-home сохраняются.


## Область Agent Runner по типам Job

Agent Runner и Agent clean room отвечают за **ai-agent-job**. **llm-recipe-job** получает подготовленный input и возвращает output без tools и доступа к пользовательскому filesystem. **deterministic-job** выполняет заранее заданный код в обычном worker с явными правами. Общий control plane может планировать все типы; Agent Runner не обязан становиться универсальным исполнителем всей платформы. [Типы Job и исключение для недоверенного кода](../TERMINOLOGY.md#типы-job--решение-владельца-30092026).
