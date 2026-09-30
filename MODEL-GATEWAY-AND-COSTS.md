# Model Gateway, Ladder и стоимость

Статус: отдельный architecture draft · 30.09.2026. A10 / INV-10 / INV-11 общей архитектуры. Здесь model selection и accounting; выбор Job type описан в [Task Router](TASK-ROUTER-AND-MCP.md).

## Принятая граница эскалации

Автоматический агентский путь сейчас заканчивается на OpenCode. Автоэскалация OpenCode → Claude Code/Codex вне текущей модели. OpenCode считается недорогим целевым executor, но реальный provider usage, concurrency и budget caps учитываются. GTD не регистрируется повсеместно ради accounting: task/run attribution обязательна и без gtdId.

## Ответственность

Task Router выбирает тип исполнения. Model Gateway/Ladder выбирает допустимый provider/model по recipe, quality/region/budget/readiness. Ledger сохраняет usage/cost attribution. Executor сообщает фактический outcome и provider refs.

Для всех calls/attempts: userTaskId, gtdId при контроле, jobId/runId и stepId если есть; source=router/reply/diagnosis/agent/validator и providerCallId. Учитываем retries, fallback, cache read/write, streaming и validation calls. Unknown usage/cost не записываем как zero.

Budget policy проверяется до платного вызова. Общий лимит Task включает GTD и delegation; отдельные paid fallback/diagnosis разрешаются явно. Неизвестный outcome внешнего вызова reconcile-ится, не скрывается успешной пустой записью.

## Состояние найденной реализации

Владелец сообщил о существующем LLM Ledger. Его полный путь доставки всех engine calls пока не подтверждён. Изученный trained-assist-llm-ladder revision 9907dcb6b27307450bdfc826f67dd5490283d2c8 содержит model routing, health/key rotation и D1 traces; прежний аудит обнаружил неполное streaming usage и отсутствие денежной стоимости в найденной trace schema.

Подробные факты и pinned links: [архив исходного code audit](audits/ARCHITECTURE-0.2-CODE-AUDIT.md). Это историческая проверка, не утверждение нынешнего production coverage.

## Цены и инфраструктура

Числовые тарифы не фиксируем в общей архитектуре. Pricing catalog хранит provider/model, единицы billing, currency, effective dates и источник. Invoice actual и estimate различимы; subscription usage может не иметь точного per-call dollar cost.

VM/object storage/network/media costs учитываются отдельно от LLM tokens. Смена числа RU/EU VM не меняет contracts. План бюджета и конкретные provider prices требуют отдельной актуальной проверки.

## Открытые решения

- [ ] Где полный Ledger находится и как все consumers доставляют в него usage?
- [ ] Budget authority по profile/task/day/platform key и reservations/reconciliation.
- [ ] Paid fallback/diagnosis: default запрещён или есть разрешённый резерв?
- [ ] Attribution cache/subscription/streaming и retention.
- [ ] Model quality policies и region/provider/tool restrictions.
