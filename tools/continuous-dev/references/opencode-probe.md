# OpenCode acceptance probe

## 4. Реальная OpenCode-сессия через Session Manager

UI: http://localhost:3000/claude-sessions. Пользователь подтверждает, что сервис работает. Connection error из твоего execution sandbox — сначала проблема reachability; проверь разрешённый host/network context. Не объявляй сервис остановленным, не перезапускай его и не переписывай глобальные настройки в рамках MCP Epic.

Подтверждённый по исходникам контракт, который надо сверить при drift:

- POST /api/sessions/start: JSON path, message, agent="opencode"; optional worktree, opencodeBuild, model.
- model в проверенной версии — ID профиля OpenCode, а не произвольная строка provider/model. Выбирай существующий утверждённый профиль/бюджет и проверяй фактическую сборку.
- SSE data содержит type=session_id; type=error означает startup error. **type=done означает завершение запуска, не выполнения теста.**
- GET /api/sessions/<session_id> или /api/sessions/<session_id>/md — наблюдение transcript/status; POST /api/sessions/<session_id>/reply с message — bounded follow-up.
- correlationId можно передать для корреляции, но API не гарантирует idempotent start.

Z00.c должен доказать, что запускается именно OpenCode с нужной сборкой/cwd/config и target. Учти subsession_agent_override, remote node routing и нормализацию worktree paths. Manager применяет профиль и может переписать глобальный opencode.json; не считай передачу path достаточной изоляцией. Используй поддержанную project/per-process config isolation с проверенной precedence, отключёнными посторонними MCP и sandbox-only overrides. Не выдумывай API поля env/config. Не переключай глобальный profile или server settings для обхода проблемы; bounded gap фиксируется отдельно, независимая работа продолжается.

Проверь {file:...} substitution на loader реально выбранной сборки, не по одному месту forwarding headers. Статическому MCP profile явно отключи OAuth. Секреты передаются через защищённый файл вне Git и читаются runtime, не моделью. Перед tool smoke не печатай resolved config с credentials.

Пример API вызова после подготовки JSON-файла без секретов:

```sh
curl -sS -N --connect-timeout 5 --max-time 60 \
  -X POST http://localhost:3000/api/sessions/start \
  -H 'Content-Type: application/json' \
  --data-binary @<request-json-path>
```

Тело запроса:

```json
{
  "path": "<проверенный корень тестового проекта>",
  "agent": "opencode",
  "message": "<probe prompt с уникальным test_run_id>",
  "worktree": false
}
```

worktree=false допустим для подготовленного test checkout без другого writer. Для изолированного concurrent writer используй worktree=true через Manager и проверь фактический cwd/HEAD после запуска: он может нормализовать переданный worktree path. Probe не редактирует исходники и не переключает branch.

**Перед POST** запиши launch intent с test_run_id и target в handoff. После POST сохрани session_id сразу. При timeout/потере ответа сначала найди сессию по ID или уникальному marker через Manager; не отправляй второй POST вслепую. Новый запуск разрешён после установления исхода старого. Не закрывай SSE через grep/head так, чтобы потерять событие или перепутать завершение запуска с завершением работы.

Ожидай результат bounded poll: heartbeat/status/transcript каждые 15–30 секунд, до заданного test deadline (по умолчанию 5 минут). Busy/живой TUI не означает зависание или успех. По deadline сохрани evidence, выясни quota/permission/transport/tool причину. Наличие tool result важнее того, что интерактивный процесс остаётся жив. Cleanup касается только созданных данным test_run_id ресурсов/сессии и выполняется по contract.

### Probe prompt для дочерней OpenCode-сессии

```text
Ты проверяешь MCP для Epic #253. test_run_id=<ID>. Среда=<sandbox URL>.
Разрешён только server=<name>, tool=<точное имя>, args=<synthetic JSON с nonce>.
Используй именно нативный подключённый MCP tool. Не выполняй его через shell,
curl, web fetch или поддельный ответ. Не читай файлы ключей, не печатай credentials,
не меняй config/код/облако. При отсутствии инструмента сообщи TOOL_NOT_VISIBLE.
Вызови tool один раз; при неясном исходе не повторяй автоматически.
Сообщи имя вызванного tool, полученный nonce/result и ошибку, если есть.
Не запускай других агентов. После результата закончи ответ.
```

Исполнитель проверяет native tool-call event (name, sanitized args/result), gateway trace с тем же nonce и user/key IDs. Текст модели «PASS», HTTP 200, SSE done, или curl из агента — не acceptance. Не полагайся на то, что модель умеет отдельно вызвать protocol tools/list: подтвердить каталог можно client diagnostics/component probe, реальный вызов — native event.

Минимальная приёмка A: recruiter разрешённый tool; другой role tool отсутствует/denied; deterministic cross-role direct call denied; revoked key и disabled user отвергнуты при следующем запросе, в том числе из открытого клиента; новый key + новая OpenCode-сессия повторяют успех. Negative auth дополнительно проверяется без LLM. Ошибку quota/модели отличай от MCP auth или tool failure; не менять модель молча ради зелёного отчёта.

Z00.c использует fixture server и подтверждает client/transport; I05.c переключает тот же сценарий на реальный gateway/D1/personal key. Fixture auth никогда не становится production auth.
