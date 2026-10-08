# Deployment coverage and sandbox promotion

- **Scenario ID:** OPS-DEPLOY-01
- **Status:** target; initial audit snapshot 2026-10-08, implementation gaps remain
- **Issue:** [#220](https://github.com/trained-assist/trained-agent-architecture/issues/220)
- **Actors:** repository maintainer, CI/deployment workflow, release operator, runtime provider
- **Boundary:** a reviewed source revision becomes an isolated sandbox deployment and, through the owning release path, a production deployment.
- **Scope:** production/runtime repositories and their deployed components. Retiring infrastructure is included only for inventory, export, reconciliation, and shutdown; this scenario does not reactivate it.

## Preconditions

1. The release identifies the source commit and the complete enabled component/environment set.
2. Sandbox targets have isolated names, storage, credentials, routes, and external identities; they cannot deliver to production users or mutate production state.
3. The owning repository declares its Environment Contract and the supported sandbox and promotion commands.

## Main flow

1. Maintainer selects a source revision and starts its sandbox deployment using the owning repository's supported entrypoint.
2. The workflow builds and deploys every component in that sandbox release set, applies declared compatible schema migrations, and reports any provisioned or inert component explicitly.
3. The workflow runs component smoke checks against the sandbox and records source SHA, provider deployment/version, bindings/resources, migration status, and outcomes.
4. Operator reviews sandbox evidence and promotes a pinned revision using the owning repository's production path.
5. Production release deploys every enabled runtime component/environment from that revision. Any omitted target or failed deployment makes the release incomplete.
6. Required post-deploy smoke checks confirm the expected revision and runtime identity/health for every enabled target.
7. The release evidence lists any state, secret, domain, webhook, provider resource, data import, or host configuration that is outside normal code deployment, with the exact operator action, owner, and verification.

## Failure and recovery

- A build, migration, deploy, or smoke failure blocks the release from being reported complete; evidence identifies the failed target and observed state.
- An optional/inert component is marked as intentionally skipped with its enable condition and effect on release coverage. A missing required binding is a failure, not a silent skip.
- A schema/resource change that cannot safely roll back records the forward recovery procedure and compatibility window before promotion.
- Manual state changes are repeatable or have a documented idempotency/reconciliation procedure; the next release can detect drift.
- Rollback identifies which parts are code rollback and which persistent state/resource changes need forward repair or an operator action.

## Acceptance assertions

- The production inventory is linked to owning repositories and pinned source revisions.
- Every production component has a documented isolated sandbox deploy and evidence path, or an explicit sandbox gap with owner and closure issue.
- Release target enumeration is checked against source deployment configuration, including all Cloudflare Worker environments and stateful bindings (D1, Durable Objects, KV/R2, Workflows, service bindings, secrets, routes/domains) where applicable.
- Deployment evidence distinguishes code rollout, schema migration, resource provisioning, secret/config synchronization, and external control-plane changes such as webhook registration.
- Every non-deployed state change has an explicit manual/automated operator action and post-action verification; no state is assumed to follow from deploying code.
- Production promotion remains the owning repository's protected path; sandbox acceptance alone never authorizes production mutation.

## Implementation ownership

Architecture issue #220 owns the cross-repository inventory and acceptance record. Each runtime change belongs to its owning repository and must link back to #220. Relevant initial repositories include the legacy Telegram gateway, Web, Control Plane, Runner, Model Ladder, MCP host, and any domain/provider services confirmed to serve production traffic. Repository presence alone does not establish that a component is currently deployed.

## Evidence record

For each audited repository record: repository and checked commit; production component/environment inventory; sandbox entrypoint and isolation proof; production release entrypoint and gates; persistent resources/migrations; manual/out-of-band actions; post-deploy checks; gaps and linked implementation issues. Secret values and production payloads are excluded.

## Initial audit snapshot (2026-10-08)

These are source-level observations from checked local revisions, not live provider verification. Several checkouts were on feature branches or contained unrelated local changes; verify the exact target `main` revision before implementation.

| Repository / revision | Deployment coverage observed | State outside ordinary code deploy / open concern |
|---|---|---|
| `trained-assist-tg-bot` — `efbef3e` on local branch `feature/remove-view-input-start-state` | `.github/workflows/ci.yml` builds/tests, deploys branch-isolated staging Workers and health-checks the expected SHA. Production promotion is manual `workflow_dispatch` on `main`, gated by CI + staging evidence; deploy loop covers main and recruiter plus freelance/sales only when their token secrets exist, then smoke-checks the enabled set. | Durable Object migration history is environment-specific and partly retained as comments; Cloudflare secrets are re-synced selectively (`ADMIN_GROUP_ID`) while other secrets remain separately provisioned. Telegram `setWebhook`/secret token registration is an external operation and must be listed/verified. Conditional Workers are explicitly reported as skipped but do not block the run; release evidence must call the resulting set partial when an expected production bot is enabled but its token is missing. |
| `trained-assist-web` — `d62d341` on local branch `feat/i6-error-logging-error-watcher` | `.github/workflows/ci.yml` runs tests and a staging gate, then deploys production Worker + assets from merged SHA and smoke-checks `/healthz` SHA plus expected UI. | `wrangler.toml` declares `SessionHub` SQLite Durable Object migration. Production pipeline does not visibly apply/check migrations separately; verify that Wrangler deployment applies the intended migration and that sandbox Worker/storage is isolated. |
| `trained-assist-control-plane` — `f06ca86` on `feature/i8-watcher-health-in-system-health` | CI has checks/context and a separate integration-v1 sandbox smoke workflow. `sandbox:deploy:telegram-ux` deploys one named test config. No general production deployment job is present in `.github/workflows` on this revision. | README says the generic deployment/database ID path is not production-ready; D1 migrations, Worker, Workflow bindings, service bindings, secrets, and cron are separate resources. Existing runbooks use manual `wrangler` steps. Production target and complete migration/resource procedure need an owning-repository Environment Contract and issue [CP #127](https://github.com/trained-assist/trained-assist-control-plane/issues/127). |
| `ai-agent-runner` — `908219d` on local branch `feature/i3-error-publisher` (15 commits behind `origin/main`, local `node_modules` modified) | `.github/workflows/vm-worker-release.yml` builds and attests immutable VM-worker release tags reachable from main. Operator updater installs/restarts/verifies and rolls back. This is release publication, not automatic rollout. | VM config, secrets, attached data disk/GCS identity and service lifecycle are host state. Operator must invoke updater per VM and verify `/version`, `/readyz`; API service deployment is a separate script and has its own bindings. No claim that every deployed host is updated by publishing a release. |
| `trained-assist-llm-ladder` — `fcf3d02` on local branch `feat/big-window-rungs-script`, with unrelated edits | `.github/workflows/ci.yml` deploys on main after tests; workflow provisions D1 databases, applies schemas/migrations, syncs optional Worker secrets, deploys Worker, smoke-checks endpoints/ladders and exact SHA. | Review migration commands using `|| true`: duplicate-column errors are treated as already applied, which can also hide unrelated SQL failures. Confirm both test/sandbox lane and operator runbook; this repository currently shows production auto-deploy but no first-class isolated sandbox deploy in the inspected workflow. |
| `trained-assist-mcp-host-live` — local checkout | Test-only Worker config/README/AGENTS state no production provider or production deployment path. `remote:e2e` and manual action target a fixed fixture Worker. | Test custom-domain DNS and Cloudflare security rule are out-of-band. The repository explicitly prohibits treating package release as production activation; no production Worker is currently in scope. |
| Domain skill servers / legacy agent and other provider services | Not yet audited to pinned revisions in this snapshot. | In-scope production inventory is not complete until traffic/deployment ownership is reconciled with live repository and provider inventories. Do not infer that every org repository deploys to production. |

The snapshot supports a useful first finding: production Worker pipelines can deploy source and some declared bindings/migrations, but the cross-repository release set is not yet explicit. Separate operator state (VMs, webhooks, secrets, external routes/DNS, database imports) must be enumerated and verified per owning Environment Contract. This inventory is not a production readiness assertion.
