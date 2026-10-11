# SC-OPS-DEPLOY-01 — Protected main automatically deploys the tested revision

Status: **accepted — 2026-10-08**. This describes normal code deployment for the existing Telegram gateway and the new, isolated Control Plane production target. It does not authorize a Telegram route or webhook cutover.

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

Both owning repositories completed the protected-main exact-SHA path:

- Telegram gateway: [automatic deployment PR #468](https://github.com/trained-assist/trained-assist-tg-bot/pull/468) merged; current production revision `de02f5ba70ed69315643696b939f46f4d8cc4acd` passed CI, mandatory scenarios, staging deploy/smoke/gate, production deploy, and production smoke in [run 37789760827](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/37789760827). Independent probes confirmed exact SHA, expected bot identity, and unsigned webhook rejection for main, recruiter, and freelance. Rollback was exercised on a disposable staging Worker, restored version `b65671ff-243e-44e7-a4c3-3da69b90cfe3`, and the probe Worker was deleted. Operational details: [gateway issue #392](https://github.com/trained-assist/trained-assist-tg-bot/issues/392).
- Control Plane: [isolated deployment PR #139](https://github.com/trained-assist/trained-assist-control-plane/pull/139) merged; production revision `96b6094bc4e35954e50c63f4a2e1a85bd5f11813` passed checks, staging migration/deploy/smoke, and production migration/deploy/smoke in [run 37790615776](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/37790615776). Production Worker version: `7424649e-ac87-483c-aec6-7263eb5a5efb`; the production D1 count is zero tasks in WEUR. Anonymous private diagnostics read returned 401. Rollback was exercised on staging and restored the recorded prior version. Operational details: [CP issue #127](https://github.com/trained-assist/trained-assist-control-plane/issues/127).

Gate 1 semantic review: `PASS`. Gate 2 component verification: `PASS`. Gate 3 deployment E2E: `PASS` for both owning repository release paths. Full Telegram → Control Plane → Runner E2E remains a separate prerequisite for route cutover and is not implied by deployment success.

Live production recheck on 2026-10-10: main, recruiter, and freelance Workers each returned health `200` at build `4e3d5edefa0dc98269fba23e2d905aedca054652`; `/debug/whoami` confirmed a bot identity for each; an unsigned webhook POST returned `401` for all three. These read/negative-security probes do not exercise task execution or change any Telegram route.

The same gateway revision includes [PR #488](https://github.com/trained-assist/trained-assist-tg-bot/pull/488), which gives classifier route resolution its own bounded request deadline instead of using the fast Telegram read deadline. Its scenario gate and CI passed, followed by staging deployment/smoke and protected production deployment/smoke in [run 37918963835](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/37918963835). Focused local tests for route deadlines, CP outcomes, and intake ownership passed (150 tests). This confirms deployment and component behavior; it does not establish a real Telegram message → classifier → Runner → Agent → delivery E2E. That path remains unverified while the delivery-owner duplicate case is unresolved.
Record production Worker identity only; do not expose credentials or user payloads.
