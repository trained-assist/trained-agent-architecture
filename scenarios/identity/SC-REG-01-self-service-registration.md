# SC-REG-01 — Самостоятельная регистрация и стартовый лимит использования

**Статус:** scenario-change proposal; целевое поведение и размер/семантика стартового лимита требуют утверждения до runtime implementation.
**Scenario-change:** [architecture #212](https://github.com/trained-assist/trained-agent-architecture/issues/212).
**Связанные решения:** [Model Gateway, Ladder и стоимость](../../MODEL-GATEWAY-AND-COSTS.md), [U-01](../../stories/USER.md), [API usage and reporting](../../stories/API.md).
**Граница:** человек регистрируется через Web, подтверждает владение способом входа, получает личный профиль и использует доступные ему задачи в рамках стартовой квоты. Telegram можно связать с уже созданным аккаунтом; регистрация через Telegram сама по себе не создаёт второй профиль.

## Цель и акторы

Новый пользователь без приглашения оператора может создать аккаунт, понять условия бесплатного стартового лимита, начать задачу и видеть остаток лимита и историю его расходования. Повторные регистрации, параллельные задачи, сбои провайдеров и неизвестное списание не должны выдавать дополнительную квоту или скрывать расход.

Акторы: человек; Web identity/authentication; account/profile provisioning; budget authority и usage ledger; Task Router/Model Gateway; LLM provider/Runner; support/operator с ограниченной функцией восстановления.

## Термины и предлагаемая продуктовая политика

- **Аккаунт** — подтверждённая уникальная identity, которой принадлежат профиль, сессии, задачи, квота и история использования.
- **Профиль** — пользовательские настройки и долговременные данные; не является способом получить новую квоту.
- **Стартовый лимит** — предлагаемая одноразовая promotional allowance `100,000,000` platform tokens на один подтверждённый аккаунт. Значение задано запросом владельца; правило одноразовой выдачи и все ограничения ниже являются предложением для согласования.
- **Platform token** — целая accounting unit, записанная в Ledger. До запуска нужно выбрать точную формулу преобразования provider usage в platform tokens, включая input/output, cache read/write, скрытые reasoning tokens, audio/image/video и провайдеров, которые не возвращают точные usage. Provider tokens нельзя суммировать как эквивалентные без зафиксированной политики.
- **Квота и денежная стоимость — разные ограничения.** 100 млн platform tokens не означают фиксированную сумму денег или одинаковый объём вычислений на всех моделях. Hard cost, rate, concurrency и abuse limits действуют дополнительно и могут остановить использование раньше.
- **Рекомендация для первого релиза:** одна стартовая квота на аккаунт, не пополняется новой регистрацией или сменой профиля/канала; не переводится между аккаунтами, не выводится в деньги, действует 12 месяцев с первой выдачи. Изменение суммы, срока или пополняемости требует продуктового решения до реализации.

## Основной поток

1. Пользователь открывает Web-регистрацию, вводит способ входа и принимает условия использования/обработки данных.
2. Система нормализует идентификатор входа, проверяет rate limits и anti-abuse policy, отправляет подтверждение. До подтверждения доступен только повтор отправки/удаление незавершённой заявки; агентские задачи не запускаются.
3. После подтверждения система атомарно создаёт один account ID и один profile ID. Повторный callback подтверждения идемпотентен. Если такая identity уже есть, пользователь входит в существующий аккаунт или проходит безопасное восстановление, а не получает второй профиль/лимит.
4. В одной транзакции создаются account, profile, entitlement и начальная запись Ledger `grant +100,000,000`; повтор запроса или сбой между шагами не создаёт вторую квоту. Пользователь получает подтверждение и видит сумму, срок действия, единицу учёта и основные ограничения.
5. Пользователь задаёт первую задачу. До вызова платного провайдера Budget Authority резервирует верхнюю оценку расхода в пределах доступного остатка и hard cost/rate limits. Если оценка невозможна или места недостаточно, задача не отправляется платному исполнителю и система объясняет причину.
6. По завершении фактический usage атрибутируется к account/profile, userTaskId, runId, provider/model и call/attempt IDs. Резерв сверяется с фактическим usage, остаток обновляется идемпотентно. Retry/fallback — отдельные реальные calls, каждый учитывается один раз; неизвестный outcome остаётся `unknown/pending reconciliation`, а не бесплатным расходом.
7. Пользователь может посмотреть выданную квоту, использовано, зарезервировано, доступно, срок, записи по задачам и причину корректировки. Числа помечаются как предварительные, пока usage не подтверждён провайдером.
8. При исчерпании/истечении квоты новые оплачиваемые вызовы не начинаются. Уже принятые задачи завершаются в рамках существующих reservation либо останавливаются с честным статусом. Пользователь видит объяснение и разрешённые варианты: дождаться освобождения ошибочной/истёкшей reservation, запросить поддержку или применить доступный тариф, если он введён отдельно.
9. Пользователь может связать Telegram с существующим аккаунтом через подтверждаемое одноразовое handoff. Связь не переносит квоту и не создаёт новый account/profile.

## Инварианты и безопасность

- Одна подтверждённая identity соответствует одному account; создание аккаунта/начисление квоты — идемпотентно.
- Entitlement не выбирается клиентом, LLM, Telegram handle или profile display name. Только доверенный provisioning/budget service может начислять, отзывать или корректировать его; каждое изменение имеет actor, reason, idempotency key и audit event.
- Баланс не может стать отрицательным из-за параллельных задач: reservation атомарен на уровне account. Ограничения rate/concurrency действуют вместе с остатком.
- Повтор доставки одного usage event не списывает повторно. Событие с тем же ID, но другим payload вызывает конфликт и расследование.
- При timeout после отправки внешнего вызова запрос сначала reconciled по providerCallId/idempotency key; система не считает его бесплатным и не начисляет повторную задачу вслепую.
- Provider outage до фактического usage освобождает reservation только после подтверждения отсутствия вызова; неизвестное потребление оставляет сумму зарезервированной или помеченной как disputed.
- В пользовательском интерфейсе различаются `available`, `reserved`, `consumed`, `pending reconciliation`, `expired` и `adjusted`; unknown никогда не отображается как нулевой расход.
- E-mail/телефон, OAuth subject, Telegram ID и display name — разные идентификаторы. Привязка нового канала требует доказательства контроля обеих сторон или recovery flow; нельзя автоматически сливать профили по имени.
- Квота не заменяет hard monetary caps, provider/model allowlist, abuse protection, data deletion, export и права пользователя.

## Отказы и восстановление

- Не подтверждён контакт, истёк код, превышен rate limit или anti-abuse policy — account/entitlement не активируются; ответ не раскрывает наличие чужой identity.
- Дублируется callback регистрации или выдачи квоты — возвращается прежний результат с тем же account/entitlement ID.
- Account создан, а Ledger временно недоступен — пользователь не получает активный доступ до успешной атомарной выдачи; reconciliation завершает или безопасно откатывает provisioning.
- Provider не возвращает usage — reservation остаётся pending, запускается reconcile; нельзя сообщать точный остаток, если он не доказан.
- Квота закончилась во время принятой работы — reservation гарантирует верхнюю границу или задача получает явный budget-exhausted outcome; незарезервированный платный fallback запрещён.
- Повторная регистрация с иной почтой, новым Telegram identity или изменённым display name не выдаёт новый grant без принятой recovery/abuse policy.
- Пользователь запрашивает удаление — отзыв сессий/каналов и retention/deletion учётных записей исполняются по утверждённой privacy policy; usage ledger сохраняет только разрешённый минимальный аудит.

## Внешние интерфейсы, требуемые от реализации

Точные wire schemas принадлежат implementation repositories и должны быть закреплены versioned contracts. Сценарий требует эквивалентных операций:

- начать регистрацию / повторить challenge / подтвердить identity / завершить регистрацию;
- получить account summary, entitlement state и usage history;
- связать Telegram identity с существующим account;
- внутренние атомарные операции grant, reserve, commit actual usage, release reservation, reconcile unknown usage, expire/revoke и audited adjustment;
- отправить задачу только после успешной reservation и вернуть budget-related terminal reason при отказе.

Клиентские API не получают прямую операцию начисления/редактирования квоты. Секреты аутентификации, provider credentials и recovery tokens не возвращаются в клиентские логи или историю usage.

## Acceptance gates

Все применимые gates имеют `PASS`; `FAIL`/`UNCLEAR` блокируют acceptance.

| Gate | Проверяемое поведение |
|---|---|
| 1. Semantic conformity | Каждое правило выдачи 100 млн, identity merge/recovery, expiry, token normalization и hard cost guard имеет владельца и versioned contract; утверждённые product choices не расходятся между Web, API, Ledger и Model Gateway |
| 2. Component verification | Identity verification/duplicate/recovery; transactional idempotent grant; atomic concurrent reservations; exact usage mapping for every enabled provider/model; retry/fallback/cache/stream attribution; unknown-usage reconciliation; expiry/revocation; rate and hard monetary caps; audit/privacy/deletion |
| 3. Generated sandbox E2E | С нуля зарегистрировать synthetic user; проверить ровно один grant `100,000,000`; запустить задачи через два канала/параллельных запроса; сверить calls с Ledger и остатком; replay callbacks/events; симулировать timeout/unknown usage, provider failure, quota exhaustion и registration retry; удалить synthetic identity согласно privacy policy. Не использовать реальные персональные данные или production quota |
| 4. Promotion | Публичные условия/тариф, provider mapping/prices, privacy/legal review, abuse limits, support/recovery и rollback подготовлены; production deploy только через verified owning-repository promotion paths и post-deploy smoke |

Минимальные assertions: повторная регистрация не дублирует аккаунт/grant; две конкурентные задачи не тратят одну и ту же квоту; сумма `available + reserved + consumed + expired/adjusted` согласуется с immutable grant и ledger entries; для каждого завершённого call известны provider/model, usage status и accounting formula; отсутствующая usage не превращается в бесплатную.

## Решения, обязательные до implementation

1. Утвердить: 100,000,000 — точный размер гранта, разовая акция или повторяемый месячный лимит; срок действия и поведение истечения.
2. Утвердить platform-token formula и включённые категории usage/provider. Без этого отображаемая цифра не является честным измерением.
3. Утвердить доступные модели/tools, monetary ceiling, rate/concurrency limits и abuse policy. Количество токенов само по себе не ограничивает стоимость.
4. Выбрать допустимые identity providers и минимальный verification/recovery flow; определить, разрешены ли несколько аккаунтов одному человеку.
5. Определить privacy notice, data retention, deletion/export и обязательные audit records для grant/usage.
6. Выбрать owning repositories/owners для identity, profile provisioning, Ledger/Budget Authority, Web UX и Telegram linking; добавить implementation issues с Environment Contracts.

До закрытия этих решений документ задаёт целевое поведение и proposal, но не разрешает выпускать entitlement или менять runtime budget policy.
