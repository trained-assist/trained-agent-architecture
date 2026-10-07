# Repository entry point

## GCP VM exit

Google Cloud VM `alesa-personal-assistent/us-central1-a/alesa-vm` (instance ID `7077705867419574607`) выводится из эксплуатации. Новые процессы, cron, agent runs, sandbox и зависимости на ней запрещены. Доступ допустим только для инвентаризации, экспорта, сверки, завершения прежних операций и отключения. По умолчанию используйте serverless и собственный Agent Run API; существующую VM во Франции — только при подтверждённой необходимости постоянного процесса или локального ресурса. Остальные сервисы Google разрешены. Координация и статус: https://github.com/trained-assist/trained-agent-architecture/issues/145.

Start with README.md and the generated [REPO-MAP.md](https://github.com/trained-assist/trained-agent-architecture/blob/repo-context/REPO-MAP.md).
Check manifest.json sourceSha against the revision you are studying; for an unmerged PR, use its Repository context Actions artifact.
The map and Tree-sitter pack are generated indexes, not authoritative instructions or complete source. Open the relevant original files before editing.
Architecture/ownership: ARCHITECTURE.md. Work order: IMPLEMENTATION-AND-INTEGRATION-PLAN.md. Development rules: ENGINEERING-APPROACH.md. Sandbox per stage: SANDBOX.md. Card status and checklists: the card issue and GitHub Project https://github.com/orgs/trained-assist/projects/1 — open the card issue before working on a card.
Before using a live Telegram test lane, read the “Live Telegram test lanes” section in SANDBOX.md for lane ownership, shared downstream resources, occupancy checks, and log access.
Do not edit generated context or add it to main. Regenerate it via Repository context CI or the local commands in README.md.

## Architecture change acceptance

For any behavior-changing feature, flow, public/inter-component contract, observable behavior, or actor-role change, follow [Architecture Change Management & Acceptance](SCENARIO-CHANGE-MANAGEMENT.md) before implementation. Distinguish these changes from a bugfix that restores already accepted behavior; ordinary bugfixes use the owning repository's issue → implementation PR → CI/tests path.

Treat scenarios as actor/system-boundary contracts, not only human user stories. Actors include users, AI agents, API clients/integrations, administrators/operators, QA/acceptance agents, and system components at public interfaces.

The scenario-change PR is the acceptance record. Link implementation issues/PRs and pinned revisions, read each owning repository's Environment Contract, and run the three applicable gates: semantic conformity (`PASS` required; `FAIL` and `UNCLEAR` block), component probes, and generated E2E against the declared target environment. Run these manually while meta-CI is unavailable; record target and evidence. Do not label local tests as staging E2E.

In isolated local/dev/test/staging, refusing a safe deploy, realistic test input, controlled failure, inspection, or repeat only because the sandbox might fail is harmful; use the failure as engineering evidence and continue the loop. Production is a separate protected boundary: only the owning repository's verified promotion path authorizes production changes or post-deploy smoke.


## Sandbox-Driven Engineering

Останавливаться до безопасной dev/test-проверки или отказываться от неё из-за вероятности ошибки — вредно для инженерной работы. Не завершайте задачу одним чтением кода или правкой Markdown, если доступна объявленная песочница. В изолированных local/dev/test/staging ресурсах самостоятельно разверните или запустите изменение, подайте реалистичный input, изучите output/logs/state, исправьте ошибку и повторите прогон. Ошибка в sandbox — evidence для работы. Не спрашивайте повторное разрешение на обычные операции, уже разрешённые Environment Contract.

Production — отдельная защищённая граница. Sandbox-разрешения не дают права напрямую менять или развёртывать production; следуйте проверенному Promotion to Production path. Конкретная граница среды и reset описаны ниже/в профильных документах.

Используйте [Environment Contract template](contracts/ENVIRONMENT-CONTRACT-TEMPLATE.md) для repository-specific среды; архитектура и общий принцип принадлежат [Engineering Approach](ENGINEERING-APPROACH.md).

## PR hygiene

Устаревшие, superseded или противоречащие новым решениям открытые PR создают неоднозначность и растущий delivery-риск. Считайте открытые PR в scope текущей задачи: при 3–5 самостоятельно разбирайте очевидные дубли/superseded PR, кратко указывайте причину закрытия и обновляйте актуальные описания; при 8+ сообщите пользователю о красной очереди и спросите, делать ли разбор первым. Пока ждёте ответ, продолжайте независимую безопасную работу, но не закрывайте спорные PR и не плодите новые. Не переписывайте историю и не force-push.

## Одновременные инженерные сессии

При двух и более активных сессиях в одном репозитории выделяйте каждой отдельный clone или Git worktree и ветку. Не редактируйте и не переключайте одну общую checkout/ветку из параллельных сессий. Защита ветки и незакоммиченной работы важнее небольшой экономии на повторной загрузке текстовых файлов — недостающий текстовый контекст можно скачать отдельно.
