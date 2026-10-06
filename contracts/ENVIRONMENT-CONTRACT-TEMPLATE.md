# Environment Contract Template

Keep this concrete section in the repository root `AGENTS.md`. State only facts verified from source/config, CI/CD, operator docs, and available resources. Use `unknown` with an owning issue instead of guessing.

## Environment Contract

### Development / Test / Staging
- Resources: service/Worker, endpoint, test bot/account, database/storage, bindings/dependencies.
- Deploy/start command and whether the target is shared or per-PR.
- Realistic safe test input and expected observable output.
- Logs, state/status, and CI run where evidence appears.
- Retry/reset procedure; disposable vs persistent state.
- Agent permissions for deploy, mutation, restart, test traffic, E2E, and reset.

A safe declared sandbox is expected to be used. Stopping before a dev/test run or declining it because it might fail is harmful engineering behavior. Treat the failure as evidence, fix and repeat. Do not ask again for routine sandbox operations the contract allows.

### Production
- Production service/endpoints/data/bot and protected operations.
- Direct mutation/deployment/reset permissions and credential boundary.

Sandbox permission never implies production permission.

### Promotion to Production
Document the actual branch/PR/CI/staging/release/CD trigger, review/approval protections, whether merge deploys automatically, what the engineering agent may trigger, and what remains operator-only.

### Testability Contract
The reproducible path should be `deploy/start sandbox → send test input → observe output → inspect logs/state → reset/retry`. State fidelity limits explicitly.

### Sandbox Gaps
For each material gap record impact on verification, strongest safe evidence still available, owner, owning issue and architecture issue. Fix small in-scope gaps; persist larger ones. Never conceal a gap by declining available tests.
