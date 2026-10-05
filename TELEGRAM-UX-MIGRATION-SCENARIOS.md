# Telegram UX: сценарии миграции накопителя на control plane

Область: [issue144](https://github.com/trained-assist/trained-agent-architecture/issues/144).
Интеграционные доказательства: [issue140](https://github.com/trained-assist/trained-agent-architecture/issues/140).
Документ задаёт поведение и способ его проверки, а не статус выполнения карточки.
Статусы, сроки, чек-листы и новые результаты ведутся в issues и Project.
Решения и порядок реализации остаются в [DECISIONS](DECISIONS.md) и
[плане интеграции](IMPLEMENTATION-AND-INTEGRATION-PLAN.md).

## 1. Выбранная граница миграции

Сохраняется отдельный существующий накопитель `IntakeBuffer` и полный Telegram UX.
Исходная feature-ветка переносится в изолированный fork/worktree с закреплённой
ревизией. Сначала воспроизводятся пользовательские сценарии, затем обсуждаются
лишние кнопки и неудобные значения «перезапуска». Новый маленький batch UI вместо
существующего накопителя не является выбранным направлением.

Новый путь запуска:

```text
Telegram → отдельный накопитель → неизменяемый полный input → CP intake
         → intent по каталогу в CP → MCP instruction / handler / workflow
                                 → при необходимости Agent Run
                                либо → Agent Run
         → durable result → единственный владелец Telegram-доставки
```

MCP instruction не означает обязательное исполнение без агента: инструкция может
потребовать Agent Run. Такой переход остаётся исполнением той же принятой задачи,
а не вторым intake от шлюза. Каталог и маршрутизатор принадлежат CP; Telegram
не строит второй классификатор и не заменяет routing прямым `/start`.

Актуальное решение владельца: имена методов полностью описывают действие.
Авторитетный каталог задаёт список допустимых имён; classifier может использовать
только этот name-only список, без дополнительных prose descriptions. Выход выбора —
одно точное имя из списка, без поясняющего текста. CP проверяет выбранное имя по
текущему scoped каталогу; неизвестное имя не вызывает tool. Только после валидного
выбора загружается instruction выбранного метода. Полные descriptions/instructions
всех методов не помещаются в classifier context. Такое представление не отменяет
последующую проверку permission, readiness, аргументов и binding перед исполнением.

Name-only меняет представление каталога, а не полномочия fallback. После
авторизованного запуска собранного ввода неизвестное имя, некорректный ответ,
непонятная задача или сбой classifier ведут в объявленный `agent` fallback с
неизменным исходным aggregate и видимой причиной деградации. Неизвестный MCP
метод при этом не вызывается; fallback не обходит authorization и engine budgets.

Существующие рендеринг, накопление, удержание ввода и input inspection используются
как UX baseline. Legacy `/run`, agent session/project API, shared agent secret,
run-outbox, `/tasks/running`, run-finished push и agent-side input endpoint нельзя
считать совместимыми с CP заменой одного URL. Они заменяются явными адаптерами
приёма/маршрутизации, статуса/управления и чтения input. Накопитель не становится
вторым Task Store, брокером исполнения или владельцем Agent Run.

## 2. Основания и границы имеющихся доказательств

| Основание | Что реально существует | Что требуется от новой композиции |
| --- | --- | --- |
| Полный TG feature source, изученная ревизия `5d078911b032e65c5af26a7e24729e6cb2cb0b43` | `src/intake-buffer.js`, input assembler, callbacks и тесты quiet collector, snapshot, media, busy/stop | Закрепить выбранную владельцем migration base и воспроизвести этот UX через CP; наличие legacy кода не доказывает CP совместимость |
| [BATCH-INPUT.md](https://github.com/trained-assist/trained-assist-tg-bot/blob/5d078911b032e65c5af26a7e24729e6cb2cb0b43/docs/BATCH-INPUT.md) | Quiet receipt 1500ms, один редактируемый collector, ordered sources, immutable `/run` snapshot, private inspection | Сохранить смысл UX, но замораживать реальный `/intake` wire body; legacy snapshot не равен CP snapshot |
| Изолированная интеграция issue140 | Health/capabilities без engine, native CSV, controlled failure, active API restart/resume и известный terminal replay имеют scoped evidence | Эти direct-mode прогоны не доказывают накопление, busy UI, выбор разговора или callback ownership новой композиции |
| [Conversation contract](CONVERSATIONAL-SESSION-CONTRACT.md) и [run conflict](scenarios/interaction/run-conflict-explicit-choice.md) | Заданы Conversation/Task/Run и явные варианты конфликта запуска | Queue/parallel/stop-with-addition проверяются как пользовательские действия через CP, а не как legacy backend flags |
| [Каталог](CAPABILITY-CATALOG-AND-FAST-REPLIES.md) и [Router/MCP](TASK-ROUTER-AND-MCP.md) | Заданы capability identity, scopes, modes, instruction и escalation | Каждый рекламируемый режим требует реального binding и evidence; отсутствующий handler не заменяется фиктивным успехом |

Далее описаны ожидаемые сценарии миграции. «Существующий UX» означает source/test
baseline, а не объявление сценария реализованным через CP или принятым в production.
Google имеет отдельный поток [issue142](https://github.com/trained-assist/trained-agent-architecture/issues/142)
и не нужен для этих сценариев. Live calls, deploy и смена webhook требуют отдельного разрешения.

## 3. Общий наблюдаемый контракт

- До выбранного действия запуска нет CP task, route execution или Agent Run.
  Quiet 1500ms — окно показа collector, а не разрешение запуска. Legacy трёхминутный
  auto-launch gate не включается автоматически при переносе: его продуктовая
  политика согласуется отдельно; сценарии здесь используют явный запуск.
- ACK webhook следует за durable append/dedup. Исходные `update_id`, `message_id`,
  envelope, text/caption и media state сохраняются. Message IDs сортируются численно
  внутри scope; update ID является ключом дедупликации, а не порядком input.
- Scope содержит bot, trusted profile, owner user, chat и topic. Каждая batch имеет
  уникальную identity/nonce. Callback проверяет actual `callback_query.from`,
  collector message, nonce и текущую фазу; автором callback не считается bot message.
- Перед внешним intake сохраняются ordered source items, полный сериализованный
  body, его digest и deterministic request ID. Повтор читает эти байты; добавления
  не меняют frozen input. Равное число сообщений не означает одинаковую batch.
- One-task означает один `userTaskId` на один принятый aggregate. MCP без агента
  может иметь ноль Agent Runs. Новая попытка той же задачи требует явного решения
  CP и новой generation/run identity; network retry не является новой попыткой.
- Task Store — источник статуса. Busy/unknown не снимается по timeout, отсутствию
  старого agent process или неуспешному status fetch. Cold DO recovery сохраняет
  inputs, launch phase, lease и известные task/run/delivery identities.
- Collector — отдельная pre-task UI сущность. Task receipt/terminal доставка
  остаётся у delivery owner. Legacy quarantine и cutover/tombstones неизменяемы;
  collector не получает выдуманный CP accepted timestamp для обхода fences.
- Unknown initial Telegram send ACK не разрешает новый send. Известный message ID
  используется для последующих edits; unknown outcome удерживается и сверяется.
  Нет гарантии exactly-once Telegram delivery при потерянном provider ACK.

Для каждого сценария evidence включает pinned gateway/CP/Runner/native revisions,
resource namespace, sanitized действия пользователя и соответствие IDs. До intake
доказывается отсутствие принятой задачи, а не только пустой gateway cache. После
intake фиксируются request/body digest, `userTaskId`, conversation/profile,
generation, canonical run ID при наличии, admission/dispatch и terminal result.
Provider evidence различает collector message ID, task receipt и terminal message
IDs, scope, attempts и стабильность повторных readbacks. Routing-history ID,
HTTP 200 или сообщение «запущено» не доказывают native execution.

## 4. Сценарии накопления и маршрутизации

### UX-01. Собрать одну цель из нескольких сообщений

- **Цель:** написать задачу частями и получить один результат по полному input.
- **Действие:** отправить несколько text updates, дождаться 1500ms тишины, открыть
  collector и нажать запуск. Воспроизвести reordered delivery и duplicate update.
- **Наблюдение:** один collector, дальнейшие изменения через тот же provider ID;
  все уникальные sources в числовом порядке; до запуска ноль задач/runs; после
  запуска один aggregate digest/request ID и одна задача с ответом в исходном topic.
- **Отрицательный инвариант:** нет per-message quick reply/intake, потери элемента,
  нового collector из-за повторного alarm или запуска от одного debounce.

### UX-02. Быстрый intent по полному aggregate

- **Цель:** получить точный ответ без ненужного агента.
- **Действие:** собрать вопрос о health/capabilities; последней репликой добавить
  ограничение, меняющее смысл предыдущей. Запустить весь накопитель.
- **Наблюдение:** CP получает frozen aggregate и выбирает зарегистрированный
  catalogue intent/handler; durable answer и task delivery; для выбранного
  agent-free fixture ноль native admissions/dispatches.
- **Отрицательный инвариант:** шлюз не классифицирует первое сообщение отдельно;
  упоминание capability не выдаётся за фактический вызов её handler.

### UX-03. MCP instruction с переходом к агенту

- **Цель:** выполнить catalogue action, которому нужна агентская работа.
- **Действие:** использовать зарегистрированную test capability с явной instruction,
  требующей Agent Run; launch после полного накопления.
- **Наблюдение:** catalogue version/capability и route outcome связаны с одной
  задачей; instruction и Agent Run относятся к ней; scoped bindings применены;
  фактические tools, native outcome и artifact bytes подтверждены независимо.
- **Отрицательный инвариант:** instruction не объявляется готовым результатом;
  escalation не создаёт второй intake или отдельный неучтённый агентский запуск.

### UX-04. Агентская цель вне готового catalogue handler

- **Цель:** получить результат работы, а не фиктивный fast answer.
- **Действие:** собрать test CSV goal, публичный immutable input URI и требования
  к output разными сообщениями; проверить input и запустить.
- **Наблюдение:** CP route ведёт к агенту; один первоначальный admission/dispatch;
  реальные model/tool evidence, canonical identity, output hash/bytes и Telegram
  delivery совпадают. Необходимое чтение input подтверждается конкретным tool output.
- **Отрицательный инвариант:** generic ответ, fabricated artifact ref и download
  сами по себе не доказывают отдельное локальное чтение файла или создание output.

### UX-05. Неполная цель или недоступная capability

- **Цель:** понять, что нужно дополнить или подключить.
- **Действие:** накопить запрос без обязательного аргумента либо с disabled binding;
  запустить, затем дать ответ на scoped awaiting.
- **Наблюдение:** CP выдаёт typed instruction/readiness/awaiting outcome; вопрос
  соответствует задаче и scope; ответ продолжает правильную задачу через signal
  или другую документированную CP операцию, без повторного intake этой batch.
- **Отрицательный инвариант:** модель не повышает права; gateway не маркирует
  credentials verified и не заменяет отсутствие binding произвольным backend.

## 5. Работа во время выполнения

### UX-06. Busy: накопление без решения за пользователя

- **Цель:** дописать новую просьбу, пока выполняется предыдущая.
- **Действие:** при active задаче A отправить сообщения B; нажать запуск B.
- **Наблюдение:** B durable и виден в отдельном collector; активная A сохраняет
  свои task/run IDs. Пользователь видит явный выбор queue/parallel/stop-with-addition,
  а отсутствие выбора сохраняет input без запуска.
- **Отрицательный инвариант:** нет скрытого auto-queue, silent parallel, потери B
  или снятия busy из-за timeout/ошибки status read.

### UX-07. Busy: явно поставить в очередь

- **Цель:** выполнить B после A в заданном порядке.
- **Действие:** выбрать «В очередь»; повторить callback и перезапустить collector DO.
- **Наблюдение:** одна durable queue intent для frozen B; CP admission policy
  определяет момент создания task, но execution B начинается после достоверного
  освобождения A. Показаны связь и порядок A/B; duplicate choice не создаёт вторую B.
- **Отрицательный инвариант:** collector и CP не создают две независимые очереди;
  поздний completion другой generation не освобождает актуальную очередь.

### UX-08. Busy: явный параллельный запуск

- **Цель:** выполнить независимую B, не прерывая A.
- **Действие:** выбрать «Параллельно» для B с известными budget и permissions.
- **Наблюдение:** отдельные task/run identities и execution session/lane scope;
  A остаётся active; результаты и provider messages однозначно относятся к A/B.
  Если CP policy не поддерживает parallel, показывается явный отказ без dispatch.
- **Отрицательный инвариант:** parallel не снимает single-writer lock общего
  workspace/engine session и не расширяет права; один callback не запускает B дважды.

### UX-09. Стоп и запуск с добавкой

- **Цель:** изменить работающую задачу, сохранив прежний input и новые уточнения.
- **Действие:** накопить additions B и выбрать остановку A с добавкой; проверить
  собранный input до подтверждения. Повторить callback при stop_pending.
- **Наблюдение:** stop request относится к точной A; до наблюдаемого остановленного
  исхода новый конфликтующий run не стартует. CP фиксирует, является ли продолжение
  новой generation A или связанной новой задачей. Эта операция задаётся контрактом
  до реализации, а UI показывает выбранную семантику. Новый snapshot содержит
  исходную цель, необходимые context/result refs и все additions.
- **Отрицательный инвариант:** HTTP ACK отмены не равен engine stopped; additions
  не исчезают; старая кнопка не запускает сохранённую последнюю реплику вместо aggregate.

### UX-10. Cancel, hold и отмена очереди

- **Цель:** прекратить запуск или исполнение без потери черновика.
- **Действие:** отменить queued intent, остановить активную задачу либо удержать
  collector; затем отправить новое сообщение и явно выбрать дальнейшее действие.
- **Наблюдение:** отменяемый объект назван в UI; cancel/hold имеет durable phase;
  input доступен для просмотра. Удаление input — отдельное подтверждённое действие.
  Alarm, stale callback и поздний task event не обходят hold.
- **Отрицательный инвариант:** cancel collector не выдаётся за cancel engine;
  stop не оставляет скрытого launch-after-release, запускающего следующую batch.

### UX-11. Recovery сервиса и пользовательская новая попытка

- **Цель:** пережить restart без лишней работы либо явно повторить неуспешную задачу.
- **Действие:** остановить isolate/API в разрешённом sandbox после freeze/acceptance;
  восстановить и прочитать состояние. Отдельно подтвердить retry terminal failure.
- **Наблюдение:** технический restart сохраняет task/generation/canonical run и
  admission/dispatch counts; polling recovery подтверждён новым процессом и временем.
  Явная новая попытка получает новые run/generation по CP policy с сохранёнными
  source refs; пользователь видит её отличие от reconciliation.
- **Отрицательный инвариант:** «перезапуск» не означает root/systemd операцию из
  Telegram callback; unknown/connection_lost не создаёт новую попытку автоматически.

## 6. Разговоры, ответы и media

### UX-12. Продолжение цели и выбор другого разговора

- **Цель:** «А теперь добавь итог по месяцам» продолжает прежнюю работу, а явный
  выбор нового разговора изолирует новую цель.
- **Действие:** завершить test category-summary, затем накопить follow-up; отдельно
  выбрать другой conversation до launch. Использовать non-Google fixture.
- **Наблюдение:** CP получает conversationRef и сохранённый контекст нужной цели,
  source/output refs и правила dedup; follow-up имеет собственный task в том же
  conversation. Explicit new conversation не наследует private input другой области.
- **Отрицательный инвариант:** legacy engine session ID не подменяет conversation
  или task; gateway не угадывает чужую историю по username/старому picker cache.

### UX-13. Reply на уточнение и reply на старый результат

- **Цель:** ответить на вопрос задачи, не начать случайно новую работу.
- **Действие:** reply на актуальный awaiting prompt; затем reply на старое сообщение
  при нескольких задачах и duplicate update.
- **Наблюдение:** reply mapping связывает provider message с task/awaiting/generation;
  scoped answer фиксируется один раз. Неоднозначный или устаревший reply требует
  выбора; reply на terminal result создаёт follow-up только по соответствующему контракту.
- **Отрицательный инвариант:** ответ не уходит «первой awaiting задаче чата»;
  callback и reply другого owner/topic не могут сигналить private задачу.

### UX-14. Text, voice, photo/document и caption

- **Цель:** передать полный набор материалов в исходном порядке.
- **Действие:** отправить text + voice + captioned attachment + final text;
  проверить draft, затем launch. Индуцировать prep failure и unsupported media.
- **Наблюдение:** source envelopes, captions и refs сохранены; готовые media имеют
  фактический transcript/artifact provenance. Pending/unsupported видны в collector
  и inspection; partial launch блокируется. Retry не теряет ранее принятые материалы.
- **Отрицательный инвариант:** media tag или `tg-file:` не выдают за доставленные
  байты; caption не скрывает attachment; final text не вытесняет предшествующие files.

## 7. Input inspection, авторизация и контролируемые сбои

### UX-15. Draft и frozen Input Check

- **Цель:** увидеть именно тот input, который будет принят или был принят.
- **Действие:** открыть draft до launch, frozen input после launch и снова после
  новых additions/restart. Использовать длинный Unicode и forwards/entities.
- **Наблюдение:** draft и dispatch используют один assembler; frozen body/hash
  совпадают с фактическим `/intake` wire payload. Sources/chunks восстановимы;
  later additions не меняют snapshot. Private document отправляется правильному owner.
- **Отрицательный инвариант:** gateway input не маркируется «реальным input модели»
  без отдельно авторизованного native evidence; secrets/system credentials не попадают
  в inspection, journal URL, Telegram документ или публичный artifact.

### UX-16. Чужие callbacks и устаревшие кнопки

- **Цель:** управлять только своей batch/task и читать только свой input.
- **Действие:** wrong user/profile/chat/topic/bot, copied nonce, old collector ID,
  expired picker, duplicate callback и callback от предыдущей equal-sized batch.
- **Наблюдение:** refusal/ack без внешнего dispatch или disclosure; callback
  проверяется в том же durable ownership domain, что и transition. Допустимый
  shared-chat режим требует отдельной trusted policy, а не общего chat allowlist.
- **Отрицательный инвариант:** подписанный webhook не авторизует любого участника
  чата; editable callback data не меняет trusted profile/target; stale nonce не
  запускает текущий collector. Keyboard edits не принадлежат двум конкурентным owners.

### UX-17. Concurrent append/launch и unknown acceptance

- **Цель:** сохранить input и единственность задачи при гонках и потерянных ACK.
- **Действие:** совместить append, два launch callbacks и alarm; индуцировать crash
  после freeze, после intake acceptance до записи ACK и во время route response.
- **Наблюдение:** один atomic frozen snapshot/launch claim; поздние arrivals durable
  в следующей batch. Expired intake lease допускает reconciliation тем же request/body;
  ambiguous route удерживается до authoritative status. Cold recovery сохраняет
  исходные identities и original-update-to-batch mapping.
- **Отрицательный инвариант:** не создаётся новый request ID для unknown outcome;
  automatic route replay не запускает вторую работу; next equal-sized batch имеет
  новую identity, а replay старого update не становится её новым элементом.

### UX-18. Provider ambiguity и неизменность delivery quarantine

- **Цель:** не получать дубли collector/answer после таймаута или redeploy.
- **Действие:** индуцировать Telegram accepted-but-ACK-lost для collector create,
  receipt и terminal; redirect/5xx, cold DO recovery и concurrent drains.
- **Наблюдение:** durable claim предшествует provider mutation; unknown outcome
  виден и не пересылается вслепую; известные IDs стабильны. Pre-task UI records
  имеют отдельный kind, а historical quarantined records/tombstones остаются неизменны.
- **Отрицательный инвариант:** collector path не обходит task delivery fences;
  нет fake accepted timestamp, redirect forwarding credential-bearing request
  или объявления provider send успешным только по локальному enqueue.

### UX-19. Name-only выбор метода из авторитетного каталога

- **Цель:** выбрать нужное действие без загрузки описаний всей библиотеки.
- **Действие:** классифицировать frozen aggregate по текущему списку полностью
  описательных имён методов. Отдельно вернуть неизвестное имя, prose вместо имени,
  имя из старой версии либо имя, отсутствующее в каталоге текущего profile.
- **Наблюдение:** classifier request содержит name-only список методов без их
  prose descriptions; output выбора — точное имя. Evidence связывает выбор с
  version/digest и scoped списком. Только разрешённое текущее имя приводит к загрузке
  соответствующей instruction; дальше проверяются args, readiness и execution rights.
  Invalid choice или сбой classifier даёт typed reason и объявленный `agent`
  fallback после авторизованного collector launch. Исходный aggregate сохранён;
  причина деградации доставляется пользователю через существующего durable
  delivery owner с устойчивым delivery ID и без blind resend при потерянном ACK.
  Evidence различает enqueue, provider acceptance и unknown outcome; один и тот
  же task/request сохраняется при cold recovery и повторе routing.
- **Отрицательный инвариант:** нет fuzzy-match/угадывания метода, вызова unknown
  name, доступа по cached чужому каталогу или предварительной загрузки всех
  instructions. Нет молчаливого fallback, нового intake ради него или запуска
  до авторизованного collector launch. Описательное имя само по себе не выдаёт
  permission на действие; разрешённый `agent` fallback не вызывает unknown tool.

## 8. Метод воспроизведения и граница приёмки

Первый прогон — offline через настоящий выбранный Worker entrypoint, существующий
collector DO и CP adapter с captured wire bodies. SQLite/workerd concurrency и
cold recovery дополняют unit fixtures; fake KV или прямой вызов helper не заменяет
проверку durable append, callbacks, alarms и provider ambiguity.

Затем отдельно разрешённый test-bot прогон использует stable saved updates,
подтверждённый owner/chat/topic, bounded calls и реальные provider readbacks.
Для agent cases нужны независимые Runner/native/GHA/tool/artifact доказательства;
для quick cases — отсутствие engine admissions. Controlled failures выбираются
детерминированно, а не по случайной ошибке модели. Unknown outcome сначала
сверяется по прежним IDs, без нового submission «ради проверки».

Feature fork сохраняет UX baseline и изолированные bindings. Он не переносит
production webhook, secrets, credentials, live schedules или delivery namespace.
Форма кнопок обсуждается после воспроизведения целей и действий, отдельно от
изменения Task/Run semantics. Поддержка parallel, explicit retry, inspection или
media рекламируется только при наличии соответствующего CP adapter contract;
отсутствующая capability даёт честный typed refusal, а не legacy fallback.

Полная миграция UX, настоящее действие человека в Telegram, стабильный hostname,
Google access и production promotion — разные границы доказательств. Этот документ
не разрешает deployment, provider writes или автоматическое включение capability.

## 9. Привязка evidence к сценариям

Три вида evidence не заменяют друг друга. Локальный прогон использует исходники
и offline fixtures, включая настоящий workerd/SQLite, без внешнего Telegram,
CP, native или Google. Operator live означает отдельно разрешённый прогон
оператором через реальные sandbox transports с сохранённым update и независимыми
readbacks. Genuine human означает действие самого владельца в Telegram: ввод,
видимая кнопка, reply и полученный результат; воспроизведённый оператором webhook
не считается таким действием. Для каждого пакета доказательств указываются этот
вид, точные ревизии, конфигурационный namespace и конкретный сценарий.

| Сценарии | Локальное доказательство | Operator live доказательство | Genuine human доказательство |
| --- | --- | --- | --- |
| UX-01, UX-17 | Ordered aggregate, durable update dedup, frozen body/session/task при lost intake/route ACK и cold restart; три workerd случая новой композиции относятся к этой границе | Те же saved updates и digests, один task и допустимое число admissions, provider readback до/после replay | Несколько отдельных сообщений складываются в один понятный collector; человек запускает именно показанный aggregate |
| UX-02, UX-03, UX-19 | Captured name-only wire, закрытая проверка имени, отдельная загрузка выбранной instruction, authorized agent fallback и восстановление durable notice | Текущий scoped каталог и выбранная instruction, сохранённый input, фактические quick/engine effects, видимая причина деградации | Человек понимает результат выбора и fallback по доставленному сообщению, без внутренних логов |
| UX-04 | Generic profile не наследует CSV output requirements; wire и result mapping проверяются независимо | Native/GHA identity, tool/result/artifact evidence и Telegram delivery одной задачи; старый direct-mode CSV доказывает только свой путь | Человек отправляет задачу через collector, получает и проверяет нужный ему результат |
| UX-05, UX-12, UX-13 | Scope и awaiting/reply/context association, неизменность исходного aggregate | Один conversation/profile, нужный task/generation после ответа или follow-up, без подмены чужой истории | Человек отвечает на уточнение или предыдущий результат и видит правильное продолжение |
| UX-06–UX-11 | Busy queue/parallel/stop/cancel transition, callback ownership, отсутствие запуска после неподтверждённой остановки | Отдельные task/run identities, stop acknowledgement и наблюдаемый native terminal до разрешённой замены; API process restart сам по себе не доказывает stop-and-addition | Человек выбирает очередь, параллельность, отмену или изменение и видит соответствующее действие, а не только смену текста кнопки |
| UX-14–UX-16 | Media preservation/refusal, inspection authorization и stale/foreign callback negatives | Сохранённый полный input и private inspection в нужном chat/topic; media effects только после отдельной готовности адаптера | Человек проверяет свой input и не получает сообщение об обработке вложения, которое не передано исполнителю |
| UX-18 | Durable claim до mutation, unknown quarantine, redirects и concurrent drains | Реальные provider IDs/attempts, стабильные повторные readbacks, отсутствие blind resend | Человек видит один относящийся к его задаче результат; это наблюдение не заменяет provider ambiguity evidence |

Новая композиция имеет локальные workerd доказательства vertical launch и cold
recovery после lost intake/route ACK. Это не operator-live и не genuine-human
приёмка её сценариев. Historical live health/caps/CSV/controlled failure и API
restart из issue140 относятся к прежнему direct-mode пути; они не переносятся
автоматически на новый collector, профиль, базу или webhook.

### Отдельные границы неполной композиции

Media требует реального CP attachment contract и сохранения всех вложений до
запуска. До его появления смешанный input не запускается как текст с молча
отброшенными attachments. Legacy media tests не доказывают эту передачу.

Полный каталог требует актуального authorized списка реальных имён, selected-only
instruction retrieval и соответствующих bindings. Два bounded CP quick handlers
health/catalogue плюс `agent` fallback не являются полной MCP catalogue composition.
Расширенный лимит selector не доказывает, что CP уже передаёт весь каталог.

Stop acceptance требует не только CP native terminal confirmation, но и TG
адаптера остановки точной задачи, безопасного stop-and-addition и evidence нового
поколения/запуска без гонки со старым. Текущий TG отказ остановки является
fail-closed сохранением ввода, а не реализованным restart UX. API process recovery
той же задачи и пользовательская замена задачи — разные сценарии.

Visible fallback требует durable ответственности за обнаружение routing outcome
и enqueue notice до её снятия. Successful cached-route poll может восстановить
notice, но terminal status без полученного route outcome не доказывает, что
degraded notice отсутствует или уже доставлено. Provider unknown остаётся unknown;
его нельзя исправлять повторной отправкой с новым delivery ID.
