# Architecture Change Management & Acceptance

## Область процесса

Этот процесс управляет изменениями целевого поведения системы: новой возможностью, изменением flow, публичного/inter-component контракта, observable behavior, ролей или взаимодействия компонентов. Это change-management gate архитектурного репозитория, а не общий процесс разработки.

Обычный bugfix, который возвращает реализацию к уже описанному и принятому поведению, проходит через issue → implementation PR → обычные CI/tests; scenario-change PR не нужен. Если исправление меняет ожидаемое поведение, это уже scenario change и применяются все gates ниже.

**Scenario** — проверяемое описание пользовательского SLA: какую ценность и наблюдаемый результат система обязана дать актору на публичной границе. Актор может быть человеком-пользователем, AI-агентом, внешним API-клиентом/интеграцией, администратором/оператором или другим системным компонентом. Сценарий задаёт результат и условия его сохранения при изменениях; он не является инструкцией, запретом или списком полномочий для QA/разработчика.

Канонические истории новой системы находятся в [stories/](stories/README.md). Исторический read-only snapshot импортированных материалов — [scenarios/sources/](scenarios/README.md). Новые общие поведенческие сценарии размещаются в `scenarios/<domain>/`; не создавать синхронизируемые копии спецификации в сервисных репозиториях.

## Владение артефактами

| Артефакт | Назначение | Владелец |
|---|---|---|
| Story / scenario в architecture repo | Target behavior, наблюдаемые результаты и межкомпонентные ссылки | Product/architecture owner |
| Scenario-change issue/PR | Change scope, implementation map, cross-repository acceptance и итоговое evidence | Change owner |
| Implementation issue/PR | Код, локальные проверки, runnable probes, Environment Contract и rollout своей реализации | Owning implementation repo |
| Environment Contract | Проверенные endpoints, test inputs, logs/state, reset, permissions и promotion path | Runtime component owner |
| Scenario Registry | Стабильные IDs, владельцы, спецификации, зависимости и ссылки на E2E в owning repositories | Architecture repo; тесты остаются в owning repositories |
| Feature manifest | Явные связи feature issue с обязательными implementation/E2E PR, их ролями и зависимостями; sandbox report | Architecture change owner |

Architecture описывает сценарий и protocol приёмки. Проверки связывают implementation с SLA и ловят регрессии. Implementation repositories сообщают свои endpoint/test entrypoints, команды, topology и Environment Contracts; ограничения операций и порядок работы со средой принадлежат этим contracts/runbooks, а не сценарию.

## Change lifecycle

1. Найти существующие stories/scenarios, invariants, contracts и owning repositories; определить, меняется ли target behavior.
2. Для behavior change открыть architecture issue и scenario-change PR до runtime-кода. Записать target scenario, акторов, наблюдаемые outcomes/failures и acceptance scope. Bugfix без смены target поведения идёт обычным implementation workflow.
3. Связать scenario-change PR с implementation issues и PRs/revisions каждого owning repository. Каждый изменяемый runtime-компонент должен иметь актуальный Environment Contract; контракт создаётся или обновляется в той же implementation change, если его testability меняется.
4. Реализовать изменения и запускать gates ниже вручную на доступном sandbox/staging по мере готовности. Реальная ошибка в изолированном sandbox — evidence для диагностики и повторного прогона, не основание останавливать разработку.
5. Scenario-change PR остаётся открытым, пока требуемая реализация не готова, gates не пройдены и evidence не связано с pinned revisions. В scenario добавляются фактические implementation refs и явно остающиеся ограничения.
6. После acceptance архитектурный PR можно merge. Он фиксирует согласованный target и подтверждённый результат; отдельный follow-up architecture PR обычно не нужен.

## Architecture Acceptance Pipeline

Один protocol применяется к целевому окружению, указанному для прогона. Перед merge implementation PR типичная цель — staging; после штатного production promotion тот же protocol может выполнить ограниченный production smoke. Production verification не разрешает architecture gate менять production напрямую.

### Gate 1 — Scenario ↔ Implementation semantic review

Агент получает scenario diff, ссылки на implementation PRs/revisions и относящиеся evidence. Он отвечает только на вопрос: соответствует ли реализуемый код изменению сценария? Это semantic conformity review, а не доказательство работоспособности.

Результат: `PASS`, `FAIL` или `UNCLEAR` с привязкой к требованиям и ссылками на код/evidence. Только `PASS` проходит gate. `FAIL` означает установленное несоответствие; `UNCLEAR` блокирует так же: требование, код или ссылки/evidence недостаточно прозрачны, чтобы подтвердить связь.

### Gate 2 — Component verification

Из изменённых наблюдаемых шагов scenario формируется небольшой verification plan для независимо проверяемых частей через endpoint/API, fixture или UI adapter. Команды, base URLs, test identities и reset берутся из Environment Contracts owning repositories, а не угадываются архитектурным CI.

Например, для изменения Telegram keyboard проверить отдельно: нужное состояние возвращает четыре ожидаемые кнопки; порядок совпадает со сценарием; «Посмотреть input» отсутствует до готовности input; в разрешённом последующем состоянии просмотр input сохраняется. Выполнить probes на целевом sandbox/staging, сохранить команды/requests, assertions и результаты с ревизией реализации.

### Gate 3 — Generated E2E against target environment

Агент читает изменённый сценарий и доступные Environment Contracts и составляет актуальный максимально внешний E2E plan для выбранной цели (`local`, `dev`, `test`, `staging` или ограниченный post-deploy `production smoke`, если это предусмотрено контрактом). Запускается только реально заявленный и разрешённый target. Приёмка до production проверяет staging; после deployment допускается production smoke по штатному пути.

Не поддерживается один вечный hand-written cross-repo test как копия всех сценариев. Scenario задаёт specification; агент генерирует конкретный план проверок и связывает каждую assertion с шагом сценария и environment entrypoint. Сохраняются target, implementation revisions, plan, sanitized input, observable output, релевантные logs/state и ссылка на run. Локальная проверка не называется staging E2E.

### Result and evidence

Каждый gate имеет `PASS`, `FAIL` или `UNCLEAR` и краткое обоснование. Для приёмки все применимые gates должны быть `PASS`; неприменимый gate помечается с причиной и ссылкой на доказательство другого подходящего уровня. `FAIL` ведёт к исправлению и повторному запуску. `UNCLEAR` ведёт к улучшению traceability или тестируемости; он не трактуется как pass.

Evidence хранится в scenario-change PR или связанных implementation PR/issues: scenario ID и changed steps, implementation repo/PR/commit SHA, target environment и его контракт, команды/probes, E2E run URL, результаты и ограничения fidelity. Не помещать секреты, персональные данные или production payloads в evidence.

## Машинная трассировка и статические gates

Этот раздел — единственное архитектурное описание Feature Promotion gates. Общие delivery правила остаются в [ACCEPTANCE-CHECKLIST.md](ACCEPTANCE-CHECKLIST.md), реализация — в engineering playbooks, sandbox topology и команды — в Environment Contracts. Не копировать их сюда.

- [Scenario Registry](scenarios/REGISTRY.json) индексирует существующие канонические сценарии по неизменным ID. Он ссылается на спецификации и на E2E в репозиториях-владельцах; он не переносит тесты и не превращает `stories/TRACEABILITY.md` в тестовый каталог. Story ↔ scenario и старые ID остаются в TRACEABILITY.
- Для изменения сценария PR содержит `features/<issue>/manifest.json` по [schema](contracts/feature-manifest.schema.json). Manifest хранит feature issue, явные required/optional implementation/E2E PR membership, зависимости и обоснованные coverage exceptions; scenario IDs и architecture PR выводятся из diff и GitHub event. PR state, merge SHA и CI conclusions берутся из GitHub API; эти значения не копируются в manifest. После merge implementation/E2E PR Gate B сверяет manifest candidate SHA set с GitHub; Gate C report отдельно содержит tested SHA, target, run и evidence URL, чтобы Gate B не зависел от своего будущего результата.
- Gate A — быстрый локальный валидатор при открытии/обновлении Draft PR: registry/ID/path/dependency validity, изменённые scenario-to-E2E mappings, manifest shape и совпадение feature issue с PR description. Для coverage, которую невозможно доказать статически, отсутствие mapping даёт FAIL; только явный reason/owner/evidence exception может пройти.
- Gate B — после интеграции implementation/E2E PR: сверяет явный PR graph с GitHub API, merged state (закрытый без merge — FAIL), strict branch protection для базовых веток, обязательные checks на текущем PR head SHA, зависимости и совпадение candidate SHA set с merge SHA. API errors, недостаток разрешений, rate limits или неполный ответ дают BLOCKED, не PASS. Gate B не требует результата финального E2E Gate C.
- Статические проверки не устанавливают семантическое отсутствие противоречий между произвольным кодом и текстом. Это остаётся Gate 1 review. Документные ссылки проверяет существующий docs CI; OpenAPI/JSON Schema дополнительно валидируются имеющимися владельцами контрактов. Не объявлять линтер доказательством semantic conformity.

Registry — индекс связей, а не второй источник требований. Если сценарий перемещён или переименован, его ID не меняется; меняется только spec path. Тесты принадлежат репозиторию, который может их запускать и обслуживать.

`component_tests` — отбор локальных probes, не E2E-покрытие. Реальная E2E-связь находится в `e2e_tests` и указывает workflow или runnable test в owning repository. На момент первичного аудита автоматическая sandbox E2E-связь найдена для SC-OPS-QA-01; остальные сценарии пока не объявляются покрытыми. Их scenario-change PR заблокирован до добавления E2E ref или reviewable coverage exception с tracking issue.

Gate A и детерминированные тесты находятся в `tools/feature-promotion/`; workflow запускает их на `opened`, `synchronize`, `reopened` и `ready_for_review`, включая Draft PR. Изменение поведения сначала проходит Gate A, затем реализационные шаги по playbook. `features/<issue>/manifest.json` может иметь незаполненный PR graph до реализации, но Gate B не проходит, пока обязательные PR не merged и их CI не успешен. Gate B принимает `repository_dispatch` после merge реализационного PR и оставляет `workflow_dispatch` для ручного запуска; автоматический publisher cross-repo событий остаётся частью wiring acceptance и не должен создавать обратную зависимость на Gate B/Gate C.

## Sandbox gaps и trust boundary

### Gate C execution adapter

`tools/feature-promotion/gate-c.mjs` выполняет существующий acceptance protocol в workflow `Feature promotion Gate C`. Успешный Gate B отправляет `feature-acceptance-requested`; ручной запуск использует `workflow_dispatch` с `architecture_pr`, `manifest_path`, `mode=acceptance`. Gate C повторно выполняет Gate B до model call и после тестов: проверка Gate A на текущем architecture SHA, PR graph, CI и candidate revisions остаётся общей реализацией. При изменении SHA результат не публикуется как PASS. Проверки не вызывают друг друга в обратном направлении.

Runtime переиспользует проверенную в PR autofix схему OpenCode 1.18.32 → OpenAI-compatible Ladder provider → `LLM_LADDER_TOKEN`. Профиль **build / default** (`ladder/build`) выбран для Gate C явно; выбор моделей и fallback принадлежат Ladder. `ladder/free` здесь не используется. Токен подставляется из окружения, не записывается в конфигурацию или artifact.

Изменённые сценарии выводятся из PR diff, регрессии — из обратного транзитивного замыкания `depends_on`. Registry указывает существующие component/E2E locations; агент читает спецификации, implementation snapshots и Environment Contract, составляет executable plan, затем оценивает реальные результаты. Контроллер запускает команды, сохраняет exit codes, timestamps и хэши sanitized logs. Ответ LLM не может перекрыть неуспешный процесс, отсутствие E2E для сценария или изменение исходных source/test files. Семантика, observable assertions и cleanup должны быть PASS; отсутствие evidence даёт UNCLEAR/BLOCKED.

Manifest добавляет только явный выбор `sandbox_acceptance.target`: `environment` и `contract: {repo, path}`. Контракт читается из pinned revision. Первая исполняемая версия поддерживает **isolated local** sandbox в одноразовых Docker containers; это не staging. Remote shared lanes требуют owning adapter с occupancy/claim/reset и пока дают BLOCKED. GitHub write token остаётся у контроллера, OpenCode получает только Ladder token, test containers не получают ни одного из них. Model containers читают inputs read-only. Лимиты: 50 минут job, 10 минут на model/probe process, 25 минут на последовательность probes, 4 GiB/2 CPU на container; artifacts хранятся 7 дней. Это runtime limits, не гарантия денежного потолка Ladder.

`report.json`, `report.md`, plan, command receipts и transcripts прикладываются к Actions run; краткий отчёт и commit status `feature-promotion / sandbox-acceptance` публикуются в architecture PR. PASS разрешает дальнейшую штатную приёмку, но адаптер сам не выполняет merge/deploy. Этот status нужно включить в required checks при rollout branch protection; до этого он не является принудительным merge gate. `mode=infrastructure-probe` запускает настоящий OpenCode/Ladder и localhost HTTP E2E, проверяя сам адаптер без product feature. Он не выставляет feature acceptance status и не заменяет Gate A/B или staging evidence.

Если изменяемую часть нельзя проверить на нужном уровне, это **Sandbox Gap**. Небольшой безопасный gap закрывается в той же работе; существенный документируется в Environment Contract и issue owning repository. Межпроектный gap связывается с architecture issue. Не подменять отсутствующую среду локальным тестом и не утверждать staging/production coverage без фактического прогона.

Dev/test/staging предназначены для автономной разработки, deploy, realistic test input, controlled failures, наблюдения и повторов в пределах Environment Contract. Production — отдельная защищённая trust boundary: ни scenario PR, ни sandbox-разрешения не разрешают прямое production mutation/deploy. Promotion и, если нужно, post-deploy smoke выполняются только по проверенному promotion path owning repository.

## Минимальный формат scenario

- Стабильный Scenario ID, цель, actor(s), prerequisites и публичная граница.
- Ссылки на связанные stories, contracts/invariants, owning repositories и implementation issue(s).
- Trigger → наблюдаемые шаги → ожидаемые outcomes; применимые failure/authorization/retry/restart пути.
- Статус target/implemented/verified и pinned source revisions для подтверждённых фактов.
- Изменённые шаги и соответствующие component probes/E2E assertions.
- Ссылки на Environment Contracts и acceptance evidence; явно непроверенные пути и Sandbox Gaps.

Не включать календарный план, task checklist, секреты, сырые данные или неподтверждённые утверждения о production. Статус исполнения ведётся в issue/Project, а не параллельно в архитектурном тексте.

## Связанные канонические документы

- [Architecture](ARCHITECTURE.md) — система, ownership, invariants и trust boundaries.
- [Stories](stories/README.md) — ценность и акторы.
- [Scenarios](scenarios/README.md) — каталог новых сценариев и происхождение исторических копий.
- [Acceptance protocol](ACCEPTANCE-CHECKLIST.md) — краткая общая приёмка и production safeguards.
- [Engineering Approach](ENGINEERING-APPROACH.md) и [Sandbox](SANDBOX.md) — практика разработки и проверки.
- [Environment Contract template](contracts/ENVIRONMENT-CONTRACT-TEMPLATE.md) — формат per-repository testability contract.
