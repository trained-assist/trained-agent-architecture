# SC-OPS-DEPLOY-01 — Protected main automatically deploys the tested revision

Status: **target scenario; production acceptance pending**. This describes normal code deployment for the existing Telegram gateway and the new, isolated Control Plane production target. It does not authorize a Telegram route or webhook cutover.

Related trackers: [automatic deploy change #213](https://github.com/trained-assist/trained-agent-architecture/issues/213), [Telegram production cutover #208](https://github.com/trained-assist/trained-agent-architecture/issues/208), [gateway deployment #392](https://github.com/trained-assist/trained-assist-tg-bot/issues/392), [Control Plane production target #127](https://github.com/trained-assist/trained-assist-control-plane/issues/127).

## Actors and boundary

- A maintainer merges reviewed changes to protected `main` after its required checks pass.
- GitHub Actions deploys the exact merged revision to isolated staging, verifies it, then deploys that revision to production.
- Production smoke checks report the deployed revision and the identity/readiness appropriate to that service.
- Telegram users, webhooks, profile mappings, and task routing remain outside this release action.

## Preconditions

- `main` requires strict branch protection and successful CI plus staging gates.
- Staging has distinct Workers, data stores, credentials, and test identities from production.
- Each production service has an owning-repository config and scoped deploy secrets; the Control Plane has its own production D1 and Workflow, separate from every sandbox.
- Production smoke and rollback commands are pinned to the deployed Worker and its previous version.

## Observable scenario

1. A reviewed change is merged to protected `main`.
2. CI, mandatory scenario checks, staging deployment, and staging smoke all run against the same commit SHA. If any gate fails, production deployment does not start.
3. After all gates pass, the owning repository automatically deploys that SHA to its configured production Worker(s); no separate routine `workflow_dispatch` confirmation is required.
4. Production smoke confirms the exact `buildSha` and service identity/readiness. A failed deployment or smoke fails the release and records the affected Worker and revision for rollback.
5. Re-running the workflow manually is only recovery for a missed event and applies the same gates.
6. The gateway's Agent/Control Plane route, Telegram webhook destination, KV ownership, chat-to-profile mapping, and Telegram bot identity do not change as part of this deploy. Deploying the isolated Control Plane target does not connect the gateway to it.
7. A separate accepted cutover scenario and explicit profile/Runner readiness are required before changing any production Telegram route.

## Failure and rollback behavior

- Failed CI, scenario, staging deploy, or staging smoke blocks production deployment.
- Partial production deploy or failed post-deploy smoke is surfaced as failure; the owning repository restores the recorded previous Worker version and verifies its health.
- Sandbox workflows cannot select production bindings or credentials.
- Unknown or stale deployment SHA is a failure; no later revision is treated as a substitute for the tested revision.

## Acceptance evidence

For each owning repository, link the workflow revision, branch-protection requirements, exact merged SHA, staging deploy/smoke result, production Worker version, post-deploy smoke, and tested rollback procedure. Record production Worker identity only; do not expose credentials or user payloads. Full Telegram → Control Plane → Runner E2E remains a separate prerequisite for route cutover and is not implied by deployment success.
