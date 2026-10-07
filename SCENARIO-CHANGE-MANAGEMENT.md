# Architecture Change Management & Acceptance

## Область процесса

Этот процесс управляет изменениями целевого поведения системы: новой возможностью, изменением flow, публичного/inter-component контракта, observable behavior, ролей или взаимодействия компонентов. Это change-management gate архитектурного репозитория, а не общий процесс разработки.

Обычный bugfix, который возвращает реализацию к уже описанному и принятому поведению, проходит через issue → implementation PR → обычные CI/tests; scenario-change PR не нужен. Если исправление меняет ожидаемое поведение, это уже scenario change и применяются все gates ниже.

**Scenario** — проверяемое описание ожидаемого поведения системы при взаимодействии актора с системой или её публичной границей. Актор может быть человеком-пользователем, AI-агентом, внешним API-клиентом/интеграцией, администратором/оператором, QA-инженером или автоматизированным acceptance agent, либо другим системным компонентом относительно проверяемого межкомпонентного контракта. Не все сценарии являются пользовательскими.

Канонические истории новой системы находятся в [stories/](stories/README.md). Исторический read-only snapshot импортированных материалов — [scenarios/sources/](scenarios/README.md). Новые общие поведенческие сценарии размещаются в `scenarios/<domain>/`; не создавать синхронизируемые копии спецификации в сервисных репозиториях.

## Владение артефактами

| Артефакт | Назначение | Владелец |
|---|---|---|
| Story / scenario в architecture repo | Target behavior, наблюдаемые результаты и межкомпонентные ссылки | Product/architecture owner |
| Scenario-change issue/PR | Change scope, implementation map, cross-repository acceptance и итоговое evidence | Change owner |
| Implementation issue/PR | Код, локальные проверки, runnable probes, Environment Contract и rollout своей реализации | Owning implementation repo |
| Environment Contract | Проверенные endpoints, test inputs, logs/state, reset, permissions и promotion path | Runtime component owner |

Architecture описывает сценарий и protocol приёмки. Implementation repositories сообщают свои endpoint/test entrypoints, команды и environment contracts. Architecture CI/acceptance не копирует внутренние команды и topology каждого implementation repository.

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

## Sandbox gaps и trust boundary

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
