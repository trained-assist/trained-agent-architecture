# Scenario change: MCP user-key tool access via OpenCode (Epic #253)

- Draft PR: epic253-mcp-identity (trained-assist/trained-agent-architecture)
- Architecture issue: https://github.com/trained-assist/trained-agent-architecture/issues/253
- Implementation repo: trained-assist/trained-assist-mcp-host
- Gate: scenario-change PR открыт до runtime-кода (правило #187); PR остаётся открытым во время реализации и закрывается как финальная acceptance запись milestone A.

## Target UX / flow

1. Администратор sandbox вручную создаёт пользователя (identity server-side; self-registration — milestone C, не здесь).
2. Для пользователя выпускается персональный ключ (static token фазы A); ключ связан с ролью и ACL.
3. Пользователь подключает облачный MCP gateway в OpenCode; OpenCode использует персональный ключ.
4. Gateway отдаёт в каталог только инструменты, разрешённые роли пользователя.
5. Пользователь вызывает разрешённый инструмент нативным MCP tool call из OpenCode; результат наблюдаем в transcript и в следе шлюза.
6. Запрос инструмента другой роли отклоняется (denied) до исполнения.
7. Отзыв ключа или disable пользователя отвергает следующий запрос, в том числе из уже открытого клиента.

## Non-goals (этой редакции)

- OAuth / machine-to-machine access token flow — follow-up D.
- Полная веб-админка — milestone B/C.
- Self-registration на сайте — milestone C.

## Roles (baseline)

- `recruiter` — видит и вызывает recruiter-инструмент (deterministic synthetic result).
- Другие роли — recruiter-инструмент отсутствует в каталоге/ denied.

## Acceptance (milestone A, финал — I05.c)

- recruiter + личный ключ: native tool call успешен, result наблюдаем.
- Другая роль: tool отсутствует/denied; прямой cross-role вызов denied.
- Revoked key и disabled user: следующий запрос отвергнут, включая открытый клиент.
- Новый ключ + новая OpenCode-сессия через Session Manager повторяют успех.
- Negative auth проверяется дополнительно без LLM.
- Machine discovery/invocation (JWK run mode) не сломан.

## Links

- Work issue Z00: trained-assist/trained-assist-mcp-host — «Epic #253 Z00: sandbox map + Session Manager probe fixtures».
- Sandbox map: EPIC-253-SANDBOX-MAP.md (этот PR).
- Milestone B/C issues — создаются после приёмки A.
