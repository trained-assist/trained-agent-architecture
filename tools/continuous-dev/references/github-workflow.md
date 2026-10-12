# GitHub workflow

## 6. Issue/PR workflow и durable handoff

Создай/переиспользуй linked work issue в owning repo для текущей группы и checklist атомарных строк. В Epic один progress-комментарий с marker `<!-- epic-253-progress-v3 -->`, links и текущим milestone. Найди по marker/ID и обновляй только свой блок, сохраняя чужие комментарии/решения. При потере ответа на create сначала найди созданный issue/PR по marker, branch и scope; не дублируй.

Статусы work item:

- NOT_STARTED — зависимости не готовы или работа не начата.
- IN_PROGRESS — один активный исполнитель, указан step и session/iteration ID.
- IN_REVIEW — PR открыт, тесты опубликованы, требуется review.
- WAITING_CI / WAITING_REVIEW — конкретный внешний gate; записаны URL и время следующей проверки.
- BLOCKED — конкретное внешнее условие после in-scope диагностики; обычный красный sandbox test сам по себе не blocker.
- DONE — criteria выполнены, evidence есть, implementation integrated по owning workflow (для docs/probe без PR указано почему); checked task/issue close только тогда.

Не приравнивай open PR к Done. Dependent probe может тестировать pinned PR SHA в sandbox до merge, если contract разрешает; это отдельно от integrated status. Не делай каждый шаг зависимым от merge scenario-change PR: это финальная acceptance запись.

Одна logical change — один owning PR. Проверь existing branch/PR прежде нового. Title с step ID. Body: проблема → поведение → проверки → sandbox/OpenCode evidence → ограничения. Link Epic, work issue и scenario-change PR. Не reuse merged PR branch для новой задачи; не force-push. Исправляй CI/review в текущем scope, переводя PR draft/ready по реальной готовности. Merge только после actual required CI/review и repo merge policy; нет полномочий — WAITING_REVIEW с конкретной причиной, не просьба заново разрешить весь Epic.

Project status обновляй по существующим полям/правам. Если Project API недоступен, issue progress остаётся рабочим источником; это не блокирует coding. Не создавай десятки дублирующих labels/comments. Полный итог acceptance — scenario-change PR: semantic/component/E2E PASS по pinned SHAs. Закрытие A не закрывает Epic; A–C accepted закрывают основной scope, D linked follow-up остаётся открытым.

GitHub — источник статусов. Сначала получить все страницы comments/linked PRs. Канонический
progress закреплён ID в issue; при нескольких одинаковых marker не выбирать последний
по дате и не создавать новый. Сопоставить записи с API merge/CI/reviews и восстановить одну
сводку. Сохранять history/решения других авторов. Локальный handoff — crash recovery cache,
не отдельный трекер; перед записью remote state проверить актуальный updated_at и отсутствие
параллельного writer. При конфликте перечитать и reconcile; не перетирать чужую запись.
