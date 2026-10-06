# Жизненный цикл пользовательских сценариев

## Назначение

Сценарий — проверяемое описание поведения, которое пользователь, API-клиент или оператор наблюдает на сквозном пути. Он связывает ценность из истории с каналами, компонентами, контрактами и evidence, но не дублирует статус задачи реализации.

Канонические истории новой системы находятся в [stories/](stories/README.md). Старые импортированные сценарии в [scenarios/sources/](scenarios/README.md) — исторический read-only snapshot. Новые общие поведенческие сценарии размещаются в `scenarios/<domain>/` и связываются с ID истории. Не создавать синхронизируемые копии одной спецификации в сервисных репозиториях.

## Разделение артефактов и ответственности

| Артефакт | Для чего | Кто обновляет |
|---|---|---|
| История в `stories/` | Кто получает ценность, шаги пользователя и внешнее «готово, когда» | Владелец продукта/архитектуры |
| Scenario-change PR в architecture repo | Целевой сквозной контракт; остаётся открытым до реализации и затем фиксирует проверенный факт | Владелец изменения сценария |
| Implementation issue / GitHub Project card | Владелец, scope, зависимости, чек-лист, состояние и блокеры реализации | Implementation owner |
| Implementation PR в runtime/service repo | Код, тесты, rollout и evidence своей реализации | Runtime/service owner |

GitHub issue/Project не является runtime task, а архитектурный документ не является трекером исполнения.

## Последовательность

1. **Найти существующую историю и сценарии.** Проверить `stories/`, `scenarios/`, contracts, архитектуру и implementation owners; выявить дубли и несовместимые формулировки.
2. **Для feature/scenario change открыть architecture issue и scenario-change PR до runtime-кода.** Это обязательно для изменения целевого пользовательского поведения, но не для bugfix, который только возвращает уже описанный target. Если исправление меняет target behavior, это scenario change.
3. **В открытом architecture PR зафиксировать target и implementation map.** PR создаёт/уточняет scenario со статусом `target/in_implementation`: точный flow/UX, состояния, failure paths, acceptance и ссылки на все implementation issues в затронутых репозиториях. Implementation issues и PR-ы ссылаются обратно на architecture issue/PR и scenario ID.
4. **Architecture PR не merge до реализации.** Он является живым change gate: остаётся открытым, пока обязательные implementation issues не завершены и нет проверяемого evidence. Merge target-only документа до runtime-реализации не считается нормальным lifecycle.
5. **Реализовать в owner repositories.** Implementation PR содержит тесты, sandbox/replay evidence и безопасный rollout. Production promotion выполняется только штатным CI/CD соответствующего репозитория.
6. **Перед merge architecture PR сверить target с фактом.** Добавить фактические runtime PR/revisions/evidence, отметить ограничения и проверить drift. Если реализация отличается от target, сначала согласовать и обновить scenario либо реализацию.
7. **Merge/close architecture PR завершает scenario change.** После review и подтверждения acceptance merge означает, что изменение сценария реализовано и архитектурно зафиксировано. Отдельный follow-up architecture PR в обычном случае не нужен.

## Будущий architecture meta-CI

Целевой gate можно автоматизировать отдельным meta-CI: агент читает scenario-change PR, проходит связанные implementation issues/PRs и их pinned revisions, запускает доступный сквозной sandbox/replay и проверяет наблюдаемое поведение и evidence. Meta-CI должен проверять соответствие target ↔ implementation, а не подменять CI сервисных репозиториев. До появления такого gate эти проверки выполняются вручную и фиксируются в architecture PR.

## Минимальный формат scenario

- Уникальный стабильный ID и краткое название.
- Статус: `target`, `in_implementation`, `implemented/verified`, `superseded` или `blocked`; дата изменения статуса.
- Ссылка на историю/истории и implementation issue.
- Акторы, prerequisites и явные assumptions.
- Каналы и наблюдаемые различия.
- Trigger → внешне наблюдаемые шаги → ожидаемый результат.
- Владелец и границы компонентов; contract/invariant IDs.
- Основные состояния и ownership долговечных переходов.
- Применимые failure/interrupt/retry/restart/concurrency/authorization пути.
- Acceptance/evidence: какие внешние результаты наблюдаются, каким тестом/replay, source revision и ссылка на запуск/отчёт.
- Явный список ограничений: каналы/пути, которые не проверены, и открытые вопросы.

Не включать подробный календарный план, галочки статуса задачи, секреты, сырые пользовательские данные или неподтверждённые заявления о production.

## Именование и качество

- История описывает ценность/шаги без обязательной привязки к компонентам; scenario содержит необходимую сквозную механику.
- Один scenario охватывает одно связное пользовательское намерение. Вариации каналов — таблицей; отдельный сценарий нужен, если меняется цель или гарантия.
- Каждое обещание в тексте должно иметь наблюдаемую проверку или быть помечено как proposal/open question.
- Отделять факт текущей системы, принятое target-поведение и предложение. Не переносить статус из старого snapshot без проверки.
- Явно указывать time units, что сбрасывает timer, порядок сообщений, idempotency key/generation, источник истины и race winner.
- Не обещать «exactly once» без описания атомарного перехода и проверки повторов; предпочитать формулировку «не более одного durable dispatch при idempotent recovery».
- Не считать issue closure или локальный test pass подтверждением пользовательского результата; scenario-change PR merge допустим только после подтверждённой реализации и evidence.

## Связи с существующими правилами

- [Истории](stories/README.md) — канонический каталог пользовательской ценности.
- [Архив импортированных сценариев](scenarios/README.md) — происхождение legacy-текстов и правила read-only sources.
- [Acceptance checklist](ACCEPTANCE-CHECKLIST.md) — evidence types и общий gate Done.
- [Engineering Approach](ENGINEERING-APPROACH.md) — разработка и verification.
- [README](README.md) — навигация и владельцы документов.

