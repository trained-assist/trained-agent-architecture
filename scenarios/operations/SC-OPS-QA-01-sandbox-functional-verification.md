# SC-OPS-QA-01 — Новая функциональность остаётся проверяемой на sandbox-линии

Статус: target behavior. Связанные контракты: [Configuration and Recovery](../../contracts/CONFIGURATION-RECOVERY-CONTRACT.md), C01–C04. Реализация registry/discovery: [Sandbox Lanes](../../contracts/SANDBOX-LANES.json) и `tools/discover-sandbox-lanes.mjs`.

## Пользовательский SLA

Команда может проверить новую функциональность на реальной sandbox-линии и получить воспроизводимый результат по всем затронутым границам. При следующих изменениях тот же автоматический сценарий обнаруживает регрессию до promotion.

## Prerequisites

- Изменение имеет implementation revision и Environment Contract.
- Registry содержит выбранную линию и её цепочку gateway → CP → Runner.
- Автоматический scenario harness умеет создать уникальный marker, собрать gateway/CP/Runner evidence и выполнить declared cleanup.

## Проверяемый flow

1. QA запускает read-only discovery. Линии со всеми declared Workers получают `known`; прочие Workers остаются `unclassified`.
2. Автоматизация выбирает назначенную line и читает её occupancy probe, чтобы корректно интерпретировать результат при shared state.
3. QA записывает claim с laneId, revision, marker, временем и reset procedure.
4. QA запускает автоматический harness. Он проверяет readiness каждого звена, отправляет один marker и коррелирует его с durable receipt, task/run IDs, terminal outcome и delivery.
5. Harness сохраняет sanitized evidence: target, revisions, marker hash, IDs, status transitions, outcome и final occupancy. Секреты, bot token и пользовательский текст не сохраняются.
6. Harness выполняет declared cleanup только после terminal outcome и подтверждает пустое/ожидаемое final state. QA публикует release.

## Expected result

Новая функциональность считается проверенной только если автоматический scenario получил ожидаемый observable result и evidence на всех затронутых границах. `health`, deployment success, manual tail или локальный test сами по себе не заменяют E2E.

## Наблюдаемые failure paths

- `unclassified` Worker: automation сообщает, что topology не определена.
- `unknown` execution: evidence отражает неизвестный исход и reconciliation status.
- Active shared state: evidence отражает contention и его влияние на SLA.
- Harness не покрывает изменённую границу: результат проверки `UNCLEAR`; добавляется probe, который наблюдает требуемый SLA.

## Acceptance

Gate 1: implementation соответствует этому scenario. Gate 2: component probes проходят. Gate 3: автоматический harness проходит на declared sandbox; production smoke возможен только после штатного promotion path.
