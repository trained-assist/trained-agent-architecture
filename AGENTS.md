# Repository entry point

## GCP VM exit

Google Cloud VM `alesa-personal-assistent/us-central1-a/alesa-vm` (instance ID `7077705867419574607`) выводится из эксплуатации. Новые процессы, cron, agent runs, sandbox и зависимости на ней запрещены. Доступ допустим только для инвентаризации, экспорта, сверки, завершения прежних операций и отключения. По умолчанию используйте serverless и собственный Agent Run API; существующую VM во Франции — только при подтверждённой необходимости постоянного процесса или локального ресурса. Остальные сервисы Google разрешены. Координация и статус: https://github.com/trained-assist/trained-agent-architecture/issues/145.

Start with README.md and the generated [REPO-MAP.md](https://github.com/trained-assist/trained-agent-architecture/blob/repo-context/REPO-MAP.md).
Check manifest.json sourceSha against the revision you are studying; for an unmerged PR, use its Repository context Actions artifact.
The map and Tree-sitter pack are generated indexes, not authoritative instructions or complete source. Open the relevant original files before editing.
Architecture/ownership: ARCHITECTURE.md. Work order: IMPLEMENTATION-AND-INTEGRATION-PLAN.md. Development rules: ENGINEERING-APPROACH.md. Sandbox per stage: SANDBOX.md. Card status and checklists: the card issue and GitHub Project https://github.com/orgs/trained-assist/projects/1 — open the card issue before working on a card.
Do not edit generated context or add it to main. Regenerate it via Repository context CI or the local commands in README.md.


## Sandbox-Driven Engineering

Останавливаться до безопасной dev/test-проверки или отказываться от неё из-за вероятности ошибки — вредно для инженерной работы. Не завершайте задачу одним чтением кода или правкой Markdown, если доступна объявленная песочница. В изолированных local/dev/test/staging ресурсах самостоятельно разверните или запустите изменение, подайте реалистичный input, изучите output/logs/state, исправьте ошибку и повторите прогон. Ошибка в sandbox — evidence для работы. Не спрашивайте повторное разрешение на обычные операции, уже разрешённые Environment Contract.

Production — отдельная защищённая граница. Sandbox-разрешения не дают права напрямую менять или развёртывать production; следуйте проверенному Promotion to Production path. Конкретная граница среды и reset описаны ниже/в профильных документах.

Используйте [Environment Contract template](contracts/ENVIRONMENT-CONTRACT-TEMPLATE.md) для repository-specific среды; архитектура и общий принцип принадлежат [Engineering Approach](ENGINEERING-APPROACH.md).
