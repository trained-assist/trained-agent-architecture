# Guardrail audit

Статус: initial inventory для [#248](https://github.com/trained-assist/trained-agent-architecture/issues/248). Это не перечень новых запретов, а материал для решений retain/weaken/remove.

| Guardrail | Где | Защищаемый риск | Дедлок | Предварительное решение |
|---|---|---|---|---|
| Не повторять execution после unknown outcome | Runner Coordinator; C04 | Двойное внешнее действие/потеря data integrity | Средний: без reconciliation task может ждать | Retain. Нужны owner, SLO и reconcile path; они уже добавлены в contract. |
| CP не вызывает VM/GHA напрямую | ARCH/DECISIONS | Обход admission, credentials и lifecycle owner | Низкий | Retain. Это boundary, не operational convenience. |
| GHA fallback только после доказанного pre-admission refusal | placement/Runner | Параллельный duplicate execution | Средний | Retain. Проверить evidence и fallback diagnostics. |
| Production mutation только через promotion path | Environment Contract | Неконтролируемая потеря данных/необратимый rollout | Низкий | Retain. Проверить, что promotion path наблюдаем и не создаёт ожидание без recovery. |
| Старый claim/health/tail как запрет выбора sandbox | прежняя operational практика | Ложная занятость, остановка QA | Высокий | Remove как hard block. Использовать declared allocation + factual occupancy. |
| Требование ручного согласования перед обычным sandbox test | разрозненные runbooks | Замедление проверки при низком риске | Высокий | Weaken: guide + observable claim/evidence; hard block только при actual shared-state contention. |
| Sandbox topology отсутствует в registry | discovery до #247 | Неверный выбор линии | Средний | Replace с registry/discovery и `unclassified` evidence, без blanket запрета. |

## Следующая итерация

Кодовые guardrails классифицируются отдельно по четырём классам: data integrity, authorization/tenant boundary, capability mismatch и operational policy. Для каждого operational policy фиксируется число прецедентов и более мягкая альтернатива до порога трёх независимых прецедентов.
