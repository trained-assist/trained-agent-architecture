# Legacy profile data scripts: inventory and lifecycle

This document records what the existing profile-data scripts do, how they are
connected, and which parts are suitable inputs to the new architecture. It is
an inventory of the legacy implementation, not a claim that these scripts are
already part of the new Runner or that every migration phase runs automatically.

## Source snapshot and limits

The inventory was checked against the local `trained-assist/trained-assist-agent`
tree at commit `9ce7e2944f035e8a711f552f4cfaa8042818b25d`. That local commit adds
the `profile-payload` phase and its tests; it has not been pushed or merged. The
remote `main` observed on 2026-10-06 was
`e3a0d2f0ee8a5b1b536c2f4080edee9120449f4d`, so the `profile-payload` entry below
describes a local, unmerged change. Recheck the source revision before relying on
this inventory as a current runtime manifest.

The architecture repository's generated map is an incomplete index at source
SHA `cff6971eed4d7c73aff6e86ad2699d4152d0af05`. Original source files were read
for this inventory; generated context was not edited.

## Migration CLI and shared machinery

All migration phases are under `scripts/profile-migrate/` in the legacy repo.
The CLI defaults to read-only `--dry-run`; mutation requires an explicit
`--apply` or `--revert`. Profile selection is explicit (`--profile` or `--all`).
The runner uses the profile maintenance lock, drains active work, flushes
buffered profile writes before mutation, writes an append-only ledger, then
verifies or reverts through the same phase contract. These controls apply to
CLI maintenance operations; they do not make every phase an end-of-Run hook.

| Script | Responsibility |
|---|---|
| `cli.mjs` | Parses phase/profile/mode flags, defaults to dry-run, optionally emits JSON, applies gentle process priority for mutations, and returns distinct usage/failure/lock exit codes. |
| `runner.cjs` | Runs a phase for one or more profiles; coordinates lock, drain, flush, scan, plan, prepare, ledger, apply, verify and revert; reports conflicts and failures without silently treating them as success. |
| `classifier.cjs` | Walks profile files using `config/profile-clean-list.yaml`, assigns data classes/actions, reports unknown/special files, and provides the shared scan used by reporting and migration. |
| `report.cjs` | Read-only aggregate inventory from saved classifier JSON or a live scan; reports size/class totals, largest paths and unclassified share, with optional strict threshold and secret scan. |
| `ledger.cjs` | Validates and appends migration records with path, size, SHA-256, action and destination; folds records for verify/revert and handles torn trailing records. |
| `quarantine.cjs` | Stores reversible local quarantine copies, restores them, and supports explicit grace-period purge; a delete phase does not immediately erase data. |
| `gitignore.cjs` | Generates the profile Git image's `.gitignore` from the same clean-list rules; `EXCLUDE` is emitted last so private runtime/secret paths cannot be re-included by a broad keep rule. |
| `phases/index.cjs` | Discovers and validates phase modules; it is a registry/contract, not a migration operation by itself. |

### Registered phases

| Phase | Behavior |
|---|---|
| `delete.cjs` (`delete`) | Moves regenerable `DELETE` data to local quarantine, records it, verifies its hash and supports restore. Purge is a separate explicit operation. |
| `archive-sessions.cjs` (`archive-sessions`) | Archives eligible session bodies/transcripts to GCS; confirms upload/read-back integrity before removing the local source; supports verify/revert. |
| `worktree.cjs` (`worktree`) | Classifies nested Git working copies. Clean, pushed copies and empty/unborn clones go to reversible quarantine; dirty trees or local/unpushed commits are bundled to GCS, reconstructed and checked before source removal. Uncertain Git state is left alone. |
| `large-files.cjs` (`profile-payload`, local commit only) | Composite M2–M4 phase: session archive + worktree handling + supported files of at least 3 MiB. Media/documents are streamed to GCS and read-back checksum-verified; `.trained-assist/artifacts.json` stores path/ref/checksum/size/MIME. Large unsupported types are reported for review and left in place. |
| `credentials-reachability.cjs` (`credentials-reachability`) | Inventory/invariant check that previously reachable credentials remain reachable; reports names and hashes, not secret values; it does not move credentials. |

The composite phase does not introduce Git branch merging. A Git working copy
with changes is preserved as a bundle; preservation is distinct from merging
profile changes into a canonical branch.

## Related profile repository and Run lifecycle code

These files are part of the same data path but are not migration CLI phases:

| Script/module | Responsibility and boundary |
|---|---|
| `scripts/profile-repo.mjs` | Provisions a private per-profile GitHub repository and handles membership/admin operations. Its scope is repository setup; it is not the generic migration importer or the profile workspace merge engine. |
| `src/session-blob-store.js` | GCS adapter for object upload/download and checksums. The local `profile-payload` addition uses streaming file APIs so large files need not be buffered in memory. |
| `src/session-archive.js` | Shared session/transcript archive operations used by the CLI archive phase and post-Run sweep. |
| `src/session-materialize.js` | Restores archived session state on demand, checking bytes before exposing a local file to the engine. |
| `src/session-sweep.js` | Deferred post-Run sweep for session bodies/transcripts only: lock, flush, skip in-flight sessions, archive/verify, then remove local copies. It does not sweep arbitrary large profile files or Git repositories. |
| `src/profile-save.js` and `src/runner/index.js` | On a completed non-internal Run, the runner calls profile save to commit/push the selected text image to the private profile repo; a failed publish is reported. This is the ordinary profile save hook, not an invocation of `profile-payload`. |
| `src/profile-lock.js` | Local profile maintenance lock used to prevent a CLI migration/sweep from racing profile work. It is not the target Runner's distributed ownership/fencing contract. |

The local `profile-payload` command has no automatic Run-completion, systemd,
timer, or GitHub Actions trigger in the inspected tree. To invoke it, an operator
must run the CLI explicitly. The separate session sweep is automatically
scheduled after Run completion, but handles only session/transcript archival.

Typical explicit commands (default profile root and clean-list can be overridden):

```sh
node scripts/profile-migrate/cli.mjs profile-payload --profile <profile> --dry-run --json
node scripts/profile-migrate/cli.mjs profile-payload --profile <profile> --apply --json
node scripts/profile-migrate/cli.mjs profile-payload --profile <profile> --verify --json
node scripts/profile-migrate/cli.mjs profile-payload --profile <profile> --revert --json
```

## Tests present in the legacy tree

| Test file | Main coverage |
|---|---|
| `test/profile-migrate.test.cjs` | Classifier rules and profile scanning. |
| `test/profile-migrate-runner.test.cjs` | CLI modes, lock/drain/flush, phase execution, ledger and failure reporting. |
| `test/profile-migrate-ledger.test.cjs` | Ledger validation, append/fold behavior and torn-tail recovery. |
| `test/profile-migrate-quarantine.test.cjs` | Quarantine, restore and purge safety. |
| `test/profile-migrate-gitignore.test.cjs` | Clean-list-to-Git-image rules, including hard private-data excludes. |
| `test/profile-migrate-archive-sessions.test.cjs`, `test/session-archive.test.cjs` | Session archive phase and archive integrity behavior. |
| `test/profile-migrate-worktree.test.cjs` | Clean/dirty/unborn worktrees, bundle round-trip, verification, failure and revert cases. |
| `test/profile-migrate-payload.test.cjs` (local commit only) | Large media/document refs, review-only files, Git-copy handling, checksum/read-back failure and revert. |
| `test/session-blob-store.test.cjs` | Blob adapter; the local addition covers streaming upload/checksum/download. |
| `test/session-sweep.test.cjs` | Post-Run sweep locking, flushing, in-flight exclusion, retries and bounds. |
| `test/profile-save.test.cjs` | Profile Git image selection and commit/push behavior; local addition verifies artifact manifest inclusion. |
| `test/credential-reachability.test.cjs` | Credential reachability inventory and invariant checks. |

The focused migration/storage tests for local commit `9ce7e294` were run during
implementation: the selected migration/profile-save group passed 34 tests, and
the streaming blob-store test passed. This is unit/fixture evidence; it does not
prove a live GCS write, a production profile import, or a remote Git publication.

## Ownership in the new architecture

This inventory documents legacy behavior for reuse and migration planning. The
new system's persistent workspace and canonical publication belong to the
Runner's WorkspaceService contract and its prepare/publish/conflict flow (see
[ARCHITECTURE §4.6](ARCHITECTURE.md) and [Runner #95](https://github.com/trained-assist/ai-agent-runner/issues/95)).
See also the storage/lifecycle evidence in [Runner #136](https://github.com/trained-assist/ai-agent-runner/issues/136).
The migration CLI's local lock, ledger and archive logic do not replace that
contract, do not merge run branches, and are not evidence that new Runner
lifecycle wiring is complete. Keep the future import tool's tests focused on
data classification, checksums, idempotence, failure/revert, and the production
adapter boundary; keep per-Run snapshot/publication integration tests with the
Runner that owns WorkspaceService.
