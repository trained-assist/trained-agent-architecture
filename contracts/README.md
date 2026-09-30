# Контракты между сервисами

Статус: предложение для согласования · 30.09.2026. Это логические границы; пути API ниже иллюстративны и ещё не утверждены. Раздел не объявляет текущий wire protocol заменённым.

## Что называем контрактом

Контракт описывает обещания на границе крупных сервисов: кто вызывает кого, какой смысл имеют вход/выход и статусы, кто владеет состоянием, какие ошибки и повторы разрешены. JSON schema или HTTP endpoint — только часть контракта. Сценарий пользователя может пересекать несколько контрактов и репозиториев.

Каждый контракт содержит: producer/consumer, authority, request/event schema и version, authentication/scopes, acceptance/completion semantics, deadlines, retries/idempotency, ordering/concurrency, failure classes, наблюдаемость, compatibility и acceptance evidence. Секреты не передаются в trace metadata.

## Предлагаемые ключевые контракты

| ID | Граница | Обещание | Владелец состояния | Блоки |
|---|---|---|---|---|
| C01 | Gateway/API → Orchestrator | Надёжно принять нормализованный input один раз по requestId; выдать receipt | Orchestrator после durable ACK; gateway до него | A01/A02 |
| C02 | Orchestrator → Gateway/Web/API | Доставлять progress/result/error с адресом и порядком; replay после переподключения | Result/event store и delivery outbox | A01/A05/A11 |
| C03 | Gateway/Web/API → Orchestrator | Stop, supplement и status адресуют конкретную работу; не затрагивают соседние задачи | Orchestrator | A01/A02/A08 |
| C04 | Scheduler/Router → Execution runner | Разместить и выполнить одну attempt под проверенным lease и sandbox policy | Control plane владеет task/lease; runner локальным процессом | A02/A03/A06/A13 |
| C05 | Runner ↔ Profile/Artifact store | Загрузить snapshot; безопасно commit/export результат; очистить после подтверждения | Storage владеет версиями; run владеет временными данными | A04/A05 |
| C06 | Runner → Tool broker/domain service | Выполнить разрешённое действие с правильным principal; сохранить outcome мутации | Domain service владеет предметным состоянием | A03/A07/A12 |
| C07 | Tool/Runner → Credential broker | Разрешить credential по consumer/scope/региону без скрытого выбора аккаунта | Broker владеет secrets/refresh/rotation | A12 |
| C08 | Runner/service callers → LLM gateway + Cost ledger | Вызвать разрешённую модель и атрибутировать расходы всех попыток | LLM gateway владеет ladder health; ledger учётом; control plane budget | A07/A10 |
| C09 | Playbook registry/validators ↔ Orchestrator | Получить pinned методику и evidence проверок; принимать progress/completion через единый executor | Registry версиями; orchestrator экземпляром плана | A08/A09 |

## C01 — вход сообщений и заданий

**Цель:** Telegram, Web и будущие каналы используют общий смысл input, сохраняя особенности своего UX. Gateway отвечает за webhook/auth своего канала, сбор пачки, media refs и нормализацию; orchestrator — за task/session/project/admission. Канальный router не определяет бизнес-логику домена.

Предлагаемый envelope: `contractVersion, requestId, principalId, conversationRef, sessionId?, projectId?, inputItems[], artifactRefs[], requestedExecutionPolicy?, replyToRef`. Principal, endpoint и доступ к project/session выводятся из проверенной аутентификации, а не принимаются на доверии от модели. Для headless API conversationRef отсутствует; replyToRef может означать polling/webhook/storage target.

Receipt: `requestId, taskId, acceptedAt, durable=true`. ACK означает durable acceptance; не запуск, не завершение и не доставку ответа. Повтор того же requestId с тем же payload возвращает прежний receipt; другой payload с тем же ключом — conflict. Scope ключа включает проверенного вызывающего клиента/tenant, срок дедупликации объявлен. Потеря ACK допускает безопасную повторную доставку.

**Сейчас:** TG RunOutbox хранит FIFO и повторяет /run до matching durable ACK. Web имеет собственную делегацию в core. Это разные реализации, которые требуется сопоставить с общим контрактом, а не механически заменить одним transport.

**Приёмка:** lost ACK; duplicate request; payload conflict; media failure; параллельный Web и TG одного профиля; подмена principal; restart до и после ACK.

## C02 — события и доставка результата

Envelope: `eventId, taskId, runId?, sessionId?, sequence, type, occurredAt, replyToRef, payload, artifactRefs?`. События: accepted, queued, started, progress, attempt_failed, waiting, stopped, result_ready, task_failed, delivery_failed. Ошибка попытки не обязана быть ошибкой task; отсутствие прогресса не доказательство зависания.

Внутренний event store сохраняет порядок по task/session stream и поддерживает cursor/replay. Gateway рендерит события в Telegram, Web читает stream/polling; будущий канал не требует добавлять прямой sender в core runner. Delivery adapter подтверждает принятие события. Это не гарантия того, что человек прочитал сообщение. При отсутствии provider idempotency повтор внешней доставки может породить дубль; хранить provider message IDs и заявлять at-least-once честно.

`Execution completed`, `result persisted`, `task accepted by validators` и `delivered` — разные факты. Утеря связи с Telegram не должна повторять агентскую работу. Web reconnect воспроизводит сохранённый результат, включая завершение без открытой вкладки. Статус «успешно» не выдаётся до нужного commit/export.

**Приёмка:** завершение во время offline; повтор event; out-of-order delivery; невозможность отправить attachment; failure после внешней отправки до ACK; неправильный endpoint другого бота.

## C03 — stop/supplement/status

Command: `commandId, principalId, targetTaskId/sessionId, conversationRef?, action, payload?, expectedGeneration?`. На уровне UX Telegram может выбирать текущую задачу lane, но control plane сохраняет resolved target. Stop никогда не означает «убить все задачи профиля». Supplement явно определяет: добавить в текущую попытку, сохранить для следующей или создать follow-up; receipt сообщает принятый вариант.

Развести `stop requested` и `stopped`: второй статус подтверждается остановкой процесса/дочерних работ либо известным terminal outcome. Stop suppresses technical retries и GTD continuation той же работы. Фоновая задача другого проекта остаётся независимой. Mutations, уже завершённые снаружи, stop не откатывает автоматически.

**Сейчас:** есть scoped TG stop и нормативный lane/session writer contract. Единые wire names и поведение всех каналов ещё сверяются.

## C04 — placement и execution runner

Runner — исполнитель attempt, а не самостоятельный планировщик задач. Команды условно `startAttempt / cancelAttempt / getAttempt / reconcile`; events — claimed, materialized, started, heartbeat, exited, export_ready, cleanup_done.

RunSpec: `taskId, runId, attemptId, ownerGeneration, lease, principalRef, inputSnapshotRef, engine, resolvedExecutionPolicy, regionConstraints, resourceLimits, artifactPolicy, credentialRefs, toolCapabilities, deadline, traceContext`. CLI binary/config/provider release и разрешённые tools фиксируются доверенным host resolution; агент не выбирает host roots и не подделывает binding.

Router сначала исключает недопустимые зоны, затем проверяет capability/health/capacity. Claude/Codex — вне RU; OpenCode проверяется ещё по модели и tool requirements. Каждый fallback повторно проходит policy. Требование RU-only tool + EU-only engine решается отдельным tool worker, только если data policy допускает такой обмен; иначе placement conflict.

Control plane владеет task, budget, lease и acceptance. Runner владеет sandbox/process tree, heartbeat, локальной областью и cleanup. После lease expiry новый owner получает generation; старые callback/result commits отвергаются. Сам fencing не предотвращает уже выполняемый сторонний эффект: tools дополнительно используют idempotency/reconciliation.

**Сейчас:** локальный runner, T0 slots, engine glue и process-owner lock есть. Межмашинный scheduler/lease contract и полная sandbox граница не подтверждены. Подробнее: [Execution runtime](../runtime/EXECUTION-RUNTIME.md).

## C05 — данные и артефакты

Load: snapshot version + разрешённые text docs/artifact refs. Commit: baseVersion + changeset + idempotency key + ownerGeneration. Результат — committed version или conflict; последняя запись не должна молча затирать соседний run. Конкретный merge policy задаётся по ресурсу.

Artifact manifest: stable id, owner, type/mime, size, checksum, storage reference, retention/access policy. Presigned URL — временный доступ, не идентичность. Для one-shot API task постоянный профиль необязателен, но recoverable result metadata необходима на заявленный срок.

Cleanup следует после подтверждённого persist/export нужных материалов. Failed export повторяет export, а не всю execution. Доступ к native resume должен быть отдельной runtime-state policy: текстовые user docs не обязаны хранить engine SQLite и tool cache.

**Сейчас:** разделены три корня; R2 media refs есть. Универсальный output/artifact и snapshot commit protocol — proposal.

## C06/C07 — tools и credentials

ToolCall: `operationId, taskId, runId, principalRef, toolId, resolvedProviderVersion, input, credentialBindingRef, ownerGeneration, timeout`. ToolResult: success/error + failureClass + effect status (none/applied/unknown) + evidence/artifacts. read-only retry и mutation retry имеют разные правила. При unknown effect сперва reconciliation; при невозможности доказать outcome — needs_review.

Domain service отвечает за свои вакансии/кандидатов/спеки/инженерные workspace. Core хранит generic task/execution references, а не переносит domain handlers внутрь себя ради orchestration. Broker проверяет identity, scope, доступ к paths/network и объявленные возможности. MCP — transport adapter, не автоматическое название бизнес-сервиса.

Credential resolution — по consumer: personal/shared/playground/platform, замена user account допускается только явно. Missing/expired/quota/config — разные результаты. Refresh имеет одного владельца; credentials не записываются в общий journal. Начальный этап может выдавать необходимые raw engine tokens, но это явно объявленная граница, не выдача всех platform secrets.

**Сейчас:** store и registry существуют; MCP под service user делает broker boundary особенно важной. Унифицированный credential priority не реализован одним resolver.

## C08 — LLM calls, budgets и ledger

LLM gateway управляет provider/model ladder, health, key rotation, protocol errors. Orchestrator разрешает cost class/paid fallback и резервирует task budget; ledger записывает расходы. Это три обязанности даже при совместном deployment.

Call context: `callId, taskId?, runId?, stepId?, principalId, purpose, budgetRef, permittedCostClass, traceId`. Сервисные вызовы без task имеют явный system source. Каждый provider attempt получает запись outcome/usage/cost basis; stream usage может быть unknown, но не zero. Subscription usage, estimate и invoice amount различаются. Цены привязаны к timestamp/version. При исчерпании бюджета возвращается typed failure; технический retry не сбрасывает budget, каналы показывают одинаковую причину и допустимое продолжение.

Streaming failover после начала ответа — отдельный сценарий: нельзя прозрачно приклеить второй независимый ответ. Ошибки ledger delivery не теряются: durable accounting outbox/reconciliation; режим fail-open/fail-closed при недоступном budget authority требует решения владельца.

**Сейчас:** llm-ladder Worker + D1 trace есть. Полная интеграция заявленного LLM Ledger, streaming cost и mandatory identity coverage этой проверкой не подтверждены.

## C09 — playbooks, GTD и проверки

Registry отдаёт versioned template; task pins version. Compiler создаёт generic plan с execution contracts, dependencies и validators. GTD/outcome control оценивает прогресс; technical recovery повторяет attempt; один scheduler назначает execution. Playbook не содержит второго скрытого supervisor.

ValidationResult: validator id/version, target artifact/run, verdict (pass/fail/unconfirmed), evidence refs и reasons. Hard gate блокирует acceptance; soft gate явно оставляет unconfirmed. Изменение методики не меняет активный план без явной миграции. Recurring schedule создаёт отдельные occurrences, retry не клонирует периодическую задачу.

## Что не следует делать контрактом сервиса

Внутренние JS функции, каждый файл, каждая роль агента и каждый шаг playbook не требуют отдельного deploy/API. Отдельный репозиторий оправдан устойчивой границей ответственности, версиями и самостоятельным жизненным циклом, а не размером одного документа.

## Следующие решения

1. Согласовать C01/C02/C03 как основной контракт взаимодействия каналов с задачами.
2. Согласовать ownership C04 и persistence C05 до распределения выполнения между VM.
3. Зафиксировать C06/C07 для доменных сервисов и credentials.
4. Уточнить C08 для фактического LLM Ledger и budget enforcement.
5. По каждому контракту оформить schema + compatibility + deterministic consumer/provider tests. Пока это архитектурное предложение, не задача на немедленный рефакторинг.
