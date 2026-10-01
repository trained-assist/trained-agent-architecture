# Capability Catalog и быстрые ответы

Статус: актуальная локальная спецификация capability catalog · 01.10.2026.

## Четыре режима, три Job types

| Capability mode | Исполнение |
|---|---|
| template | Готовый ответ/инструкция, deterministic response handler без LLM |
| deterministic | Заданный скрипт/handler с typed inputs |
| llm | Фиксированный recipe с подготовленными данными, без tools/fs автономии |
| agent | Адаптивный tool loop в Agent clean room |

template не добавляет четвёртый тип Job. Каталог задаёт supportedModes и preferredMode: одна capability может иметь несколько реализаций. Нужно не жёсткое «этот MCP всегда агент», а разрешённый executor contract по конкретному запросу/inputs/readiness.

## Метаданные

Stable capabilityId; краткий explicit label/aliases; version; supportedModes/preferredMode; inputSchema/required fields; bindings/scopes; effect type; freshness; outputSchema; readiness/enabled flags; documentation refs.

Эти поля — наш platform catalog contract, не утверждение о стандартных MCP полях. MCP facade публикует согласованную проекцию. Native tool names не переименовываются массово ради дефиса: стабильные IDs сохраняются, readable aliases/labels вводятся с compatibility. Ясность названия важнее длины и пунктуации.

Catalog не заменяет auth. «Умеем share-file» не означает, что конкретному пользователю уже доступна integration. Без email/login bindings возвращается required-input outcome, понятная инструкция и Awaiting user input; отсутствие email можно определить schema validation без дополнительной LLM.

## Brief

Tier 1 — короткие IDs/labels/mode tags и readiness для разрешённых capabilities. Tier 2 — relevant schemas/details по выбранным candidates. Brief строится из verified versioned metadata; original definitions сохраняются. Optional summarization не придумывает отсутствующие inputs/permissions.

Ключ scoped cache включает tenant/profile, permissions/bindings, catalog version и policy/context version. Не заменяем весь пользовательский input первыми/последними символами. Явные constraints остаются в prepared context; полный original сохраняется ref.

## Routing

Typed commands, validated template matches и известные deterministic operations идут без LLM. Regex URL/keywords — high-precision признаки вместе с intent: просьба прочитать live страницу отличается от текстового обсуждения процитированной ссылки. Adaptive external research ведёт к OpenCode; known fetch может быть deterministic handler + LLM recipe.

Для разговорного ввода базовый вариант — один полезный reply-or-route. Вариант двух этапов: bounded route/capability selection → template/handler/fixed LLM reply. Второй этап не обязательно LLM; два платных вызова не нужны, когда уже выбран template.

Сравниваем варианты на одном sanitized corpus: FAQ, missing input, Tilda/site capability, tool-free reasoning, live data, цитированные URL, ограничения в середине, недоступные integrations, wrong profile cache, invalid JSON и late attachments. Измеряем correct answer/action, false-fast, unnecessary-agent, p50/p95 и provider calls/usage. Не объявляем два этапа лучше до eval.

Фиксированная LLM не вызывает MCP сама: host выполняет разрешённый bounded handler и передаёт результат recipe. Agent MCP сохраняет собственный scoped interface. Эскалация конечна OpenCode; отсутствие прав/бюджета не устраняется confidence от модели.

## Explicit names и compact catalog v1 — 01.10.2026

Алгоритм и протокол исследования: [Task Router §11](TASK-ROUTER-AND-MCP.md#11-fast-path-v1-алгоритм-до-запуска-агента). Для fast path каталог компилируется в краткую проекцию; native MCP definitions сохраняют полные schemas/docs.

### Имена без поломки потребителей

Предложенная форма readable alias: domain + action + object + существенный qualifier, например recruiting_get_candidate_search_status, recruiting_connect_headhunter_account, engineering_get_pull_request_checks, documents_explain_file_sharing_requirements. Это **иллюстрации naming**, не имена существующих методов.

- Stable capabilityId — семантическая идентичность, version — контракт. routingName/displayLabel — ясное название; native MCP tool name — transport mapping.
- Однозначность важнее максимальной длины. Не включать бессмысленные слова, полный список args или все сценарии в имя. Выбранный стиль snake_case сохраняет совместимость существующей convention; дефисы не обязательны для экономии.
- «Что умеет продукт», «получить текущий статус» и «выполнить действие» — разные contracts. describe_site_creation_capabilities не должен маскировать create_and_publish_site.
- Routing aliases сначала добавляются в compiler/adapter. Native rename — позднее, отдельным compatibility PR с alias period/versioning, collision checks и consumer tests; не делать массовое изменение доменных repos во время приёмки PR.
- Alias и old name отображают один capability, не два одинаковых tools в model context. API/test/public references не ломаются ради wording.

### Brief имеет минимум смысла, а не только имена

Tier 1 entry: id, explicit routing name, one-line summary, supported/preferred modes, effect (none/read/write), data needs (none/prepared/live), input hints и availability/required binding facts. Имя одно не описывает permission/readiness, необходимость свежих данных и нужные args. Полные input/output schemas, constraints, template/recipe refs — Tier 2 только для candidates.

Пример иллюстративной проекции:

```json
{
  "id": "recruiting.search_status",
  "routingName": "recruiting_get_candidate_search_status",
  "summary": "Текущий статус выбранного поиска пользователя",
  "modes": ["deterministic"],
  "effect": "read",
  "data": "live",
  "required": ["searchId"],
  "availability": "enabled"
}
```

Summary о capability — factual catalog data; это не user profile dump. availability snapshot не заменяет повторную auth перед выполнением. Disabled capability может оставаться как явный факт/инструкция подключения, но не как executable candidate.

Дерево группирует домены/действия для discovery; не отдавать всю огромную библиотеку каждому вопросу. Pilot сравнивает full brief vs deterministic/retrieved shortlist; candidate recall измеряется отдельно. Не показывать лишь имена, если этим теряются effect/required inputs; максимум candidates выбирается по eval, не по догме.

### Source of truth и handler implementations

Compiler читает versioned domain manifests/resources и verified platform metadata. Если существующий manifest не содержит supportedModes/effects/templates, оформить metadata gap, не угадывать реализацию по названию. Один capability может поддерживать template/deterministic/llm/agent, но каждый advertised mode требует реального implementation binding и теста.

Generated outputs: compact brief, alias/native mapping, selected full schemas, catalogVersion/digest, coverage/gaps. CI проверяет collisions, неизвестные modes/bindings, dangling refs и drift definitions. Compiler source входит в pilot; generated catalog не правится руками и не становится вторым credstore.

### Acceptance каталога

На одинаковом eval измерить: tokens/latency, candidate recall, wrong capability/args, false-fast, unavailable capability selection. Longer names допускаются ради ясности, но утверждение «токенов стало меньше» требует замера **всего prompt**, включая summaries/schemas и повторные calls. Stable prefix/cache может помочь только при корректном scoped/versioned ключе.

Проверить: старые native callers работают; понятные aliases выбираются на новых перефразировках; read/write методы различимы; connect instruction не выдаёт permission; capability descriptions не обещают отсутствующую integration; template ответ не требует агентского workspace.

## Один каталог, несколько command adapters — 02.10.2026

Рекомендуемая canonical routingName: lowercase snake_case (underscore — разделитель). readable title допускает пробелы/локализацию. CLI может иметь подкоманды/дефисы; slash — Telegram syntax, не часть capability identity. Выбор пунктуации не является доказанной token optimization.

| Проекция | Иллюстрация |
|---|---|
| capabilityId | credentials.connect |
| routing/MCP alias | credentials_connect_cloudflare_account |
| Telegram alias | /connect_cloudflare |
| CLI | assist credentials connect --provider cloudflare |
| UI title | Подключить Cloudflare |

Все adapters обращаются к одному registered handler/schema; не обязаны иметь одинаковую строку. Telegram BotCommand: 1–32 символа, lowercase English letters/digits/underscore; длинное explicit MCP имя не всегда помещается. MCP 2025-11-25 рекомендует 1–128 символов и ASCII letters/digits/underscore/hyphen/dot; slash/spaces не входят в рекомендуемый набор. Проверять фактически используемые provider/client limits при генерации.

Источники:
https://core.telegram.org/bots/api#botcommand
https://modelcontextprotocol.io/specification/2025-11-25/server/tools#tool-names

Platform annotation (не стандартные MCP поля): commandAliases, channelExposure, uiTemplateIds, supportedModes, inputSchemaRef, effect/readiness, handlerRef/version. Compiler генерирует typed dispatch mapping и channel help; полные definitions остаются в manifest. Результат исследования имён — mapping old → canonical alias → TG/CLI/UI, collision/length report и consumer compatibility, не немедленный rename всех native methods.

Не парсить произвольный MCP text/описания как executable commands. Команда распознаётся channel adapter только в явном command context, с аргументами по schema. /command в процитированном документе не выполняется. /command@bot нормализуется Telegram adapter. Незарегистрированная команда проходит существующий catch-all, а не становится произвольным handler lookup.

Кнопки/формы — typed action с opaque interaction ref из [контракта взаимодействий](INTERACTIVE-EXECUTION-AND-USER-INPUT.md), не текст /command, который снова запускает агента. Каталог общий, но internal-only methods не обязаны быть доступны пользователю как TG/CLI command. Registry/auth определяют доступность каждого transport.
