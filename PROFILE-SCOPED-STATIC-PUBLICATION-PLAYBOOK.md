# Playbook: scoped Git change → Cloudflare Pages

Статус: рабочий подход для статических страниц · 06.10.2026 · пример пилота: карточка [#163](https://github.com/trained-assist/trained-agent-architecture/issues/163)

## Принцип

В Git сохраняется исходник в его проектном контексте: генератор, нужные assets и сгенерированный результат. В Cloudflare Pages отправляется только согласованная папка публикации. Размер остального репозитория не определяет deploy scope: границу задаёт staging directory/Workspace View и проверяет host-owned resolver.

## MCP-вызов Markdown → HTML

Тонкий MCP-метод называется `put_md_to_web_as_html`. Он принимает **относительные пути внутри pinned Workspace View**, а не содержимое, абсолютные пути, GitHub URL или произвольные repo/branch от модели. Для обычного документа:

```json
{
  "markdown_path": "projects/example/page.md",
  "theme_path": "projects/example/web-theme.json",
  "publication_id": "pub_example"
}
```

`publication_id` связывает вызов с заранее настроенным route/provider target; его можно не передавать только если host однозначно привязал текущий вызов к одной публикации. Tenant/profile, Git repository, branch и revision берутся из доверенного principal и host binding. В receipt фиксируется конкретный commit SHA. Если binding или target неоднозначны, метод отказывает до чтения/записи.

Host-owned publication handler разрешает оба пути в одном View и на одной revision, проверяет типы файлов и ограничения размера, разбирает `web-theme.json` по версионированной allowlist-схеме, рендерит Markdown в HTML и формирует отдельную staging-папку. Cloudflare adapter получает только эту папку и pinned publication target; он не получает ссылку на весь репозиторий и не клонирует его. Preview/production policy и сохранение исходников через WorkspaceService/CAS остаются ответственностью host, не MCP.

Для готового многофайлового сайта метод имеет режим `rich-html`: вместо `markdown_path`/`theme_path` передаётся `site_path` — относительный путь к одной папке сайта в том же View. В ней лежит весь статический сайт (`index.html`, assets и при необходимости `_headers`, `_redirects`). Renderer не меняет HTML/CSS/JS; host валидирует manifest, MIME-типы, лимиты, symlinks и выход за subtree, затем копирует только эту папку в staging и передаёт её Cloudflare Direct Upload adapter. Это покрывает готовый HTML/CSS/JS, но не запускает произвольные build-команды и не поддерживает backend/Pages Functions в пилотном контракте.

Cloudflare Pages Direct Upload принимает собранную папку статических файлов, например `wrangler pages deploy <DIRECTORY> --project-name <PROJECT>`. Провайдеру отправляются файлы staging-папки; URL или ссылка на GitHub-подпапку сама по себе не является deploy input. Git-ветка и source commit фиксируются host-side, а Cloudflare branch — отдельный label preview deployment. Файлы попадают в корень Pages deployment; публикация под существующим URL-prefix требует отдельного route/mirror binding с проверкой совместимости путей.

`web-theme.json` — данные оформления, не CSS/HTML/JS для исполнения. Схема v1 задаёт `schemaVersion`, `preset`, `colors` (`background`, `surface`, `text`, `muted`, `accent`, `border`), `font` (`body`, `heading`, `mono` из разрешённого набора) и `layout` (`maxWidth`, `density`). Неизвестные ключи, CSS, JS, `url()`, внешние font imports и небезопасные цвета/размеры отклоняются. При отсутствии theme handler использует закреплённый project preset; произвольный default не должен молча менять оформление существующей публикации.

Рендерер экранирует/санитизирует raw HTML по принятой политике, сохраняет Markdown-структуру и разрешает локальные assets только внутри View. Пути assets нормализуются, выход за subtree блокируется. Выходный HTML и выбранный theme preset/version входят в manifest и digest candidate.

Ответ MCP содержит status (`preview_ready`/`published`/ошибка), publication/deployment ID, URL, режим (`markdown-html`/`rich-html`), исходный commit SHA, выбранные относительные пути, renderer/theme schema versions (для Markdown) и candidate digest. Секреты, полный inventory и содержимое Markdown в receipt/logs не включаются. Production deployment выполняется только по отдельной policy/approval текущего publication flow; сам факт вызова генератора не обходит preview/cutover gate.

**Текущее состояние:** контракт метода описан для реализации; legacy `publish_page` и `site_deploy` не обеспечивают этот поток. `site_deploy` принимает локальную папку, а `branch` задаёт label Cloudflare deployment, не GitHub source revision. Cloudflare Direct Upload умеет принимать папку статических assets через Wrangler: [официальный пример](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) и [справка `pages deploy`](https://developers.cloudflare.com/workers/wrangler/commands/pages/).

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
