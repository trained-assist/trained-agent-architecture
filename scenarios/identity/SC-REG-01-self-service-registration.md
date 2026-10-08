# SC-REG-01 — Самостоятельная регистрация и стартовый лимит использования

**Статус:** scenario-change proposal; целевое поведение и размер/семантика стартового лимита требуют утверждения до runtime implementation.
**Scenario-change:** [architecture #212](https://github.com/trained-assist/trained-agent-architecture/issues/212).
**Связанные решения:** [Model Gateway, Ladder и стоимость](../../MODEL-GATEWAY-AND-COSTS.md), [U-01](../../stories/USER.md), [API usage and reporting](../../stories/API.md).
**Граница:** self-service регистрация проходит в Telegram-боте. Telegram `user_id` — первичная подтверждённая identity. В регистрации бот задаёт два обязательных вопроса: чем занимается пользователь (ответ в паре предложений) и ссылку на любую соцсеть с непустым профилем, который, по словам пользователя, существует более месяца. Также бот предлагает необязательное поле `profile name` с кнопкой «Пропустить». Возраст и содержимое аккаунта система не проверяет. После ответов создаются профиль и стартовая квота. Если имя пропущено, `profile name` получает значение Telegram `chat.id` этого личного диалога.

## Цель и акторы

Новый пользователь начинает с Telegram-бота, отвечает на два обязательных вопроса, при желании задаёт имя профиля и получает профиль с начальной квотой. После этого он может сразу задать задачу, видеть остаток квоты и историю расходования. Никакие дополнительные анкеты, e-mail или проверка соцсетей не требуются. Повторные регистрации, параллельные задачи, сбои провайдеров и неизвестное списание не должны выдавать дополнительную квоту или скрывать расход.

Акторы: человек в Telegram; Telegram bot/gateway как аутентифицированный канал; account/profile provisioning; budget authority и usage ledger; Task Router/Model Gateway; LLM provider/Runner; support/operator с ограниченной функцией восстановления.

## Термины и предлагаемая продуктовая политика

- **Аккаунт** — Telegram `user_id`, подтверждённый самим Telegram update и используемый как стабильный ключ аккаунта; ему принадлежат профиль, сессии, задачи, квота и история использования.
- **Профиль** — пользовательские настройки и долговременные данные; не является способом получить новую квоту. `profile name` — изменяемое отображаемое имя, не identity key, не `profileId` и не основание для слияния данных. Регистрация принимается только в личном чате с ботом; если имя пропущено, его начальное значение — строковое значение `chat.id`.
- **Стартовый лимит** — предлагаемая одноразовая promotional allowance `100,000,000` platform tokens на один Telegram account. Значение задано запросом владельца; правило одноразовой выдачи и все ограничения ниже являются предложением для согласования.
- **Platform token** — целая accounting unit, записанная в Ledger. До запуска нужно выбрать точную формулу преобразования provider usage в platform tokens, включая input/output, cache read/write, скрытые reasoning tokens, audio/image/video и провайдеров, которые не возвращают точные usage. Provider tokens нельзя суммировать как эквивалентные без зафиксированной политики.
- **Квота и денежная стоимость — разные ограничения.** 100 млн platform tokens не означают фиксированную сумму денег или одинаковый объём вычислений на всех моделях. Hard cost, rate, concurrency и abuse limits действуют дополнительно и могут остановить использование раньше.
- **Рекомендация для первого релиза:** одна стартовая квота на аккаунт, не пополняется новой регистрацией или сменой профиля/канала; не переводится между аккаунтами, не выводится в деньги, действует 12 месяцев с первой выдачи. Изменение суммы, срока или пополняемости требует продуктового решения до реализации.

## Основной поток

1. Пользователь открывает Telegram-бота и нажимает Start. Бот показывает короткое описание сервиса и условия обработки данных как текст/кнопки согласия; это не дополнительный вопрос анкеты. Telegram update аутентифицируется штатной подписью/секретом webhook или polling boundary.
2. Если Telegram `user_id` уже связан с аккаунтом, бот открывает существующий профиль и не начинает новую регистрацию/выдачу квоты. Иначе бот начинает идемпотентный onboarding flow.
3. Бот задаёт первый обязательный вопрос о деятельности: «Чем вы занимаетесь? Расскажите в паре предложений». Пользователь отвечает текстом; ответ сохраняется как самодекларированное поле профиля.
4. Бот задаёт второй обязательный вопрос: «Пришлите ссылку на любую вашу социальную сеть, где профиль не пустой и аккаунт существует больше месяца». Система принимает предоставленную ссылку как самоописание. Она не открывает ссылку, не проверяет платформу, владельца, содержимое, непустоту или дату создания профиля; эти свойства не являются сигналом автоматического отказа, рейтинга или изменения квоты.
5. Бот предлагает необязательное поле: «Как назвать ваш профиль?» Пользователь может ответить именем или нажать «Пропустить». При пропуске система устанавливает отображаемое `profile name` равным строковому Telegram `chat.id` личного чата. Это имя не используется как account ID, `profileId`, GitHub repository name, budget key или authorization input.
6. После двух обязательных ответов и выбора/пропуска profile name система атомарно создаёт account ID, profile ID, onboarding-записи и entitlement. В Ledger появляется ровно одна начальная запись `grant +100,000,000`. Повторный Telegram update, повторный ответ или рестарт продолжают тот же onboarding и не начисляют grant повторно. Пользователь получает сообщение о создании профиля, размере квоты, сроке и командах/кнопках для баланса и задач.
7. Пользователь задаёт первую задачу в Telegram. До платного вызова Budget Authority резервирует верхнюю оценку расхода с учётом квоты и hard cost/rate limits. Если лимита недостаточно или оценку нельзя безопасно зарезервировать, платный запуск не начинается и бот сообщает причину.
8. По завершении usage атрибутируется к account/profile, userTaskId, runId, provider/model и call/attempt IDs. Резерв сверяется с фактическим usage, остаток обновляется идемпотентно. Retry/fallback — отдельные реальные calls, каждый учитывается один раз; неизвестный outcome остаётся `unknown/pending reconciliation`, а не бесплатным расходом.
9. Пользователь запрашивает баланс/историю через Telegram-команду или кнопку и видит grant, использовано, зарезервировано, доступно, срок и pending/disputed usage. Показатели обозначены как предварительные до подтверждения provider usage.
10. При исчерпании/истечении квоты новые оплачиваемые вызовы не начинаются. Уже принятые задачи завершаются в рамках reservation либо получают честный budget-exhausted outcome. Бот показывает доступные варианты без обещания пополнения, если отдельный тариф ещё не введён.

## Инварианты и безопасность

- Одна подтверждённая identity соответствует одному account; создание аккаунта/начисление квоты — идемпотентно.
- Entitlement не выбирается клиентом, LLM, Telegram username/display name, ответом о деятельности или социальной ссылкой. Только доверенный provisioning/budget service может начислять, отзывать или корректировать его; каждое изменение имеет actor, reason, idempotency key и audit event.
- Баланс не может стать отрицательным из-за параллельных задач: reservation атомарен на уровне account. Ограничения rate/concurrency действуют вместе с остатком.
- Повтор доставки одного usage event не списывает повторно. Событие с тем же ID, но другим payload вызывает конфликт и расследование.
- При timeout после отправки внешнего вызова запрос сначала reconciled по providerCallId/idempotency key; система не считает его бесплатным и не начисляет повторную задачу вслепую.
- Provider outage до фактического usage освобождает reservation только после подтверждения отсутствия вызова; неизвестное потребление оставляет сумму зарезервированной или помеченной как disputed.
- В пользовательском интерфейсе различаются `available`, `reserved`, `consumed`, `pending reconciliation`, `expired` и `adjusted`; unknown никогда не отображается как нулевой расход.
- Telegram `user_id` — единственный identity key в этом onboarding. Username, display name и `profile name` изменяемы и не являются ключами. Повторный Telegram account не объединяется с другим профилем по имени, деятельности или ссылке на соцсеть; смена/утрата Telegram identity требует отдельного recovery сценария.
- Квота не заменяет hard monetary caps, provider/model allowlist, abuse protection, data deletion, export и права пользователя. Деятельность и социальная ссылка — персональные данные профиля; они приватны, доступны пользователю для просмотра/изменения/удаления и не передаются модели автоматически в системный контекст. Соцссылка не запрашивается у провайдера и не используется для профилирования.

## Отказы и восстановление

- Некорректный/неполный onboarding ответ — бот просит повторить только текущий из двух вопросов; дополнительных полей не добавляет. Rate limit ограничивает автоматизированное создание аккаунтов, не требуя e-mail/телефона.
- Дублируется callback регистрации или выдачи квоты — возвращается прежний результат с тем же account/entitlement ID.
- Telegram account/profile созданы, а Ledger временно недоступен — агентские задачи не запускаются до успешной атомарной выдачи; reconciliation завершает или безопасно откатывает onboarding.
- Provider не возвращает usage — reservation остаётся pending, запускается reconcile; нельзя сообщать точный остаток, если он не доказан.
- Квота закончилась во время принятой работы — reservation гарантирует верхнюю границу или задача получает явный budget-exhausted outcome; незарезервированный платный fallback запрещён.
- Повторный Telegram update или запуск `/start` с тем же Telegram `user_id` не создаёт новый account/grant. Другой `user_id` сам по себе не может быть надёжно связан с тем же физическим человеком; abuse controls ограничивают автоматические повторы, а идентификацию личности не обещают.
- Пользователь запрашивает удаление — отзыв сессий/каналов и retention/deletion учётных записей исполняются по утверждённой privacy policy; usage ledger сохраняет только разрешённый минимальный аудит.

## Внешние интерфейсы, требуемые от реализации

Точные wire schemas принадлежат implementation repositories и должны быть закреплены versioned contracts. Сценарий требует эквивалентных операций:

- начать/продолжить onboarding из Telegram update; сохранить ответ на текущий вопрос идемпотентно; завершить account/profile/grant одной операцией;
- получить account summary, entitlement state и usage history в том же Telegram account;
- внутренние атомарные операции grant, reserve, commit actual usage, release reservation, reconcile unknown usage, expire/revoke и audited adjustment;
- отправить задачу только после успешной reservation и вернуть budget-related terminal reason при отказе.

Клиентские API не получают прямую операцию начисления/редактирования квоты. Секреты аутентификации, provider credentials и recovery tokens не возвращаются в клиентские логи или историю usage.

## Acceptance gates

Все применимые gates имеют `PASS`; `FAIL`/`UNCLEAR` блокируют acceptance.

| Gate | Проверяемое поведение |
|---|---|
| 1. Semantic conformity | Каждое правило выдачи 100 млн, Telegram identity/recovery, двух вопросов onboarding, expiry, token normalization и hard cost guard имеет владельца и versioned contract; утверждённые product choices не расходятся между Telegram, API, Ledger и Model Gateway |
| 2. Component verification | Telegram update authentication in private chats; two required onboarding prompts plus optional `profile name` with skip/default behavior; duplicate `/start`/update idempotency; transactional idempotent grant; atomic concurrent reservations; exact usage mapping for every enabled provider/model; retry/fallback/cache/stream attribution; unknown-usage reconciliation; expiry/revocation; rate and hard monetary caps; audit/privacy/deletion |
| 3. Generated sandbox E2E | С нуля зарегистрировать synthetic Telegram user; проверить ровно два обязательных вопроса, optional `profile name`, skip → `chat.id`, сохранение полей и ровно один grant `100,000,000`; подтвердить, что social URL не запрашивается извне и не влияет на entitlement; повторить `/start` и updates; запустить задачи и проверить учёт; сверить calls с Ledger и остатком; replay callbacks/events; симулировать timeout/unknown usage, provider failure, quota exhaustion и registration retry; удалить synthetic identity согласно privacy policy. Не использовать реальные персональные данные или production quota |
| 4. Promotion | Публичные условия/тариф, provider mapping/prices, privacy/legal review, abuse limits, support/recovery и rollback подготовлены; production deploy только через verified owning-repository promotion paths и post-deploy smoke |

Минимальные assertions: повторная регистрация не дублирует аккаунт/grant; две конкурентные задачи не тратят одну и ту же квоту; сумма `available + reserved + consumed + expired/adjusted` согласуется с immutable grant и ledger entries; для каждого завершённого call известны provider/model, usage status и accounting formula; отсутствующая usage не превращается в бесплатную.

## Решения, обязательные до implementation

1. Утвердить: 100,000,000 — точный размер гранта, разовая акция или повторяемый месячный лимит; срок действия и поведение истечения.
2. Утвердить platform-token formula и включённые категории usage/provider. Без этого отображаемая цифра не является честным измерением.
3. Утвердить доступные модели/tools, monetary ceiling, rate/concurrency limits и abuse policy. Количество токенов само по себе не ограничивает стоимость.
4. Утвердить Telegram как единственный identity для первой версии и отдельно определить recovery при утрате Telegram account; не обещать детектирование нескольких Telegram identities одного человека.
5. Определить privacy notice и retention для onboarding-полей (деятельность, соцссылка, optional profile name); подтвердить приватность, просмотр/изменение/удаление и запрет автоматической передачи социальной ссылки модели; определить audit records для grant/usage.
6. Выбрать owning repositories/owners для identity, profile provisioning, Ledger/Budget Authority, Telegram onboarding UX; добавить implementation issues с Environment Contracts.

До закрытия этих решений документ задаёт целевое поведение и proposal, но не разрешает выпускать entitlement или менять runtime budget policy.
