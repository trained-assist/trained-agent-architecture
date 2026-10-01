# Интерактивное выполнение: формы, выбор и Awaiting user input

Статус: предлагаемый контракт · 02.10.2026. Отдельное направление от fast-path routing; совместимый research pilot, без изменений живого Telegram/Web/Runner. Общая архитектура: ARCHITECTURE.md; routing: TASK-ROUTER-AND-MCP.md; IDs: USER-TASK-IDS-AND-REPORTING.md.

## 1. Проблема и цель

Просьба довести задачу до конца не означает запрета взаимодействовать с пользователем. Сейчас отсутствующий ключ/решение может превращаться в новый текстовый запрос и новый Agent Run лишь для генерации формы. Агент тратит токены на угадывание, а пользователь не понимает, что от него требуется.

Цель: агент, LLM recipe и deterministic handler возвращают typed interaction; host сохраняет её и показывает UI. Нажатие «Ввести ключ» открывает форму напрямую. Ожидание не требует живого agent process. Ответ продолжает конкретную задачу, а не случайную последнюю сессию.

## 2. Две независимые оси

Execution mode: template / deterministic / llm / agent. Interaction policy: самостоятельность и допустимые вопросы. Они не образуют один общий «режим агента».

Предлагаемые явные настройки задачи:
- interactionMode=as_needed (default): делать самостоятельно, спрашивать при существенной неоднозначности/блокере;
- interactionMode=collaborative: допускается согласование промежуточных решений;
- interactionMode=unattended: не ждать обычных уточнений; использовать только разрешённые defaults, иначе завершить/приостановить с blocked и описанием нужного действия.

End-to-end — цель результата, не mode=no_questions. Ни один mode не отменяет обязательные approvals, credentials или права. В unattended нельзя выдумывать ключ/согласие. Пользователь может изменить policy через UI; host фиксирует версию.

Первичная LLM может предложить interactionMode/domain/intent с reason, но explicit preference пользователя имеет приоритет. Не спрашивать «какой режим?» на каждом запуске. При неопределённости — as_needed, не безусловный запрет общения. Collaborative не означает спрашивать permission на каждый обратимый шаг.

## 3. Structured interaction вместо текста команды

Логическая структура (wire schema разрабатывается в пилоте):

```json
{
  "kind": "awaiting_user_input",
  "interaction": {
    "type": "credential_connect",
    "templateId": "credentials.connect",
    "provider": "cloudflare",
    "title": "Подключите Cloudflare",
    "required": true,
    "resumePolicy": "continue_task"
  }
}
```

Это новый результат domain/application contract, а не утверждение о стандартном MCP поле. Existing reply-or-route clarify также преобразуется host в interaction. Идентификаторы/ownership выдаёт host, не модель. Template/provider — из разрешённого registry, а не произвольный URL/HTML/shell в ответе модели.

Типы: choice, text_input, form, credential_connect, approval, upload, external_action. Registry расширяемый: ZeroCreds — adapter credential_connect, не единственный тип UI. Опциональные reply.actions могут существовать без остановки задачи; required interaction создаёт ожидание. Информационная кнопка не является approval.

Каждый type определяет inputSchema, handler, validation, renderer/fallback, expiry/cancellation, effect, completion evidence и resume policy. Text label «Отправить ключ» не является исполняемой инструкцией.

## 4. Поток

1. Producer возвращает interaction proposal с необходимыми данными/checkpoint refs.
2. Host валидирует, сохраняет wait + interaction + task transition атомарно; лишь после этого доставляет UI.
3. Web показывает каноническую карточку задачи и ожидаемые действия; Telegram — кнопки/ссылку. Click несёт opaque interaction/action reference и проверяется по principal/task/version.
4. Handler без LLM открывает форму/выбор/ZeroCreds session. Он не отправляет label кнопки как обычный chat message в Router.
5. Submission/callback валидируется и дедуплицируется. Completion сохраняется durable; UI обновляется даже при отсутствии agent process.
6. Если это required wait, continuation owner продолжает нужный шаг после проверки state/generation/policy. Resume использует прежний userTaskId, checkpoint/context; новая jobId/runId только если реально нужен новый execution. Если достаточно template/handler — агент вообще не запускается.

Resume может быть native engine resume или новый Run с checkpoint; это проверяемая capability engine, не обещание бесплатного возобновления процесса. Пока пользователь думает, clean room не обязан удерживать VM-процесс. Durable task/workspace retention сохраняется по общей storage policy.

Не выбирать агентский rerun только из-за «кнопка нажата». Запуск нужен, когда после результата формы остаётся агентская работа. Для «получили мой ключ?» readiness handler возвращает состояние binding, а не сам секрет и не фантазию LLM.

## 5. Credentials и внешние формы

credential_connect создаёт scoped form session через host adapter. Секрет идёт в Credential Broker/ZeroCreds integration; в Task Store, model context, callback payloads и логах — только bindingRef, status и безопасные metadata.

Состояния различаются: form_created / submitted / stored / validated / ready / failed / expired. «Я отправил ключ» не доказывает ready; stored не доказывает, что provider принял ключ. Дополнительный validation допустим только разрешённым bounded handler. Агент получает факт готовности/ограничений, не значение.

Callback аутентифицируется и привязывается к ожидаемой form session/profile/task; preflight не считается submit. Повторный webhook не повторяет продолжение. Произвольное имя provider или callback URL из LLM не исполняется.

## 6. IDs и независимость от чата

- userTaskId: стабильная задача;
- interactionId: конкретная форма/запрос действия и UI;
- waitId: конкретное ожидание continuation; optional для информационной кнопки;
- actionId: зарегистрированная операция кнопки;
- submissionId: дедуп ответа/callback;
- providerSessionRef: внешняя форма, внутренний ref;
- generation/version: отклонение устаревшего ответа;
- jobId/runId: execution, если нужен; gtdId только при explicit control.

Одна задача может иметь несколько взаимодействий: у каждого scope, очередь/порядок и условия завершения. Ответ в другой вкладке/канале адресуется interactionId/waitId. Свободное «да» при нескольких ожиданиях не назначается случайной задаче: предложить выбрать. Telegram message IDs — delivery mappings, не primary task identity.

Wait record хранится Task Store; Reporting — view; continuation выбирает существующий workflow/Output owner. Не вводим второго контроллера, не делаем новый GTD на каждую форму.

## 7. Прерывания и ошибки

- Ответ пришёл до wait registration: durable inbox по IDs, потребление после registration; не терять ранний ответ.
- Duplicate/out-of-order callbacks: dedup + valid transition; ровно одно продолжение.
- Task cancelled/terminal, wait expired/superseded: сохранить history, не оживлять задачу. Разрешённый restart — явное действие.
- Неиспользованный ответ после edit/version bump: показать stale action и актуальную форму.
- Form service недоступен: typed failure/retry, понятный статус; не новый Agent Run ради той же формы.
- Потеря delivery: Web видит durable interaction, повторная доставка не создаёт новую форму.
- Pause/checkpoint/upload failure: не уничтожать ещё не сохранённый workspace; следовать Runner storage contract.

Не все choices требуют полного pause: независимая безопасная работа может продолжаться по declared policy. Это фиксируется явно, не угадывается движком.

## 8. Research B: что искать в истории

Этот корпус отдельный от Research A (fast path), но часть примеров общая. При малом объёме истории — вручную размеченные примеры и synthetic edge cases; отсутствие данных не заменять выдуманным доказательством.

Искать последовательности:
1. Агент просит key/email/login/документ → кнопка/команда → новый Run → генерация формы. Label: direct_form_possible; сколько лишних calls/startups.
2. Пользователь говорит «отправил», «готово», «да» → модель угадывает состояние или запускается без lookup. Проверить доступный completion evidence.
3. Требуется выбор (вариант сайта, scope, стратегия research), но агент угадывает из-за end-to-end prompt; user correction/rework/потерянные результаты.
4. Агент спрашивает, ответ теряется или назначается другой задаче; продолжение после restart.
5. Реально лишние вопросы: явная цель/достаточные inputs, агента ничего не блокирует. Не оптимизировать в пользу бесконечного диалога.
6. Required approval vs optional preference vs credential vs missing fact: раздельные labels.
7. Исходный prompt «сделай до конца», explicit dialogue/unattended preference, menu label/action mapping, текущие task/wait refs, provider readiness — какие факты были доступны в момент решения.

Для каждого случая: sanitized preceding context, вопрос/предложенное UI, ответ/click semantics, возможный template/handler, required inputs, результат, retry/rerun counts, latency/usage если доступны. Secret values исключить. Production text не публиковать как fixture. Human review утверждает counterfactual «агент не нужен»; label не следует только из существующего поведения.

## 9. Pilot и приёмка

Research A: catalog/context/routing. Research B: взаимодействия и interrupt policy. Одна research-сессия может собрать оба корпуса, но отдельные наборы labels, metrics и результаты. Implementation owner один в pilot paths; не конкурировать с текущими PR/runtime.

Сначала один sandbox Web и Telegram-equivalent fixture, mocked form adapter и engine. Scenarios:
- «ввести ключ» → форма без model call/Agent Run;
- credential submitted/validated → детерминированный status;
- choice/text submission продолжает правильную задачу после restart;
- ранний/повторный/чужой/expired callback;
- отмена пока форма открыта; terminal позднее событие;
- collaborative/as_needed/unattended на одной задаче;
- агент закончил процесс до ответа, checkpoint позволяет продолжить;
- form service outage и delivery retry без дублей.

Отдельный live model eval: правильно ли предложены interaction и policy; offline scripted LLM replay проверяет только protocol. Измерять unnecessary runs for UI, correctly resolved waits, wrong-task resumes, speculative-action failures, user corrections, ask burden, completion quality, token cost и wait-free useful latency. До promotion подтвердить actual adapter callback/auth, credentials readiness и engine checkpoint capability.

## 10. Логи и границы

interaction_created/rendered/action_clicked/form_opened/submitted/validated/wait_resolved/continuation_scheduled/expired/rejected — trusted profile, userTaskId, interactionId/waitId, generation, safe reason, timing. Без ключей, текста чувствительных полей и произвольного callback URL. TTL/access по OBSERVABILITY-AND-ERROR-CONTRACT.md; UI-показ не требует LLM.

Ownership: control-plane interaction registry + waits/continuations; domain — templates/form adapters; gateways — render и authenticated input; Credential Broker — secrets; Runner — checkpoint/results. Подробности и контракты согласуются с существующими Task Store и conversation specs до wire implementation.
