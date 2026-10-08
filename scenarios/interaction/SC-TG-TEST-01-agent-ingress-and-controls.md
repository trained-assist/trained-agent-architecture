# SC-TG-TEST-01 — Проверка Telegram sandbox агентом и вызов выданных кнопок

**Статус:** target; реализация и acceptance не подтверждены. Scenario-change issue: [trained-agent-architecture#219](https://github.com/trained-assist/trained-agent-architecture/issues/219). Implementation issue: [trained-assist-tg-bot#402](https://github.com/trained-assist/trained-assist-tg-bot/issues/402). Основная sandbox lane: `trained-assist-tg-ux-sandbox` / `@probability_cat_bot`.

## Актор и цель

QA/acceptance-агент или авторизованная инженерная сессия проверяет реальный входной путь Telegram gateway без Telegram Desktop и без доступа к Cloudflare. Клиент действует как отдельный тестовый актор, а не подменяет Telegram-аккаунт человека.

## Предусловия и границы

- Вызов доступен только в явно разрешённой изолированной sandbox-конфигурации и выключен в production. Публичный Telegram webhook, его secret validation, Control Plane auth и защищённые operator routes сохраняются.
- Gateway закрепляет прогон за одним sandbox profile и тестовой conversation. Клиент не задаёт произвольные chat/profile/principal IDs, credentials, tools или execution budget.
- Выполнение использует объявленный sandbox tool allowlist и hard budget, имеет короткий срок жизни и ограниченные body size, rate, concurrency и retention. Исчерпание бюджета даёт диагностируемый отказ до нового запуска.
- Исходящие ответы и клавиатуры по умолчанию записываются в run-scoped transcript; production bot и личный чат владельца не используются.
- Тестовый прогон не читает и не перечисляет чужие прогоны, профили, чаты или секреты. Ticket высокоэнтропийный, короткоживущий и ограниченный одним прогоном.

## Основной поток

1. QA-клиент создаёт изолированный тестовый прогон и отправляет ограниченный текст в sandbox gateway.
2. Gateway вызывает те же message, intake, Durable Object, Control Plane и callback handlers, что и Telegram webhook. Дубли сообщения/приёма не создают второй admission.
3. Run-scoped transcript показывает безопасный ответ бота и выданные в этом прогоне controls. Callback payload и message identity остаются на стороне сервера; наружу выдаётся непрозрачная ссылка на control.
4. Клиент вызывает control reference из этого же прогона. Gateway разрешает её в серверный callback payload и передаёт его обычному callback handler.
5. Transcript и evidence показывают результат admission/отказа, безопасную причину, correlation IDs и sanitized состояние коллектора. Положительный путь даёт ровно один Control Plane admission; повторный, устаревший или чужой control не запускает второй admission.
6. После проверки run capability и временные записи истекают; fixture очищается по sandbox procedure без затрагивания shared или production данных.

## Отказы и безопасность повторов

- Неизвестный, поддельный, просроченный или cross-run control reference закрывается без вызова callback handler и без admission.
- Чужой или истёкший run ticket не раскрывает существование, текст, результаты или IDs других прогонов.
- Disabled ingress, production binding, oversized input, rate/budget exhaustion и занятая lane дают явный безопасный отказ до исполнения.
- При pending/unknown stop или launch draft остаётся сохранён; повторный callback не снимает барьер и не создаёт параллельный запуск.
- Сбой/timeout между admission и ответом оставляет исходный correlation и состояние для диагностики; клиент не повторяет запуск вслепую.

## Свидетельства

Для каждой приёмки фиксируются TG и CP revisions, target lane, run/request/task IDs, sanitized request/reply, выданные control references (без callback payload), callback outcome, admission count, релевантные collector/Worker logs и проверка отсутствия секретов. Локальная эмуляция и synthetic Worker fixture не называются live Telegram user E2E.

## Acceptance

- Deployed sandbox probe проходит `text → gateway response/controls → current control → exact safe refusal or one admission`; события и control references читаются только с capability этого прогона.
- Pending-stop regression сохраняет draft; валидный текущий control допускает ровно один admission; duplicate/stale/forged/cross-run controls не допускают admission.
- Cross-run ticket, malformed/expired ticket, oversized input, quota/rate exhaustion, production config и выключенный ingress проходят fail-closed probes.
- Повторный read/reconnect возвращает только события этого прогона. Retention и cleanup подтверждены.
- Semantic review, component probes и generated E2E выполняются по `SCENARIO-CHANGE-MANAGEMENT.md` и Environment Contract Telegram implementation repo. До появления deployment evidence статус остаётся target.

## Явные ограничения

Этот сценарий доказывает работу sandbox HTTP adapter и обычного gateway пути. Он не доказывает пользовательскую Telegram-доставку. Для live Telegram provider E2E нужен отдельный тестовый bot и явный opt-in на фиксированный allowlisted чат; production bot запрещён.
