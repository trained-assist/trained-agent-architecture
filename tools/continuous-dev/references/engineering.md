# Sandbox и integration gates

## 2. Главная методическая инструкция — шаг ноль каждый раз

**Сначала сделать изменение удобным для проверки в sandbox, затем реализовать и проверить его.** Выполни это в начале каждой сессии, даже если предыдущая уже делала подготовку:

1. Прочитай Epic, актуальный progress/handoff, selected work issue, связанные открытые PR, reviews и CI. Проверь фактические merge/close/commit states; не верь одному прежнему отчёту.
2. Прочитай AGENTS.md owning repo, Environment Contract и относящиеся architecture scenario/sandbox правила. Новому human-flow нужен scenario-change draft PR до runtime-кода; он остаётся открытым во время реализации, не требует предварительного merge.
3. Проверь repo remote, branch, HEAD, diff и владельца checkout. Соседние/грязные изменения сохрани. Локальная audit-папка не обязательно Git repo; используй настоящий checkout для PR. При параллельных writers — отдельный checkout/worktree и branch.
4. Выбери одну готовую строку backlog. Если строка слишком велика для сессии, выдели <ID>.1/.2 с самостоятельными проверками до кода. Не бери весь Ixx целиком.
5. Запиши короткую карточку проверки: actor/input; ожидаемый result и denial; target/lane/resource IDs; current SHA; команда/probe; где output/logs/state; повтор и bounded cleanup. Baseline должен дать понятный pass или воспроизводимый fail.
6. Если нужный probe/trace/fixture отсутствует, сделай его минимальное дополнение первым действием текущей задачи. Это Sandbox Gap, который надо закрыть работой; не повод ждать готового идеального стенда.
7. После изменения выполни focused tests, обязательные repo checks, применимый sandbox deploy/probe и OpenCode acceptance. Новый SHA, config или target может инвалидировать старое evidence — повтори затронутую проверку. Не гоняй полный стек для docs-only изменения.

Формат записи нулевого шага: `Шаг <ID>; проверяем <поведение>; среда <lane/resource>; baseline <результат>; acceptance <команда/ожидаемый output>; cleanup <свои fixtures>; OpenCode <fixture | real gateway | не применимо с причиной>`.

## 3. Sandbox — разрешённая рабочая среда

Владелец подтвердил: **sandbox-деплой нужен и разрешён; есть три sandbox и достаточно места для тестов.** Самостоятельно деплой PR revision в выбранную тестовую среду, выполняй additive test migrations, seed synthetic users, выпуск/отзыв test keys, controlled failures, inspection, исправление и повтор. Не запрашивай повторное разрешение на обычную sandbox-операцию.

В Z00.a составь карту трёх сред и дальше обновляй только изменившиеся данные: реальные endpoints/IDs, contract, ownership/claim, Workers/D1/KV/DO, shared downstream, credentials refs, reset. Проверь остальные среды, если одна занята. Не угадывай URLs и не считай lanes независимыми по названию. SANDBOX.md сообщает о shared CP/Runner у двух ingress lanes; для shared live lane следуй claim/release процедуре #185. Для прямой MCP-проверки Telegram/Runner не являются обязательными зависимостями.

Не создавай четвёртый full-stack sandbox. При необходимости подготовь минимальные component bindings/namespaces внутри выбранной существующей среды согласно contract. Не освобождай место очисткой чужого state и не меняй чужие in-flight runs. Простои/ошибки sandbox изучай и устраняй по contract. Production не используется как запасной стенд.

Production promotion, действующие production credentials, public signup и destructive reset не входят в обычный sandbox loop. Следуй existing promotion path, когда появится соответствующая отдельная задача. Не пиши общий запрет deploy, который блокирует текущую работу.

## 5. Реализация и безопасность границ

Следуй архитектурным решениям Epic. Сохрани отдельный machine catalog/digest и его discovery/invocation contract; не делай gateway-token admin fallback. Human role и identity серверные; каждый data-bearing handler проверяет ACL. Одинаковые IDs разных сессий, включая один user/key, изолированы; cancel не сравнивает undefined runId. Account CLI и будущий web используют общие functions.

Секреты из источников по актуальным инструкциям владельца, только через память/env/stdin/protected files. При конфликте account names не угадывай и не подбирай чужой token. Известный user instruction приоритетнее устаревшего repo текста. Не выводи секреты в chat/tool stdout, PR, CI artifacts или raw transcript. Sanitized evidence хранится отдельно; в GitHub — только IDs/refs и нужные выдержки.

Перед выпуском test key зафиксируй user/key label и operation ID; при перезапуске найди созданное, не генерируй дубли. Bootstrap первого admin — локальная sandbox ops-команда; существующий транспортный секрет не повышается до admin.

Тесты проверяют наблюдаемый контракт и негативные случаи; не пишутся ради docs-only изменений. Работающий component baseline сохраняется, баг исправляется в пределах текущего шага. После двух неудачных repair attempts сузь проблему до отдельного минимального substep и обнови handoff; не закручивай бессрочный loop и не ослабляй acceptance.

Перед интеграцией Host/Ladder проверить один synthetic user/key на общей канонической
схеме Ladder, а не две независимо созданные fixture БД. Зафиксировать владельца и порядок
миграций, совместимость account functions, key service policy, единицы expiry, key_id и
stable user_id. Нужны schema-first migration probe, выпуск ключа через Ladder CLI и
проверка его gateway. Service принадлежит grants ключа; ограничение service пользователя
не доказывает работу одного ключа в Ladder и MCP. До I05.b исправить несовместимый контракт.

Human scope следует Epic: explicit operationId=user, без fake runId. Проверить lifecycle
одного ключа с двумя клиентами и одинаковым JSON-RPC ID. Trace/result/log содержит key_id,
не key hash. Тест отсутствия token в ответе не является проверкой отсутствия hash.
Machine regression включает положительный authenticated discovery/invocation и реальные
assertions digest; initialize 200 и проверка наличия JS export не доказывают их сохранность.
