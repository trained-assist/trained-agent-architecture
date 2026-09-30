# Observability: errors, events и retention

Статус: обязательные целевые требования / draft · 30.09.2026. Уточнение владельца: **error logs обязательны для всех модулей; профиль пользователя обязателен для пользовательской ошибки, канал ответа должен присутствовать там, где он известен**. Общий контракт и registry обязательны; один физический log backend необязателен.

## Приоритеты

1. **Error events** — durable structured запись ошибки с correlation и правильным scope. Основа [System Error Watcher](SYSTEM-ERROR-WATCHER.md).
2. **Основные lifecycle events** — приём, подготовка, handoff, запуск, outcome, export, delivery, wait, cancel и escalation.
3. **Verbose/native logs** — диагностические артефакты по настройке, не обязательное сохранение всех prompts и reasoning.

Локальная console строка без структуры не выполняет контракт ошибки. Ledger сохраняет расходы, native session journal — ход сессии, task events — состояния, error events — дефекты; они связаны IDs, но не заменяют друг друга.

## Общий ErrorEvent

```json
{
  "schemaVersion": 1,
  "eventId": "E1",
  "occurredAt": "2026-09-30T13:50:00Z",
  "source": {"service": "telegram-gateway", "release": "rev", "environment": "sandbox"},
  "scope": {"kind": "profile", "tenantId": "T1", "profileId": "P1"},
  "correlation": {"userTaskId": "U1", "runId": null, "traceId": "TR1"},
  "replyContext": {
    "channel": "telegram",
    "destinationRef": "D1",
    "status": "known"
  },
  "error": {
    "code": "UPSTREAM_TIMEOUT",
    "operation": "submitTask",
    "severity": "error",
    "retryable": true,
    "outcome": "unknown",
    "safeSummary": "Передача задачи не подтверждена",
    "privateDetailsRef": "artifact:LOG1"
  },
  "origin": {"kind": "application", "incidentId": null, "diagnosticDepth": 0}
}
```

Пример иллюстративен, wire schema ещё не утверждена. eventId/errorEventId здесь один immutable identifier, не два независимо генерируемых ID.

| Поле | Требование |
|---|---|
| source.service/release/environment, eventId/occurredAt | Обязательно; production и sandbox раздельны |
| scope.kind + tenantId/profileId | Для profile-scoped ошибки профиль **обязателен**, берётся из trusted auth/task envelope |
| scope.kind=platform | Исключение для host outage/startup/global failure без одного пользователя; явное отсутствие profile, ops destination, без случайного user report |
| userTaskId/jobId/runId/gtdId/operationId | Прокидывать всё известное на данном этапе; GTD ID только если контроль зарегистрирован |
| replyContext.channel/destinationRef | Обязательны при известном ingress/subscription; fallback Web/task API, если чата нет |
| replyContext.status/reason | known / web_only / unavailable / not_applicable; неизвестность явна |
| error code/operation/severity/outcome | Typed classification; failed и unknown различаются |
| safeSummary/privateDetailsRef | Sanitized short текст отдельно от защищённых raw diagnostics |
| origin/causation/diagnosticDepth | Защита от watcher self-loop, источник и связь с исходным событием |

Формулировка «канал в 90% случаев» — ожидаемое покрытие пользовательских ошибок, не готовый измеренный SLO. Измеряем долю known channel для channel-origin задач отдельно. Cron или API caller не получает выдуманный Telegram chat.

Profile отсутствует у error с scope=profile → telemetry contract violation. Событие quarantine-ится для ops reconciliation; мы не выбрасываем его и не пытаемся угадать пользователя. pre-auth failure не получает fake profile: отдельный auth/platform scope и минимальные данные. Ошибка может затрагивать несколько профилей — platform incident со scoped affected refs; адресные reports строятся для каждого разрешённого получателя.

Канал — свойство origin/delivery subscription, не владелец Task. Смена подписки/отписка проверяется на момент доставки. В логах — destinationRef, а не открытые phone/chat IDs. Инфраструктура, публикующая callback, берёт correlation из сохранённой binding/operation, а не из provider текстового поля.

## Реестр источников и доставка

Каждый модуль регистрирует sourceId, владельца, схемы error/lifecycle, transport/backend, scope rules, retention class, access policy и health/freshness signal. Registry может быть конфигом; runtime offsets/checkpoints хранятся вне git.

Производитель пишет error event в durable sink/outbox, не вызывает watcher синхронно в пользовательском запросе. Consumer reader поддерживает replay и dedup по eventId. В режиме разных backends adapters приводят события к общему contract и сохраняют cursor; watcher не обязан парсить arbitrary файлы всех сервисов.

Сбой log delivery: bounded retry и локальный spool, где доступен; overflow/dropped-count виден health signal. Логирование не должно бесконечно блокировать user path или занимать весь диск. Delivery guarantees определяются deployment backend, а не обещанием «ни одна ошибка никогда не потеряется». Ошибки транспорта самого error sink не порождают рекурсивный поток себя.

Первичный error state задачи и deterministic краткий ответ пользователю не ждут watcher. Watcher добавляет диагноз/обход/issue в связанной diagnostic Task.

## Основные события

| Модуль | Минимальные события |
|---|---|
| Gateway/Input/media | received, durable accepted, upload/preparation state, queued, dispatch accepted/rejected |
| Router/LLM | decision, needs_executor, schema invalid, timeout, escalation; model call correlation |
| Runner/executors | starting, started, heartbeat summary, outcome, cancel requested/confirmed, lease lost |
| Storage | snapshot resolved, export started/committed/failed, conflict, cleanup |
| Output/delivery | result persisted, GTD ACK если есть, report queued/delivered/failed |
| Scheduler/GTD | occurrence created/dedup, control activated/closed, next-step decision, deadline |
| User wait | awaiting user input, response accepted/rejected, resumed/expired |
| Integration Gate | provider request receipt, callback accepted/dedup/rejected, outcome unknown/reconciled |
| Watcher | incident opened/updated, diagnosis submitted, suppression created/expired, issue receipt |

События содержат transitions, IDs, timings и safe metadata. Не копируют каждый attachment/prompt в каждую запись. Error event при failed outcome имеет тот же causal context, что lifecycle event; они могут быть разными представлениями одного event envelope.

## TTL: предлагаемая стартовая политика

Числа ниже — **предложение**, не принятые production настройки. Конфиг retention обязателен до включения sink; policy может уточняться по profile/project/deployment.

| Класс | Предлагаемый TTL | После срока |
|---|---|---|
| Structured error events + sanitized details | 30 дней | Удалить payload; агрегаты incident отдельно |
| Main lifecycle events | 30 дней | Сохранить compact task outcome/IDs по task policy |
| Verbose/native diagnostic logs | 7 дней | Удалить raw artifact; refs отмечаются expired |
| Incident summaries/counts/issue refs | 90 дней | Aggregate/archive/delete по policy |
| Completed task summary / manifest refs | 90 дней | Expired view либо archive по продуктовой policy |
| Sandbox logs/fixtures output | 7 дней; максимум 30 для расследования | Удалить sandbox artifacts |
| Active outbox, wait, task checkpoint | Не истекает, пока нужен активной работе | Cleanup только после terminal/ACK и retention |
| Suppression rule | expiresAt либо until revoked | Permanent rule живёт до revoke, history по audit policy |

Ledger billing retention задаётся [отдельно](MODEL-GATEWAY-AND-COSTS.md); эти TTL не стирают финансовые записи. User artifact retention также отдельна. Origin channel delivery refs могут истечь раньше summaries; reporting показывает это явно.

TTL отсчитывается по выбранному class timestamp; active incidents не удерживают raw logs навсегда. Cleanup охватывает индекс, object store, local spool/cache и backup policy. Permanent mute хранит fingerprint/rule, а не вечный полный error payload. Suppressed события агрегируются и имеют ту же bounded retention.

## Sandbox Driven Development: observable acceptance

Каждый новый модуль/adapter/agent contract в sandbox показывает не только successful output, но и диагностику намеренно вызванных failures. Обязательные свойства (в приёмке — AC-230…AC-235 [общего гейта](ACCEPTANCE-CHECKLIST.md#5-сквозные-инварианты-и-контракты)):

- Зарегистрирован источник и определены error/lifecycle schemas + TTL.
- Ошибка user path содержит правильный profile и известный replyContext, сквозные Task/Run IDs.
- Прогон timeout/invalid output/auth missing создаёт readable structured event.
- Callback/async Run сохраняют profile/channel context; ранняя ошибка до task acceptance имеет request correlation.
- Watcher fixture получает event через reader/replay; storm создаёт один incident.
- Suppression expiry, unknown profile, delivery failure и watcher self-error наблюдаемы.
- Native logs/export доступны по scoped refs; secrets/PII не оказываются в safe summary.
- Ускоренный clock проверяет cleanup; TTL не стирает active checkpoint/outbox.
- Telemetry backend outage не блокирует пользовательский путь бесконечно; виден dropped-count.

Это requirements для sandbox-проверок каждого модуля; их выполнение отмечается в issue соответствующей карточки.
