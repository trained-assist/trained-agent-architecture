# Capability Catalog и быстрые ответы

Статус: architecture refinement · 30.09.2026. [Task Router](TASK-ROUTER-AND-MCP.md), [MCP](TASK-ROUTER-AND-MCP.md#5-mcp-несколько-adapters-к-одним-capabilities). Цель — маленький scoped brief для модели и общий contract исполнения для host/agent.

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
