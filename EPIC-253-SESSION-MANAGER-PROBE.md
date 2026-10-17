# Epic #253 — Session Manager API contract + probe fixtures (Z00.b)

- Дата: 2026-10-11
- Источник контракта: `/Users/vova/code/claude-session-manager/src/app/api/sessions/` (start/route.ts, [sessionId]/route.ts, [sessionId]/md/route.ts, [sessionId]/reply/route.ts)
- Статус: контракт подтверждён по исходникам; Manager жив на `http://localhost:3000`.

## 1. POST /api/sessions/start

### Request (JSON, без секретов)

```json
{
  "path": "<абсолютный путь к тестовому проекту внутри $HOME>",
  "message": "<probe prompt с уникальным test_run_id>",
  "agent": "opencode",
  "worktree": false
}
```

### Поля

| Поле | Обязательное | Тип | Описание |
|------|-------------|-----|----------|
| `path` | да | string | Абсолютный путь к директории проекта. Должен быть внутри `$HOME`. |
| `message` | да | string | Начальное сообщение (non-empty после trim). |
| `agent` | нет | string | Тип агента: `"opencode"`, `"claude"`, `"codex"`, `"forge"`. По умолчанию — из настройки `default_agent`. |
| `model` | нет | string | Для OpenCode — ID профиля (например `"master"`, `"phd"`, `"free"`), НЕ provider/model string. |
| `worktree` | нет | boolean | Создать git worktree для сессии. По умолчанию — из настройки `sessions_worktree_default`. |
| `opencodeBuild` | нет | string | ID сборки OpenCode. Только при `agent="opencode"`. |
| `correlationId` | нет | string | Корреляционный ID для логировании. API не гарантирует idempotent start. |
| `verbose` | нет | boolean | Подробный вывод. |
| `previous_session_id` | нет | string | ID предыдущей сессии для resume. |
| `on_complete_url` | нет | string | URL для callback при завершении. |
| `reply_to_session_id` | нет | string | ID родительской сессии (для delegation). |
| `delegation_task` | нет | string | Описание delegation task. |

### Validation errors (HTTP 400/403/404)

| Условие | HTTP | Response |
|---------|------|----------|
| `path` или `message` отсутствуют/пустые | 400 | `{"error":"path and message required"}` |
| `agent` не является допустимым типом | 400 | `{"error":"invalid agent: <value>"}` |
| `opencodeBuild` передан без `agent="opencode"` | 400 | `{"error":"opencodeBuild requires agent opencode and a build id"}` |
| `opencodeBuild` не является валидным ID сборки | 400 | `{"error":"<build resolution error>"}` |
| `path` вне `$HOME` | 403 | `{"error":"Path must be within home directory"}` |
| `path` не существует | 404 | `{"error":"Path does not exist"}` |
| `path` не является директорией | 400 | `{"error":"Path is not a directory"}` |

### SSE response (Content-Type: text/event-stream)

| Event | Значение | Когда |
|-------|----------|-------|
| `{"type":"status","text":"..."}` | Статус запуска | OpenCode открыт в терминале |
| `{"type":"session_id","session_id":"<id>"}` | ID созданной сессии | OpenCode session row обнаружен (poll до 45с) |
| `{"type":"error","error":"<msg>"}` | Ошибка запуска | Исключение при старте |
| `{"type":"done"}` | Завершение запуска | Всегда в конце (даже при ошибке) |

**Важно:** `type=done` означает завершение запуска, НЕ выполнения теста.

### Special behaviors

- **subsession_agent_override**: если curl (нет `Sec-Fetch-*` headers) и настройка `subsession_agent_override` задана — агент принудительно переопределяется, `model` сбрасывается.
- **Remote node routing**: `?node=<nodeId>` query param маршрутизирует на remote VM.
- **Worktree**: при `worktree=true` создаётся git worktree; путь нормализуется.

## 2. GET /api/sessions/<sessionId>

### Response (JSON)

```json
{
  "session_id": "<id>",
  "project_path": "<path>",
  "messages": [...],
  "messages_total": 42,
  "metadata": { "agent_type": "opencode", "model": "...", ... },
  "is_active": true,
  "has_result": false,
  "file_age_ms": 1234,
  "process_vitals": { ... },
  "alarm": null
}
```

- 404 `{"error":"Session not found"}` если сессия не найдена.
- Поддерживает `?node=<nodeId>` для remote routing.

## 3. GET /api/sessions/<sessionId>/md

### Response (text/markdown)

Транскрипт сессии в markdown format. Поддерживает пагинацию.

## 4. POST /api/sessions/<sessionId>/reply

### Request (JSON)

```json
{
  "message": "<follow-up message>"
}
```

### Response

SSE stream (аналогично start). Возобновляет существующую сессию с новым сообщением.

## 5. Probe fixtures

### 5.1 Request template (без секретов)

```json
{
  "path": "/Users/vova/code/trained-agent-architecture-epic253",
  "agent": "opencode",
  "message": "Ты проверяешь MCP для Epic #253. test_run_id=<UNIQUE_ID>. Среда=<sandbox URL>. Разрешён только server=<name>, tool=<точное имя>, args=<synthetic JSON с nonce>. Используй именно нативный подключённый MCP tool. Не выполняй его через shell, curl, web fetch или поддельный ответ. Не читай файлы ключей, не печатай credentials, не меняй config/код/облако. При отсутствии инструмента сообщи TOOL_NOT_VISIBLE. Вызови tool один раз; при неясном исходе не повторяй автоматически. Сообщи имя вызванного tool, полученный nonce/result и ошибку, если есть. Не запускай других агентов. После результата закончи ответ.",
  "worktree": false
}
```

### 5.2 SSE expectations

1. Первое событие: `type=status` (опционально) — "Opencode opened in ..."
2. Ключевое событие: `type=session_id` — содержит `session_id`
3. Финальное событие: `type=done` — запуск завершён
4. Ошибка: `type=error` — содержит `error` message

### 5.3 Bounded poll procedure

```
1. POST /api/sessions/start → SSE stream
2. Ждём type=session_id (timeout: 60с)
3. Сохраняем session_id
4. Ожидаем type=done (timeout: 10с после session_id)
5. Poll GET /api/sessions/<id> каждые 15-30с (deadline: 5 мин)
6. Проверяем is_active, has_result, messages
7. При необходимости: POST /api/sessions/<id>/reply для follow-up
```

### 5.4 Negative probes

| Probe | Ожидаемый результат |
|-------|-------------------|
| `POST /api/sessions/start` без `path` | 400 `{"error":"path and message required"}` |
| `POST /api/sessions/start` без `message` | 400 `{"error":"path and message required"}` |
| `POST /api/sessions/start` с `agent="invalid"` | 400 `{"error":"invalid agent: invalid"}` |
| `POST /api/sessions/start` с `path` вне `$HOME` | 403 `{"error":"Path must be within home directory"}` |
| `GET /api/sessions/nonexistent` | 404 `{"error":"Session not found"}` |

## 6. Work issue

- Z00: https://github.com/trained-assist/trained-assist-mcp-host/issues/21
- Epic: https://github.com/trained-assist/trained-agent-architecture/issues/253
