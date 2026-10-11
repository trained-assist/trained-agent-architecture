# SC-OPS-QA-01 — QA проверяет новую функциональность в свободной sandbox-линии

Статус: target behavior. Связанные контракты: [Configuration and Recovery](../../contracts/CONFIGURATION-RECOVERY-CONTRACT.md), C01–C04. Реализация registry/discovery: [Sandbox Lanes](../../contracts/SANDBOX-LANES.json) и `tools/discover-sandbox-lanes.mjs`.

## Цель и актор

QA-инженер проверяет новую функциональность на реальной, свободной sandbox-линии и получает воспроизводимое evidence, не мешая другому E2E и не выбирая среду по догадке.

## Prerequisites

- Изменение имеет implementation revision и Environment Contract.
- Registry содержит выбранную линию и её цепочку gateway → CP → Runner.
- Автоматический scenario harness умеет создать уникальный marker, собрать gateway/CP/Runner evidence и выполнить declared cleanup.

## Flow

1. QA запускает read-only discovery. Линии со всеми declared Workers получают `known`; прочие Workers остаются `unclassified`.
2. QA выбирает line, которую пользователь/оператор назначил для проверки, и читает её occupancy probe. Active/nonterminal state или shared-state group блокируют выбор только при фактическом конфликте.
3. QA записывает claim с laneId, revision, marker, временем и reset procedure.
4. QA запускает автоматический harness. Он проверяет readiness каждого звена, отправляет один marker и коррелирует его с durable receipt, task/run IDs, terminal outcome и delivery.
5. Harness сохраняет sanitized evidence: target, revisions, marker hash, IDs, status transitions, outcome и final occupancy. Секреты, bot token и пользовательский текст не сохраняются.
6. Harness выполняет declared cleanup только после terminal outcome и подтверждает пустое/ожидаемое final state. QA публикует release.

## Expected result

Новая функциональность считается проверенной только если автоматический scenario получил ожидаемый observable result и evidence на всех затронутых границах. `health`, deployment success, manual tail или локальный test сами по себе не заменяют E2E.

## Failure paths

- `unclassified` Worker: не выбирать автоматически; добавить registry entry отдельным изменением.
- `unknown` execution: не делать повторный execution; сохранить evidence и выполнить reconciliation.
- Active shared state: выбрать другую назначенную линию или дождаться terminal outcome; не очищать чужое state.
- Harness не покрывает изменённую границу: это Sandbox Gap; добавить автоматический probe до заявления о verification.

## Acceptance

Gate 1: implementation соответствует этому scenario. Gate 2: component probes проходят. Gate 3: автоматический harness проходит на declared sandbox; production smoke возможен только после штатного promotion path.
