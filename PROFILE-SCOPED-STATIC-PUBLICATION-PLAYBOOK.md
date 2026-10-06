# Playbook: scoped Git change → Cloudflare Pages

Статус: рабочий подход для статических страниц · 06.10.2026 · пример пилота: карточка [#163](https://github.com/trained-assist/trained-agent-architecture/issues/163)

## Принцип

В Git сохраняется исходник в его проектном контексте: генератор, нужные assets и сгенерированный результат. В Cloudflare Pages отправляется только согласованная папка публикации. Размер остального репозитория не определяет deploy scope: границу задаёт staging directory/Workspace View и проверяет host-owned resolver.

## Шаги

1. **Разобрать запрос.** Выделить сущность, аудиторию, событие/этап входа и ожидаемый результат. Найти её в существующем source tree по пользовательскому контексту и сверить связь с действующей страницей/навигацией. Не выбирать `index.html` только по наличию.
2. **Подтвердить owner и target.** Через host-owned binding установить профиль, репозиторий, source path, Pages project и действующий URL. Проверить, что project account совпадает с разрешённой конфигурацией. Если identity, source или route неоднозначны, остановить изменение на inventory.
3. **Зафиксировать требования.** Добавить короткую запись в ближайший существующий requirements log: триггеры/точки входа, дословные требования пользователя, сохранение существующих ссылок и статус реализации.
4. **Менять источник.** Редактировать generator/source, а не только собранный HTML. Сгенерировать итоговую страницу воспроизводимой командой; коммитить source и generated output вместе.
5. **Сделать scoped candidate.** Собрать отдельную пустую staging-папку только из publishable output и обязательных публичных assets. Не копировать туда `.git`, соседние проекты, backups, traces, prompt/config, credentials или artifacts, не нужные странице.
6. **Проверить candidate.** Подтвердить точный список путей, наличие ожидаемых HTML/assets, отсутствие непредусмотренных файлов; проверить ссылки, IDs, триггеры и поведение диалогов. Рассчитать SHA-256 manifest candidate. Синтетически открыть страницу/проверить HTTP response, когда среда позволяет.
7. **Сохранить в Git через CAS.** Перед изменением получить актуальный `main` и base SHA. Записать только связанные файлы обычным commit. Публиковать fast-forward push/WorkspaceService CAS; при изменении base повторно собрать/сверить candidate. Не делать force-push и не переписывать историю.
8. **Развернуть preview.** Загрузить только staging-папку в preview deployment существующего Pages project. Сверить preview commit/config version и content digest с принятым Git artifact. Проверить mobile/desktop, локальные links/assets, direct routes, query/trailing-slash и protected/raw behavior.
9. **Опубликовать production.** Только после проверки preview, на существующий project, сохранить старый URL и auth behavior. Не создавать новый проект и не переключать branded route без отдельного route-CAS/cutover gate.
10. **Проверить и сохранить receipt.** Зафиксировать commit SHA, candidate manifest digest, Pages deployment ID, URL/status, время, конфигурацию и границы проверки. Проверить production response и навигационные связи.
11. **Откатить при дефекте.** Повторно развернуть предыдущий last-good artifact того же Pages project; проверить старый URL и auth. Не удалять предыдущий deployment или источник до завершения наблюдения.

## Состав Git change и deploy artifact

| Артефакт | В Git | В Cloudflare Pages upload |
|---|---:|---:|
| Источник/генератор страницы | Да | Нет |
| Сгенерированный `index.html` | Да | Да, если это publish root |
| Runtime-код сборщика | Да, если нужен для воспроизводимости | Нет |
| Backups, temp files, Git metadata | По правилам repository hygiene | Нет |
| Секреты, auth state, traces, prompts | Нет, исключить до commit | Нет |
| Другие проекты/папки профиля | В своих source paths по политике профиля | Нет |

## Evidence и стоп-условия

Операция должна останавливаться до production deploy, если нет подтверждённого identity→binding→source→project соответствия, selection затрагивает неизвестные файлы, candidate содержит лишние пути, digest не совпадает, preview отдаёт другой content, auth/privacy behavior не проверен либо rollback artifact недоступен.

Приёмка публикуемой страницы подтверждает конкретный subtree и revision; она не объявляет безопасным весь профильный Git tree и не доказывает восстановимость всех пользовательских данных. Private identity, candidate content и URL с ограниченным доступом хранятся в private evidence, публичный статус содержит только агрегаты и безопасные revision/deployment IDs.
