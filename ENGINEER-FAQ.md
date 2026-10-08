# Engineer FAQ: credentials, sandbox, and verification

This page answers the recurring setup questions that are common across Trained Assist repositories. It does not replace a component's `AGENTS.md` or Environment Contract. Those files are authoritative for current endpoints, target names, test identities, exact commands, reset procedures, and promotion paths.

## Before starting

### Which repository and branch should I use?

Start with the task issue and its owning repository. Read that repository's `AGENTS.md`, then follow its links to the Environment Contract and sandbox/runbook. Check the working tree and branch before editing:

```sh
git status --short --branch
git remote -v
git rev-parse HEAD
```

For architecture work, read [README](README.md), [Architecture](ARCHITECTURE.md), the relevant contract/scenario, and the linked issue. The generated repository map is only an index; check its `sourceSha` and open the original file before relying on a detail.

### Where is the current sandbox endpoint or test identity?

In the owning repository's Environment Contract, normally linked from `AGENTS.md`. Do not copy an endpoint, Worker name, deployment SHA, test profile, or reset instruction from an old architecture snapshot or another repository. If the contract is missing or does not match the deployed resource, inspect read-only state and update the contract/issue before running a write probe.

### How do I find the test commands?

Use the owning repository's Environment Contract first; then check its `README.md` and package/tool manifests. Do not guess commands from another repository. Run the declared local checks before sandbox deployment, then run the contract's realistic probe on its named target. A local test or health response is not staging or production acceptance.

## Credentials

### Where are credentials stored?

The mechanism depends on the service. The repository [Sandbox guide](SANDBOX.md#credentials-и-bindings) lists the shared patterns; the owning Environment Contract declares which binding that component needs.

| Credential class | Where to find/use it | Safe inspection |
|---|---|---|
| Cloudflare Worker secrets | Cloudflare account/Worker and secret name are declared by the owning repository. Local Wrangler uses its authenticated operator session; CI uses the repository/org secret binding. | Run `wrangler whoami` before a Cloudflare operation. `wrangler secret list` shows names only. |
| GitHub Actions secrets | Repository or organization Actions settings; names and required workflows are documented by the owning repo. | `gh secret list --repo OWNER/REPO` lists names, not values. Secret values cannot be read back from GitHub. |
| GCP Secret Manager | Secret name and project are in the owning Environment Contract or [Sandbox guide](SANDBOX.md#где-лежат-credentials--механизмы). | Use only the declared identity and secret name. Avoid commands that print secret values into terminal/tool logs; pass values directly to the consuming process or a protected local file when the contract requires it. |
| Host env files / local keychain | Host-local and permission-restricted; the Environment Contract describes the path and service owner without committing the contents. | Inspect permissions and variable names only. Never copy values into an issue, PR, shell transcript, or repository. |
| User/provider integrations | Resolved through the declared binding/credential owner with the narrowest required scopes. | Use synthetic sandbox identities. Never reuse production user tokens as fixtures. |

Never print, paste, commit, or attach secret values. Do not move credentials between production and sandbox. If a required binding is absent, stop before the provider call and follow the contract's provisioning path; do not substitute a production credential.

### Which Cloudflare account is the trained-assist test account?

The expected operator is `typeformowner@gmail.com`, Account ID `d740a05e9442c1d0feacae2dfc673e93`. Before inspecting or changing Workers, run:

```sh
wrangler whoami
```

Continue only when both the email and Account ID match. If they differ, stop before inspecting or changing Workers and confirm the active account. This account check does not authorize production operations; use only the resource and operation declared by the sandbox contract.

## Running a sandbox

### What is the safe sequence?

1. Read the owning repo's `AGENTS.md`, Environment Contract, and linked issue. Confirm target, test principal, expected effects, logs/state to inspect, cleanup, and promotion boundary.
2. Check `git status`, current branch, and source revision. Keep unrelated working-tree changes untouched.
3. Run the declared local checks. Use synthetic inputs and identities; prove the probe cannot call the production route or mutate production data.
4. For Cloudflare, verify `wrangler whoami`; then inspect the named sandbox resource and bindings. Check secret **names** if needed, never values.
5. Deploy only to the contract's isolated target. Run the component probe, then the generated end-to-end scenario required by the issue. Record the target, source/deployed revisions, sanitized input, observable output, relevant logs/state, and cleanup result.
6. Clean up disposable users, repositories, files, objects, and test state. Verify cleanup from the owning service. Keep production promotion on the documented protected workflow.

If a sandbox request fails, inspect its scoped logs/state and distinguish a definite rejection from an unknown outcome. Do not blindly retry an external write or start a second Run when the first may have been admitted. Diagnose and repeat only according to the contract's idempotency/reconciliation rules.

### What does a green health check prove?

Only the health/readiness property that the endpoint actually reports. Liveness, a 401 without credentials, a dry-run build, local tests, and a Worker deployment do not prove authenticated capability calls, task execution, persistence, delivery, or recovery. The scenario's observable outcomes and required evidence define acceptance.

### Is a sandbox deploy permission to promote to production?

No. Production is a separate boundary. Promote only through the owning repository's verified protected path after its staging gate and required approval. Architecture issues, local credentials, and sandbox permissions do not authorize a production deploy, route switch, data migration, webhook change, or user issuance.

## Finding the right source of truth

| Question | First place to check |
|---|---|
| What behavior should the system have? | Architecture scenario/contract and its change issue |
| What is implemented and accepted? | Owning repo PR/revision plus evidence in the linked issue |
| Where are current endpoints, test IDs, commands, reset, and promotion steps? | Owning repo `AGENTS.md` → Environment Contract |
| Where is a card's order/status/checklist? | Card issue and [GitHub Project](https://github.com/orgs/trained-assist/projects/1) |
| Is an old proposal still active? | Check its issue and [Legacy to fix #223](https://github.com/trained-assist/trained-agent-architecture/issues/223); closed PRs are not accepted implementation evidence. |

When these sources disagree, preserve the observed state, report the conflicting revisions, and update the owning contract/issue. Do not silently infer that a target design is already deployed.
