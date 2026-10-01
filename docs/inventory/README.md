# Inventory (Z01 · AC-40)

This directory is the committed coverage table for **every repository the agent org touches**.
It is owned by `trained-assist/trained-agent-architecture` — the repository that holds the
development baseline — precisely so the table lives next to the plan that requires it.

## Files

| File | Committed? | What it is |
| --- | --- | --- |
| `repo-coverage.md` | yes | The human-readable table (AC-40). |
| `repo-coverage.json` | yes | The same rows, machine-readable; the input to the drift job. |
| `construction-tasks.md` | **no** | A review artefact produced by the same run. It is regenerated on demand and never committed — a committed task list looks like a to-do list somebody owns, and nobody does. |

## Regenerate

```bash
# TOOL is a checkout of the release named by profile_ref in repo-coverage.json.
# GH_TOKEN is supplied by the existing credential provider; never store its value here.
node scripts/inventory/regenerate.mjs "$TOOL" docs/inventory
```

The workflow reads `profile_ref` from the table itself, checks out that release and verifies
its resolved commit. All participating repositories are mandatory: unreadable is a failure.
The table owner is scanned from the current PR checkout, so the table describes the proposed
owner tree; every other repository is read from its live default branch. No fields are discarded.

## Drift is a failure

The job compares both generated files byte for byte. It uses the existing organization
`AUTOFIX_PAT` credential because a single-repository Actions token cannot read private neighbors.
Only read requests are made by inventory. No new secret is provisioned. A changed participating
repository can block this gate until the table is regenerated; this maintenance cost is intentional.

## Credentials

The table records credential **names** only, and that is a gate rather than a convention:
`scripts/inventory/assert-no-credential-values.js` scans the committed JSON by value shape
(GitHub tokens, OpenAI-style keys, AWS keys, PEM blocks, `Authorization` headers,
credential-bearing URLs) and fails the workflow on a hit. It prints the JSON path, never the value.

## Reading the columns

`*_present` is what exists in the repository today. `*_required` is what the merge rule demands.
They are separate columns on purpose: the presence of a job is not a green job, and `staging_present
= true / staging_required = true` says nothing about whether staging currently passes.