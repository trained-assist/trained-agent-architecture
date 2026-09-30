# External Integration Gate

Статус: актуальная спецификация External Integration Gate · 30.09.2026. Предлагаемое имя: trained-assist-integration-gate. Репозиторий и перенос кода пока не созданы этой спецификацией.

## Граница

Все ошибки и основные события выполняют [Observability contract](OBSERVABILITY-AND-ERROR-CONTRACT.md): зарегистрированный source, trusted profile для user-scoped operations, известный channel/destinationRef, IDs и retention. Async callbacks сохраняют correlation из bindings.

Gate связывает платформу с API и событиями внешних сервисов от имени разрешённого пользователя/организации: исходящие операции, входящие webhook, subscriptions, polling и delivery receipts. Он не маршрутизирует Job types, не запускает Agent Runner и не контролирует достижение цели.

С нашей стороны — небольшой versioned API. С внешней стороны — много provider adapters с разными lifecycle. Их изменения могут проходить независимо от core. Adapter protocol/connectivity живёт в Gate; recruiting/sales rules, prompts, playbooks и domain state остаются в доменном репозитории. Если домен уже содержит API adapter, извлекаем transport слой с совместимостью, не создаём две реализации.

## Контракт

| Операция | Вход | Выход |
|---|---|---|
| invoke | integrationBindingId, capability, typed payload/ref, operationId, scope, task correlation | receipt, result/error/unknown, externalOperationRef |
| subscribe / unsubscribe | binding, поддержанный event type, operationId | webhookSubscriptionId, actual lifecycle state |
| receive provider event | provider payload, проверенная подпись/средство auth, account resolution | durable inbox receipt, normalized eventId/providerEventId |
| reconcile | operationId / externalOperationRef | подтверждённый outcome либо всё ещё unknown |
| capabilities / readiness | authorized binding | поддержанные операции, enabled/disabled, auth health |
| polling action | binding, cursor, schedule occurrence | bounded result/events + next cursor |

Платформенная оболочка: schemaVersion, tenant/profile context, userTaskId если событие относится к задаче, gtdId только при регистрации контроля, eventId/causation и operationId. Gate не создаёт GTD по факту внешнего вызова. Независимое событие создаёт новую Task через Input по явной binding policy; callback существующей операции обновляет её состояние и не запускает вторую задачу случайно.

Знание ID не заменяет auth. Credential Broker разрешает account/scopes по binding; модель не может подставить произвольный principal. Секреты не копируются в payload, prompt или diagnostics. Native provider errors нормализуются с сохранённым приватным исходным ref.

## Надёжность и ошибки

Webhook: проверить → durable inbox + dedup → быстрый ACK → asynchronous dispatch. Тяжёлые данные хранятся как artifact refs. Rate limits, timeout, bounded retry/backoff и provider circuit state отдельны от бизнес-контроля GTD.

Исходящий effect: записать operationId → вызвать → сохранить receipt/outcome. Timeout после отправки означает unknown; reconciliation предшествует повторной мутации. Provider без idempotency API требует собственного reconciliation contract; обещать exactly-once внешнего effect нельзя.

Ошибки публикуются в общую observability через независимый durable event/outbox, откуда их читает [System Error Watcher](SYSTEM-ERROR-WATCHER.md). Доставка исходной ошибки пользователю и состояние задачи не ждут диагностики watcher.

## Разделение двух внешних API

External Integration Gate — адаптер к HH/CRM/provider APIs и callbacks. [Serverless Agent API](SERVERLESS-AGENT-API.md) — клиентский API запуска агента. Внешний клиент или watcher может отправить Task напрямую в Task API: ему не обязательно проходить provider Gate. Смешение этих входов снова превратило бы Gate в центральное ядро.

## Выделение

- [ ] Зафиксировать C10, normalized outcome и adapter versioning.
- [ ] Inventory существующих integrations: какие transport parts где находятся.
- [ ] Извлечь один adapter с прежним facade; одинаковые fixtures на старом и новом пути.
- [ ] Проверить auth expiry, webhook duplicates, provider timeout и outcome unknown.
- [ ] Подключить общие task/error events, затем удалить старую transport реализацию.

Инфраструктурные package/HTTP transport и hosting выбираются позже. Отдельный repo не требует немедленно отдельной VM. Не подтверждено наличие webhook для HH: capabilities объявляют только реально поддержанные provider operations.
