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

## Отказы и восстановление

- Старый/неподдерживающий Runner отказывает до admission; допускается переход к следующему настроенному engine.
- Сетевой timeout после неоднозначного submit не считается доказанным отказом и не создаёт вторую копию run.
- Неправильная/истёкшая capability, чужой `runId`, небезопасный или исключённый путь, неверный digest/size и неполный manifest не публикуются.
- При сбое загрузки или финализации API/Runner честно сообщает persistence failure и сохраняет единственную локальную копию workspace для recovery. Пустой manifest не подставляется; успешное сохранение не заявляется.
- Конфликт базовой revision остаётся явным и не затирает пользователя или соседний run.

## Acceptance

Все применимые gates должны иметь `PASS`; `FAIL` и `UNCLEAR` блокируют acceptance.

| Gate | Проверка | Текущий статус |
|---|---|---|
| 1. Semantic conformity | Сопоставить сценарий, implementation PRs и pinned revisions с каждым outcome/failure path | `PASS` — проверена связка ниже; candidate GHA revision зафиксирована, секреты не выдаются владельцу GHA workflow |
| 2. Component verification | Capability scope/expiry; path/policy/checksum; upload partial/restart; publication; route refusal before admission и no reroute after acceptance; GHA parity | `UNCLEAR` — Французский worker обновлён и readiness подтверждён, SSE наблюдался на изолированном API, но canary остановился на `unauthorized`; test profile API отстаёт по версии и saveback не поддерживает |
| 3. Generated E2E | На объявленном test/staging target выполнить два последовательных реальных agent runs: первый записывает уникальный маркер; второй читает и дописывает его; проверить streaming, receipts, state, commits и logs | `UNCLEAR` — live E2E не выполнялся |

Проверка semantic conformity 2026-10-07 сопоставила этот сценарий с API implementation `trained-assist/ai-agent-runner@767a2f14f910b6a98632ef653b36d41fbfe0b9c9` и GHA candidate `vovalikessmoothy-png/opencode-gha-runner@8d0c7ed` (включая feature commit `bbb41eb`). API выдаёт run-scoped capability; durable journal очищает snapshot URL и token; VM/GHA отправляют файлы и манифест, а API публикует только после полного манифеста. Ошибка saveback остаётся ошибкой persistence, не превращается в пустую публикацию. GHA не получает owner GitHub token для profile run. GHA issue [#29](https://github.com/vovalikessmoothy-png/opencode-gha-runner/issues/29) отслеживает upstream PR, Environment Contract и оставшиеся component edge cases.

CI component tests на API/VM PR [#184](https://github.com/trained-assist/ai-agent-runner/pull/184) и GHA candidate прошли; повторный локальный `npm test` на GHA candidate дал 204/204. Они покрывают snapshot pinning, изменения/новые файлы, удаления, checksums, отсутствие capability в durable Runner state и неполный upload. Это component evidence, не France staging E2E.

**Live France evidence, 2026-10-07:** доступ к VM2 подтверждён через сохранённый локальный SSH alias `vm2`; материал ключа хранится в GCP Secret Manager под именем `SANDBOX_VM2_SSH`. Хост общий, поэтому изменялся только выделенный worker unit. `eu-vm-1` обновлён штатным подписанным updater до `vm-worker-v0.3.2`, source `767a2f14f910b6a98632ef653b36d41fbfe0b9c9`; `/version`, `/readyz`, health и capacity подтвердили состояние. На выделенном тестовом API `:8789` запуск по `eu-vm-agent-run` передавал SSE до terminal event, после чего завершился `ENGINE_NONZERO_EXIT` с `unauthorized` от LLM provider; текущий Ladder credential там не принят. Предпринятое обновление токена не прошло health validation, сервис автоматически восстановил прежний env. Отдельный profile-canary API на `:8790` остаётся на package `0.1.0` и не содержит нового API saveback-контракта; его не обновляли. Поэтому транспортный стрим проверен, но профильный saveback не запускался. Это не acceptance и не доказательство длительной стабильности.

## Реализация и ограничения

- API saveback foundation: [ai-agent-runner PR #183](https://github.com/trained-assist/ai-agent-runner/pull/183), merged.
- VM API-owned saveback: [ai-agent-runner PR #184](https://github.com/trained-assist/ai-agent-runner/pull/184), merged at `767a2f14f910b6a98632ef653b36d41fbfe0b9c9`.
- GHA saveback candidate: [opencode-gha-runner issue #29](https://github.com/vovalikessmoothy-png/opencode-gha-runner/issues/29), branch `fix/profile-saver-boundary-20261007`, feature commit `bbb41eb`, upload-manifest fix `8d0c7ed`; not yet in a PR/main.
- Подписанный `vm-worker-v0.3.2` установлен и проверен на France VM2. Доступ к хосту — существующий SSH alias `vm2`; исходный secret key reference в GCP Secret Manager — `SANDBOX_VM2_SSH`. На хосте отдельно работают тестовый API `:8789` (SSE транспорт доступен; model canary завершился `unauthorized`) и profile-canary API `:8790` (старая версия `0.1.0`, без нового saveback протокола). Новую API версию пока не разворачивали.
- Environment Contract и live E2E tracking: [ai-agent-runner issue #186](https://github.com/trained-assist/ai-agent-runner/issues/186).

Сценарий остаётся target до трёх `PASS` gates и подтверждённой установки/проверки разрешённым promotion path. Production rollout не является частью локального или staging acceptance.
