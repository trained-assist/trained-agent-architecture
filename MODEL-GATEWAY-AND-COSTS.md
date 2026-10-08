# Model Gateway, Ladder и стоимость

Статус: актуальная локальная спецификация Model Gateway/accounting · 30.09.2026.

## Принятая граница эскалации

Автоматический агентский путь сейчас заканчивается на OpenCode. Автоэскалация OpenCode → Claude Code/Codex вне текущей модели. OpenCode считается недорогим целевым executor, но реальный provider usage, concurrency и budget caps учитываются. GTD не регистрируется повсеместно ради accounting: task/run attribution обязательна и без gtdId.

## Ответственность

Task Router выбирает тип исполнения. Model Gateway/Ladder выбирает допустимый provider/model по recipe, quality/region/budget/readiness. Ledger сохраняет usage/cost attribution. Executor сообщает фактический outcome и provider refs.

Для всех calls/attempts: userTaskId, gtdId при контроле, jobId/runId и stepId если есть; source=router/reply/diagnosis/agent/validator и providerCallId. Учитываем retries, fallback, cache read/write, streaming и validation calls. Unknown usage/cost не записываем как zero.

Budget policy проверяется до платного вызова. Общий лимит Task включает GTD и delegation; отдельные paid fallback/diagnosis разрешаются явно. Неизвестный outcome внешнего вызова reconcile-ится, не скрывается успешной пустой записью.

## Состояние найденной реализации

Владелец сообщил о существующем LLM Ledger. Его полный путь доставки всех engine calls пока не подтверждён. Изученный trained-assist-llm-ladder revision 9907dcb6b27307450bdfc826f67dd5490283d2c8 содержит model routing, health/key rotation и D1 traces; прежний аудит обнаружил неполное streaming usage и отсутствие денежной стоимости в найденной trace schema.

Подробные факты и pinned links: [Code baseline](audits/CODE-BASELINE.md). Это историческая проверка, не утверждение нынешнего production coverage.

## Цены и инфраструктура

Числовые тарифы не фиксируем в общей архитектуре. Pricing catalog хранит provider/model, единицы billing, currency, effective dates и источник. Invoice actual и estimate различимы; subscription usage может не иметь точного per-call dollar cost.

VM/object storage/network/media costs учитываются отдельно от LLM tokens. Смена числа RU/EU VM не меняет contracts. План бюджета и конкретные provider prices требуют отдельной актуальной проверки.

## Открытые решения

Открыты: место полного Ledger и доставка usage всеми consumers; budget authority (profile/task/day/platform key, reservations/reconciliation); политика paid fallback/diagnosis; attribution cache/subscription/streaming и retention; model quality policies и region/provider/tool restrictions. Статус общих решений ведётся в [#33](https://github.com/trained-assist/trained-agent-architecture/issues/33). Регистрация и предложенная стартовая квота `100,000,000` platform tokens требуют отдельной policy и accounting decision: [SC-REG-01](scenarios/identity/SC-REG-01-self-service-registration.md), [architecture issue #212](https://github.com/trained-assist/trained-agent-architecture/issues/212). До определения platform-token formula, quota lifetime, account-level budget authority, reservations и hard monetary caps entitlement не выдаётся в runtime.
