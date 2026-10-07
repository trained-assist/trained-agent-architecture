# SC-SBX-01 — Анонимная проверка приёма запроса в песочнице

**Статус:** target; архитектурное изменение #197. Связанная история: [API-16](../../stories/API.md#api-16-проверить-приём-запроса-в-песочнице-без-учётных-данных). Implementation issue: [trained-assist-tg-bot#402](https://github.com/trained-assist/trained-assist-tg-bot/issues/402).

## Актор и цель

Инженер, QA-агент или другой тестовый клиент проверяет HTTP-приём синтетического запроса и наблюдение его квитанции/событий, не зная Telegram chat ID и не используя пользовательскую авторизацию или Cloudflare credentials.

## Предусловия

- Цель — явно изолированный sandbox; endpoint выключен по умолчанию и недоступен на production bindings.
- Платформа выбирает фиксированный sandbox principal/profile. Клиент не задаёт и не повышает полномочия, бюджет или список инструментов.
- Режим этого сценария — `accept-only`: он сохраняет запрос и возвращает квитанцию, но не вызывает классификатор, MCP, модель, Agent Run, Runner или внешнее действие.
- Есть лимиты размера, частоты и времени хранения; активная lease имеет TTL. Секреты и пользовательские данные не попадают в публичный статус и логи.

## Основной поток

1. Клиент отправляет один короткий синтетический текст на sandbox seed endpoint без `Authorization` header.
2. Endpoint проверяет sandbox-only binding, feature flag, body size, rate/quota и свободную lease до сохранения ввода.
3. При успехе клиент получает task/request correlation IDs и случайный run-scoped read capability. В ответе явно указано, что принято только в `accept-only` режиме и выполнение агента не запускалось.
4. Клиент подписывается на SSE или читает события с курсором, используя capability. Он видит только свою квитанцию и состояние `accepted_only`; переподключение не создаёт новую задачу.
5. Capability другого запроса не раскрывает наличие, вход, результат или ID этой задачи. Истёкший capability отказывает.
6. Агрегатный lane status показывает только `free`, `busy` или `blocked`; lease освобождается по завершении/TTL.

## Отказы и повтор

- Disabled flag, production binding, unavailable budget/run policy, malformed/oversized input или исчерпанная квота дают явный отказ до классификации и Agent Run.
- Занятая lease не принимает вторую задачу в тот же lane; параллельные клиенты могут получить различные изолированные lanes, если они настроены.
- Потеря ответа не порождает повторное выполнение. Идемпотентный retry того же request key возвращает прежнюю квитанцию; новый ключ — новый запрос только после проверки lease/quota.
- Потеря SSE-соединения восстанавливается курсором; capability остаётся ограниченной одной задачей и имеет срок действия.

## Граница доказательства

PASS этого сценария доказывает только sandbox API ingress, ограничение доступа к событиям и replay. Это **не** доказывает работу классификатора, MCP, модели, Agent Run, Runner или доставки через Telegram. Настоящее выполнение задачи допускается отдельным изменением только после подтверждённого hard token/cost budget на границе исполнения (включая классификацию/communication), sandbox tool allowlist и развёрнутого изолированного Runner.

## Приёмка

- Semantic review подтверждает, что анонимная capability выдаётся только для одного sandbox запроса и не обходит principal auth.
- Component probes проверяют request/body/rate limits, expired/malformed/cross-run capability, повтор с тем же ключом, конкурентные и истёкшие leases, production fail-closed, отсутствие classifier/Runner вызовов и нулевой token usage.
- Generated E2E выполняется на заявленном isolated sandbox и фиксирует source revision, receipt/task ID, событие `accepted_only`, replay и отказ чтения чужой capability. Локальный тест не называется staging E2E.
- В evidence отдельно указано, что Runner execution и Telegram delivery не покрыты.
