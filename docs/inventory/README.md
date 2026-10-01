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
# token needs read access to the org; the tool clones nothing but asks the API for each tree
export GH_TOKEN=…
node "$TOOL/scripts/devbaseline.mjs" inventory \
  --repos "$TOOL/inventory/repos.json" \
  --profile-ref v1.7.4 \
  --out docs/inventory \
  --strict
```

`--profile-ref` is **required in practice**. Without a pinned ref, a table produced by another
version of the tool is indistinguishable from a table that has gone stale — that is exactly the
blind spot the drift job exists to close.

`--strict` turns an unreadable repository into a failure. Without it an unreadable row is
reported and written, which is right for a local sweep and wrong for the gate.

## Drift is a failure, on purpose

`.github/workflows/coverage-drift.yml` re-runs the generator against the pinned ref and fails on
any byte of difference in `repo-coverage.md` / `repo-coverage.json`. Change an adapter, or the
profile set, and the table stops describing reality — the job says so instead of the table
quietly ageing. Override the tool with the repository variable `AUTOFIX_REF` when the pin moves.

## Credentials

The table records credential **names** only, and that is a gate rather than a convention:
`scripts/inventory/assert-no-credential-values.js` scans the committed JSON by value shape
(GitHub tokens, OpenAI-style keys, AWS keys, PEM blocks, `Authorization` headers,
credential-bearing URLs) and fails the workflow on a hit. It prints the JSON path, never the value.

## Reading the columns

`*_present` is what exists in the repository today. `*_required` is what the merge rule demands.
They are separate columns on purpose: the presence of a job is not a green job, and `staging_present
= true / staging_required = true` says nothing about whether staging currently passes.