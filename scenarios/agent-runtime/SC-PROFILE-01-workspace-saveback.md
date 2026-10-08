# SC-PROFILE-01 — Профиль переживает запуск агента и выбор Runner

**Статус:** target; cross-repository acceptance не пройдена.
**Scenario-change:** [architecture #194](https://github.com/trained-assist/trained-agent-architecture/issues/194).
**Implementation tracking:** [agent-runner #186](https://github.com/trained-assist/ai-agent-runner/issues/186), [GHA runner #29](https://github.com/vovalikessmoothy-png/opencode-gha-runner/issues/29), [pipeline epic #192](https://github.com/trained-assist/trained-agent-architecture/issues/192).
**Граница:** доверенный Agent API, France VM Runner или GHA Runner, агентский процесс и закреплённый Git-профиль. Россия и старая GCP VM не входят в целевую agent route.

## Ценность и акторы

Владелец профиля запускает агента через обычный API и получает результат вместе с подтверждением, что изменения сохранены в его профиле. Следующий запуск видит опубликованные изменения независимо от того, выполнялся он на France VM или через GHA.

Акторы: API-клиент владельца профиля; центральный API как admission/router и единственный владелец Git publication; France/GHA Runner как ограниченные исполнители; агентский процесс как читатель и редактор только своего workspace.

## Предусловия

- API key доверенно связан с `tenantId` и `profileId`; клиент и модель не выбирают repository, branch, revision, worker URL или credentials.
- GitHub owner выбирается по доверенной серверной политике tenant, а не по display name, полю запроса или тексту задачи. Для синтетических acceptance-профилей policy направляет repository в `profile-artifacts-sandbox`; обычные профили остаются в своём настроенном owner. Неизвестный tenant и конфликтующая привязка завершаются отказом до создания/изменения репозитория.
- Repository identity уникален по стабильному `tenantId/profileId`, не по имени пользователя. Два тестовых пользователя с одинаковым display name получают разные repositories; повторное совпадение repository с чужой binding не присваивается автоматически.
- Provisioning credential ограничен тестовой организацией и доступен только API/admin path. Agent/Runner получает только разрешённую workspace capability; пользовательский процесс не получает credential, позволяющий создавать или удалять repositories.
- Synthetic test principal — отдельная запись API key registry с уникальными `principalId`, `tenantId` и `profileId`; создание GitHub user account не требуется. Создание двух principals с одинаковым `displayName` не объединяет их profile data.
- Центральный router настроен France → GHA. Russia и прежняя GCP VM не участвуют в этом сценарии.
- Профиль доступен через pinned base revision. Export policy исключает PII/секреты и runtime credentials; большие объекты передаются ссылками/checksum, а не Git-байтами.
- France можно поставить первым только когда его установленный release подтверждает API saveback capability и `/readyz`; до этого профильный run безопасно переходит на GHA после pre-admission отказа.

## Основной поток

1. Клиент отправляет задачу, связанную с доверенным профилем. API проверяет задачу и создаёт один `runId`.
2. API закрепляет base revision, материализует разрешённый snapshot и выдаёт capability, ограниченную одним run, сроком действия и write-only upload.
3. Router выбирает France первым. Если France до admission явно сообщает `WORKER_PROFILE_WORKSPACE_UNSUPPORTED` или недоступен по согласованной политике, router может попробовать GHA. Подтверждённый `WORKER_CAPACITY` использует прямой GHA cutover, сохраняя 40% VM CPU/RAM headroom. После принятия run никогда не переносится на второй worker.
4. Runner проверяет размер и SHA-256 snapshot, создаёт изолированный workspace и запускает агент. Агент не получает GitHub credential владельца и не может менять доверенные параметры публикации.
5. Runner фильтрует изменения общей export policy. Каждый разрешённый файл загружается в API по run-scoped capability с checksum; manifest перечисляет все завершённые загрузки и удаления. Исключённые пути остаются недоступны и не публикуются.
6. API проверяет профиль/run binding, capability, expiry, пути, policy, sizes и checksum; применяет manifest к закреплённой base revision и публикует canonical merge с существующей обработкой конфликтов.
7. Клиент видит terminal result и честный persistence status. Следующий запуск начинает с новой опубликованной revision и может прочитать маркер предыдущего запуска.
8. Для синтетического tenant API создаёт profile repository только в `profile-artifacts-sandbox`; повторный запуск того же profile продолжает его revision. Другой `profileId` с тем же отображаемым именем получает отдельный repository. Cleanup удаляет только repository, чья tenant/profile binding принадлежит этому acceptance run, после остановки активных задач.

## Отказы и восстановление

- Старый/неподдерживающий Runner отказывает до admission; допускается переход к следующему настроенному engine.
- Сетевой timeout после неоднозначного submit не считается доказанным отказом и не создаёт вторую копию run.
- Неправильная/истёкшая capability, чужой `runId`, небезопасный или исключённый путь, неверный digest/size и неполный manifest не публикуются.
- При сбое загрузки или финализации API/Runner честно сообщает persistence failure и сохраняет единственную локальную копию workspace для recovery. Пустой manifest не подставляется; успешное сохранение не заявляется.
- Конфликт базовой revision остаётся явным и не затирает пользователя или соседний run.
- Подмена tenant, неизвестный tenant, попытка передать owner в запросе и коллизия repository binding не приводят к созданию, чтению, публикации или удалению repository.

## Acceptance

Все применимые gates должны иметь `PASS`; `FAIL` и `UNCLEAR` блокируют acceptance.

| Gate | Проверка | Текущий статус |
|---|---|---|
| 1. Semantic conformity | Сопоставить сценарий, implementation PRs и pinned revisions с каждым outcome/failure path, включая trusted tenant → GitHub owner mapping | `PASS` — проверен Runner candidate [#199](https://github.com/trained-assist/ai-agent-runner/pull/199) at `601c8f4`: tenant route берётся только из host config и trusted API principal, строгий test lane запрещает default fallback, workspace state изолирован по tenant, route drift и неизвестный tenant закрываются отказом |
| 2. Component verification | Capability scope/expiry; path/policy/checksum; upload partial/restart; publication; route refusal before admission и no reroute after acceptance; GHA parity | `UNCLEAR` — sandbox-3 API на Runner `601c8f4` был поднят отдельной службой, `/healthz` отвечал локально и через nginx. France worker принял тестовый repository только после явного allowlist. GHA write-run завершился `succeeded` и API опубликовал точные marker bytes; второй run прочитал pinned snapshot, но выявил `EACCES` при записи в read-only файл. Regression воспроизведён на GHA `main` и исправлен в кандидате PR [#33](https://github.com/vovalikessmoothy-png/opencode-gha-runner/pull/33), commit `d078f73`; `npm run typecheck`, `npm test` (208/208), `npm run smoke`, `git diff --check` проходят. Live GHA повтор заблокирован отсутствием у текущей GitHub identity read-доступа к Actions vars/secrets/runs (403); sandbox-3 API остановлен, principals пусты, workspace очищен, созданный repo удалён, GCS prefix проверен пустым. Нужен live повтор после выдачи read-доступа и запуска PR candidate на isolated GHA lane |
| 3. Generated E2E | На объявленном test/staging target создать два synthetic principals с одинаковым display name, но разными trusted IDs; проверить разные private repositories в `profile-artifacts-sandbox`, на каждом выполнить два последовательных реальных agent runs (write → read+append), проверить receipts/state/commits/logs и точные bytes; затем удалить только эти API principals, profile workspace roots, object prefixes и repositories и повторить setup | `UNCLEAR` — первый реальный write прошёл: commit `6dd7bfebc8639e5f5cb5f9ff25815635fdc82105` содержит точные marker bytes. Второй read/append выявил GHA `EACCES`; permission fix теперь есть в PR #33, но live повтор невозможен без доступа к sandbox GHA dispatch/config. Cleanup выполнен и проверен: GitHub repository даёт 404, GCS prefix пуст, API key registry содержит ноль principals, API остановлен и workspace пуст. Два одноимённых профиля с успешными read/append ещё не подтверждены |

Проверка semantic conformity 2026-10-07 сопоставила этот сценарий с API implementation `trained-assist/ai-agent-runner@767a2f14f910b6a98632ef653b36d41fbfe0b9c9` и GHA candidate `vovalikessmoothy-png/opencode-gha-runner@8d0c7ed` (включая feature commit `bbb41eb`). API выдаёт run-scoped capability; durable journal очищает snapshot URL и token; VM/GHA отправляют файлы и манифест, а API публикует только после полного манифеста. Ошибка saveback остаётся ошибкой persistence, не превращается в пустую публикацию. GHA не получает owner GitHub token для profile run. GHA issue [#29](https://github.com/vovalikessmoothy-png/opencode-gha-runner/issues/29) отслеживает upstream PR, Environment Contract и оставшиеся component edge cases.

CI component tests на API/VM PR [#184](https://github.com/trained-assist/ai-agent-runner/pull/184) и GHA candidate прошли; повторный локальный `npm test` на GHA candidate дал 204/204. Они покрывают snapshot pinning, изменения/новые файлы, удаления, checksums, отсутствие capability в durable Runner state и неполный upload. Это component evidence, не France staging E2E.

**Live France evidence, 2026-10-07:** доступ к VM2 подтверждён через сохранённый локальный SSH alias `vm2`; материал ключа хранится в GCP Secret Manager под именем `SANDBOX_VM2_SSH`. Хост общий, поэтому изменялся только выделенный worker unit. `eu-vm-1` обновлён штатным подписанным updater до `vm-worker-v0.3.2`, source `767a2f14f910b6a98632ef653b36d41fbfe0b9c9`; `/version`, `/readyz`, health и capacity подтвердили состояние. На выделенном тестовом API `:8789` запуск по `eu-vm-agent-run` передавал SSE до terminal event, после чего завершился `ENGINE_NONZERO_EXIT` с `unauthorized` от LLM provider; текущий Ladder credential там не принят. Предпринятое обновление токена не прошло health validation, сервис автоматически восстановил прежний env. Отдельный profile-canary API на `:8790` остаётся на package `0.1.0` и не содержит нового API saveback-контракта; его не обновляли. Поэтому транспортный стрим проверен, но профильный saveback не запускался. Это не acceptance и не доказательство длительной стабильности.


**Live sandbox-3 evidence, 2026-10-08:** отдельный API на France VM `127.0.0.1:8791` с внешним префиксом `/sandbox3/`; существующие API `:8787`, `:8789`, profile-canary `:8790` не изменялись. Strict tenant route направлял synthetic principals в `profile-artifacts-sandbox` по trusted `profileId`; API key registry и workspace state выделены для lane. Для `sandbox3-profile-a-20261008` GHA worker выполнил write run `run_1c13de5b-fa3d-4ce4-9cab-22ebae036541` с `succeeded`, API publication `6dd7bfebc8639e5f5cb5f9ff25815635fdc82105`; проверка GitHub API подтвердила exact marker bytes `SANDBOX3_PROFILE_0_PERSISTED_20261008`. Следующий run прочитал pinned snapshot, но завершился `WORKER_INTERNAL`: GHA получил `EACCES` при открытии read-only snapshot файла; API правильно пометил persistence как failed и не публиковал пустой manifest. Ошибка воспроизведена regression-тестом на актуальном GHA `main`; follow-up fix `d078f73` делает импортированные файлы writable только для run identity, PR [#33](https://github.com/vovalikessmoothy-png/opencode-gha-runner/pull/33). Повторный live GHA запуск не выполнен: GitHub API identity текущей сессии не имеет read-доступа к Actions vars/secrets/runs (403), поэтому нельзя удостоверить sandbox workflow dispatch и избежать общего GHA маршрута. Очистка завершена: тестовый repository удалён (GitHub 404), GCS prefix пуст, sandbox API остановлен, registry содержит ноль principals, workspace пуст. Production не затрагивался.

## Реализация и ограничения

- API saveback foundation: [ai-agent-runner PR #183](https://github.com/trained-assist/ai-agent-runner/pull/183), merged.
- VM API-owned saveback: [ai-agent-runner PR #184](https://github.com/trained-assist/ai-agent-runner/pull/184), merged at `767a2f14f910b6a98632ef653b36d41fbfe0b9c9`.
- GHA saveback candidate: [opencode-gha-runner issue #29](https://github.com/vovalikessmoothy-png/opencode-gha-runner/issues/29), candidate branch `fix/profile-saver-boundary-20261007` (feature `bbb41eb`, upload-manifest fix `8d0c7ed`); follow-up read-only snapshot permissions fix is [PR #33](https://github.com/vovalikessmoothy-png/opencode-gha-runner/pull/33), pending review/merge and live sandbox retest.
- Подписанный `vm-worker-v0.3.2` установлен и проверен на France VM2. Доступ к хосту — существующий SSH alias `vm2`; исходный secret key reference в GCP Secret Manager — `SANDBOX_VM2_SSH`. На хосте отдельно работают тестовый API `:8789` (SSE транспорт доступен; model canary завершился `unauthorized`) и profile-canary API `:8790` (старая версия `0.1.0`, без нового saveback протокола). Новую API версию пока не разворачивали.
- Environment Contract и live E2E tracking: [ai-agent-runner issue #186](https://github.com/trained-assist/ai-agent-runner/issues/186).

Сценарий остаётся target до трёх `PASS` gates и подтверждённой установки/проверки разрешённым promotion path. Production rollout не является частью локального или staging acceptance.
