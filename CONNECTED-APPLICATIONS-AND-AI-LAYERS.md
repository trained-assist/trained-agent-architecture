# Connected Applications: слои, AI capabilities и извлечение доменов

Статус: архитектурное предложение по запросу владельца · 05.10.2026. Это правило целевого разделения и задание для следующей сессии; инвентарь текущего рекрутинга/выставок и перенос кода ещё не выполнены.

Связанные правила: [ARCHITECTURE](ARCHITECTURE.md), [Capability Catalog](CAPABILITY-CATALOG-AND-FAST-REPLIES.md), [Integration Gate](EXTERNAL-INTEGRATION-GATE.md), [Engineering Approach](ENGINEERING-APPROACH.md), [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md). Документ не меняет владельцев Task Store, Runner, Broker и доставки. Статусы реализации и чек-листы — в issues.

## 1. Модель и термины

**Connected Application — подключённое доменное приложение / веб-сервис.** Рекрутинг и выставки — самостоятельные продукты со своими данными, интерфейсом и процессами. Они используют платформенные AI capabilities, но не становятся модулями ядра агента.

Три верхнеуровневых слоя:

| Слой | Состав | Владелец | Проверка без живой LLM |
|---|---|---|---|
| Presentation layer | Страницы, компоненты, формы, команды UI, состояния загрузки/ошибки, view models и привязки полей | Доменное приложение | Синтетические данные, UI/контрактные проверки |
| Domain layer | Data layer + deterministic business logic: сущности, хранение, API, события, переходы, расписания, интеграционные сценарии | Доменное приложение | Схемы, инварианты, сценарии, повтор/сбой |
| AI layer | AI bindings приложения + общие capabilities: понимание, сопоставление, коммуникация, извлечение, адаптивная работа агента | Приложение владеет bindings/политиками; библиотека — общим алгоритмом | Stub capabilities и отдельный eval реальных моделей |

Data layer и business logic — две самостоятельные части Domain layer. При их слиянии в одну «базу для агента» проблема смешанных абстракций возвращается.

**Integration adapter** — узкий доступ к HH/CRM/другому провайдеру: auth, API, pagination, rate limit, нормализация и webhook. **Capability** — версия проверяемой возможности независимо от транспорта. **AI binding** — описание, где и с какими параметрами процесс вызывает capability. **Capability pack** — группа для discovery и документации. **Service manifest** — машиночитаемое описание подключения приложения.

MCP, CLI и HTTP API — transport adapters к зарегистрированным контрактам. Удаление доменной группы из MCP-каталога не означает удаление провайдерских API или сценариев.

## 2. Основные правила ownership

1. Приложение владеет canonical domain data: кандидатами, вакансиями, откликами, сделками, контактами и их связями. Агент наполняет данные через domain API/commands; прямые записи в таблицы и обход правил не являются обычным интерфейсом.
2. AI возвращает предложение, оценку или извлечённые факты. Детерминированный handler валидирует результат и применяет разрешённое изменение. Решение «отправить», «архивировать», «перевести этап» имеет отдельный command contract.
3. UI и агент используют общие domain commands. Параллельные записи проверяют revision; повтор события/команды дедуплицируется. Владелец записи не переносится в clean room.
4. Domain state и platform Task Store различаются: этап кандидата — в приложении, исполнение задачи/Run — в платформе. Они связываются IDs; второй scheduler или второй источник статуса задачи не создаётся.
5. Платформа даёт исполнение, capabilities, bindings/credentials, журнал и доставку. Знания о таблицах и воронке рекрутинга в core не добавляются.
6. Универсальный метод извлекается при одинаковом контракте и проверяемой пользе минимум для двух конкретных сценариев. Совпадение слова «оценка» не доказывает одинаковую семантику.
7. Физическая граница репозитория и логическая граница слоя независимы: по одному самостоятельному repo продукта, а не обязательный repo/микросервис на каждый слой.

## 3. Контракт подключения приложения

Ниже проектные поля, не стандарт MCP и не утверждение о существующей реализации. MVP описывается versioned JSON/YAML + JSON Schema; собственный DSL и новый универсальный orchestration engine не нужны.

| Блок | Обязательные параметры |
|---|---|
| Identity | serviceId, contractVersion, ownerRepo, release/sourceRevision, environment |
| Access | endpointRef, tenant/profile binding, project/resource scope, credentialBindingRefs, enabled/readiness |
| Data | entity schemas, stable IDs, relations/cardinality, unique keys, revision, source/provenance, artifact refs, retention |
| Commands | commandId/version, input/output schemas, effect, required scopes, idempotency strategy, concurrency check, errors |
| Events | eventId/type/version, source object ID, occurredAt, dedup key, ordering/replay policy |
| Views | viewId, viewModelSchemaRef, field/component bindings, readQueryRef, actionCommandRef, empty/loading/error states |
| Workflows | trigger, preconditions, deterministic steps, transitions, AI binding refs, failure/recovery policy |
| AI bindings | Поля раздела 4 |
| Fixtures | synthetic dataset refs, ожидаемые состояния/связи, сценарии повторов и сбоев |
| Compatibility | supported contract versions, deprecations, legacy alias mapping |

View binding связывает компонент с view model; не описывает DOM селектор как бизнес-контракт. Динамический UI не обязан быть статическим шаблоном. Manifest не содержит пароли, токены, реальные персональные данные или executable code из непроверенного текста.

«Комплаенс» здесь точнее назвать **contract conformance** — соответствие схемам/контрактам. Business invariant validation проверяет смысловые ограничения: отклик связан с существующей вакансией, архив принадлежит конкретному поиску, кандидат не получает повторное тестовое. Юридический compliance — отдельная тема.

## 4. AI binding: место стыковки процесса и AI

| Поле | Значение |
|---|---|
| bindingId / version | Стабильная точка вызова приложения |
| trigger / preconditions | Событие или команда и условие запуска |
| capabilityId / compatibleVersion | Общая возможность и диапазон совместимости |
| executionMode | template / deterministic / llm / agent; соответствует действующему каталогу |
| inputMapping / inputSchemaRef | Из каких domain fields/queries берутся аргументы |
| contextRefs | История, документы, требования, source versions; полные данные доступны по refs |
| policyRef / policyVersion | Доменные цели, критерии, ограничения, язык, правила процесса |
| outputSchemaRef / validation | Проверяемый результат; некорректный ответ не становится domain state |
| applyCommandRef | Как результат применяется; может отсутствовать для draft/read-only |
| stalenessPolicy | Проверка исходных revisions перед применением; порядок отмены/пересчёта |
| timeout / budget / retryPolicy | Ограничения; повтор анализа отделён от повтора внешней мутации |
| failureOutcome | pending/failed/Awaiting user input/manual review по сценарию |
| observability | userTaskId/runId при наличии, eventId, binding/capability/model/prompt versions |

История диалога не обрезается произвольными «8 сообщений по 500 символов». Передаётся полная история либо versioned summary + обязательства/неотвеченные вопросы + ref на оригинал; отдельный eval проверяет отсутствие повторных вопросов и потери условий.

AI результат фиксирует sources/revisions, uncertainty и gaps. При изменении вакансии или истории прежняя оценка/сообщение не применяется молча. Eval качества генерации не смешивается с тестом транзакции применения.

## 5. Какие методы сохранять и куда переносить

Имена ниже — целевые примеры, не инвентарь существующих методов.

| Текущий смысл | Целевая ответственность |
|---|---|
| Получить HH отклики/резюме, отправить HH сообщение | Узкий provider adapter; доступен через нужный транспорт |
| Принять отклик, связать с вакансией, обновить воронку | Recruiting Domain layer |
| Определить статус коммуникации, цель следующего шага, составить сообщение | Общие communications capabilities + recruiting policy |
| Оценить кандидата по вакансии | Общая match capability + recruiting criteria/eval + domain apply command |
| Холодный поиск, мониторинг, звёзды/архив на вакансию | Recruiting workflows/data; HH adapter используется внутри |
| Распознать визитку | Общая extraction capability + contact schema |
| Найти существующий контакт, дедуплицировать, создать сделку | CRM/Exhibitions deterministic business logic + CRM adapter |
| Экран вакансии, карточка кандидата, экран выставки | Presentation layer соответствующего приложения |

### Matching

Предпочтительное базовое понятие — **profile-to-criteria match**, а People Match — удобное название группы. Вход: subjectProfile/ref, targetCriteria/ref, criteriaPolicy/version, evidence/source refs, locale, outputSchemaVersion. Выход: criterionResults (met/not_met/unknown, evidenceRefs), gaps, uncertainties, summary; score только с явной scoring policy.

Найм, знакомства и встречи имеют разные допустимые критерии, правила и eval. Не делать универсальную «оценку ценности человека» и не выдавать произвольный confidence за вероятность успеха. Доменные wrappers могут сохраниться как recipes с устойчивым контрактом. Повторно используется ядро сопоставления; найм и воронка из него не исчезают.

### Communications

Отдельно описать уже существующие контракты status extraction → goal determination → next message. Общими являются обработка истории, выявление вопросов/ответов и подготовка сообщения. Цель «предложить тестовое после согласия» задаёт recruiting workflow. Генерация draft не отправляет сообщение; доставка выполняется отдельной provider command.

### CRM capability pack и раскрытие деталей

Один верхнеуровневый пункт **CRM Management** в discovery — разумная группировка. Имя CRM Management Notes лучше оставить документации: слово Notes плохо объясняет создание сделок.

Путь: краткое описание группы → выбранный connection binding → provider-specific schemas/docs → registered command либо bounded agent execution. Редкие команды не занимают постоянный system prompt.

Сведения о CRM хранятся явно: connectionId, providerId, account/baseUrlRef, credentialRef, granted scopes, readiness. Название/содержимое токена не являются надёжным способом определить провайдера. Наличие credential не доказывает работоспособность: проверить auth и нужные scopes.

Документ/инструкция объясняет работу; executable capability действительно выполняет её. Один facade допустим с typed operation enum и schema validation, но произвольная строка «сделай всё» не заменяет контракты. Fast answer может показать инструкцию; реальную запись исполняет handler/agent, после чего возвращает подтверждённый результат.

## 6. Репозитории и dependencies

- Recruiting application repo: UI, data schemas/migrations/API, workflows, AI bindings/policies, fixtures, domain tests. Сначала найти фактический existing repo; новое имя и перенос выбирать по inventory.
- Exhibitions application repo: те же части для выставок/контактов/сделок. Уже названный источник — flexi-consulting/exhibitions; новый repo не создавать только ради нового названия.
- Shared capabilities: существующие communications/extraction/matching implementation repos, если пригодны; новый repo только при доказанной отдельной ответственности.
- Integration Gate / provider adapters: совместно используемые внешние API; не копировать HH/CRM clients по приложениям.
- Core/Control Plane/Runner: инфраструктура без UI/данных/воронки приложений.
- Architecture repo: правило, межкомпонентные контракты, решения и навигация. Код и runnable tests — в implementation repos.

Зависимости: приложение → контракты общих capabilities/provider ports; platform catalog → versioned descriptors; runtime → registered implementation. Общий matching не импортирует recruiting schemas, а core не импортирует private application tables.

«Внешний repo» означает независимый от ядра; не означает публикацию закрытого кода/данных в public или смену владельца организации.

## 7. Тестирование отдельно по границам

1. Presentation: synthetic dataset, пустая и полная карточка, unknown/ошибка AI, loading, устаревшая оценка, соответствие полей view schema.
2. Data: schemas, связи, isolation по tenant/project, migration round-trip где допустим, ограничения и revisions.
3. Deterministic workflows: AI stub, duplicate/out-of-order event, restart, timeout провайдера, запрет повторной отправки, concurrent UI/agent update.
4. AI capabilities: curated eval corpus, источники и unknown, критерии, отсутствие придуманных фактов, статус/цель/неповторяющееся сообщение. Схема JSON — необходимое, но недостаточное доказательство качества.
5. AI bindings: правильный mapping, missing fields, stale result, version mismatch, failure outcome, отсутствие credential в prompt/log.
6. Сквозной test-account smoke: provider event → domain record → AI result → UI → permitted command. Синтетические данные и stub не выдаются за provider integration.

Минимальные recruiting сценарии: неполное резюме → только недостающие вопросы; полное → вопрос о готовности к тестовому; согласие → тестовое ровно один раз; результат → оценка/следующий этап. Отдельно cold search/мониторинг и звёзды/архив по вакансии.

Exhibitions сценарии: визитка → contact draft → исправление → дедуп → CRM contact/deal → отображение. Фактические пользовательские сценарии подтвердить по коду/issues: эта последовательность пока иллюстрация.

## 8. Переход и удаление лишних tools

Порядок: inventory → contracts + fixtures → независимый vertical slice → compatibility adapter → переключение подтверждённых consumers → удаление старой реализации.

Для каждого старого tool составить строку:
old tool/id/version → source repo/path/SHA → callers → layer → target owner → replacement binding → compatibility → evidence → retirement condition.

Возможные решения: keep-provider, extract-shared, move-domain, convert-to-resource/recipe, alias/deprecate, delete-proven-unused. Нельзя массово удалить всё с recruiting prefix: среди него могут быть необходимые HH операции.

Сначала уменьшить exposure: оставить pack brief, раскрывать релевантные schemas, убрать duplicates из prompt. Затем переносить ownership и лишь потом удалять handlers. Скрытие из каталога, deprecation и физическое удаление — разные изменения.

Каждый PR атомарный и откатываемый. Межрепозиторный перенос не считается атомарным: нужен совместимый интервал и порядок релизов. Миграции данных по expand/contract, один canonical writer. При откате AI/schema versions остаются читаемыми; неизвестный исход внешней записи сначала reconciled, не повторён вслепую.

## 9. Промпт для агента: аудит и декомпозиция

Ты выполняешь декомпозицию recruiting и exhibitions в Connected Applications по этому документу. Цель — независимые проверяемые продукты и компактный capability catalog, сохранение рабочих сценариев.

### Вход и ограничения

Начни с README/AGENTS и актуальных issues/PR каждого repo. Изучи архитектурные contracts и active integration work до изменения их границ. Найди фактические recruiting UI/backend, HH skill, sales/CRM, communications и MCP catalog. Источники поиска: trained-assist repos, flexi-consulting/exhibitions; релевантные текущие вопросы — trained-assist-agent#2133 и exhibitions#13. Читай актуальные тексты; не принимай старые комментарии/предположения о процессах/commits за факты.

Для кода фиксируй repo + branch + SHA + source path; для deployment — endpoint/process/service identity отдельно от source commit. Отсутствие доступа отмечай как пробел, не заполняй выдумкой.

Не вмешивайся в чужой рабочий checkout и текущую интеграторскую сессию: собственные ветки/workspaces, без изменения production endpoints, credentials, deployments/webhooks. Работай сначала там, где можно ускорить интеграцию независимыми schemas, fixtures, bindings и domain modules. Не заменяй эту работу редизайном Control Plane/Runner.

### Что сделать

1. Создай work issue/эпик для декомпозиции, ветку и ранний draft PR; сохраняй результаты commits/push.
2. Составь фактический inventory компонентов, tools, consumers, data stores/writers, cron/webhooks, UI routes и пользовательских сценариев. Различай найдено, предположение, неизвестно.
3. Для каждого продукта опиши три слоя; внутри Domain layer раздельно data и deterministic workflows. Назови owner каждой сущности/команды и точки AI вызова.
4. Построй tool migration matrix раздела 8; отдельно список дубликатов, domain-specific wrappers и узких provider operations. Не удаляй tools по одному названию.
5. Подготовь service manifest, entity/view/command/event schemas, AI bindings и synthetic fixtures. Проверь схемы, references и invariants runnable командой.
6. Проверь абстракции communications/matching/extraction на существующих контрактах и двух конкретных use cases. Сохрани доменные policies и eval. Если повторное использование не доказано — оставь domain recipe и поясни.
7. Подготовь независимые application repos: используй существующий exhibitions repo; recruiting repo выбери после inventory. Уточнение неизвестного организационного owner не блокирует локальные contracts/fixtures и draft PR. Дай для каждого repo layout, dependencies, bootstrap/check commands.
8. Реализуй по одному малому vertical slice для recruiting и exhibitions с AI stub; не переносить весь продукт одним PR. Реальное AI/provider подключение — следующими совместимыми PR.
9. Сделай compact packs/lazy disclosure в каталоге по действующей спецификации. Сравни весь prompt до/после: tokens, candidate recall, правильность args, unavailable selection; не объявляй сокращение по количеству tools.
10. Добавь compatibility shims и consumer tests. Удаляй старую реализацию только после replacement evidence; если условие удаления не выполнено, оставь явно описанную deprecation задачу.
11. Обнови architecture navigation и docs принятых контрактов; evidence/статусы/чек-листы — в issues. Остановись перед merge/deploy, если отдельно не разрешены.

### Выход сессии

- Ссылки на issues и сохранённые PR; inventory с pinned sources.
- Карта слоёв/ownership по обоим продуктам и migration matrix всех затронутых tools.
- Versioned manifests/schemas/AI bindings + runnable fixtures/tests.
- Список реально извлечённых общих capabilities и domain recipes.
- Compatibility/release/rollback порядок и конкретные условия удаления старого пути.
- Отчёт проверок: что прошло локально, что на test account, какие live проверки остаются.
- Короткий следующий prompt с repo/issue/PR/commands и блокерами, без пересказа всей архитектуры.

Успех: UI тестируется на synthetic data, процесс — с AI stub, AI — отдельным eval; общий каталог не содержит бизнес-процесс целиком; агент и UI меняют данные через один контракт; ни один необходимый provider tool или пользовательский сценарий не потерян.
