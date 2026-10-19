# Agent engineering queue

Process epic: [#286](https://github.com/trained-assist/trained-agent-architecture/issues/286).
Pilot task: [#285](https://github.com/trained-assist/trained-agent-architecture/issues/285).
Project #1 existed before this pilot. Queue fields were added; watcher, dispatcher,
distributed leases and end-to-end automatic execution for this queue are still
pending. Desktop execution is manual. Reuse the existing
[continuous-dev controller](tools/continuous-dev/README.md) from epic #253:
it already has a local single-writer lock, durable intent, prompt packets and
handoff validation. It does not implement the Project intake/dispatcher or
distributed claims; do not build a competing local controller.

## Source of requirements

[Acceptance](ACCEPTANCE-CHECKLIST.md) owns delivery gates;
[scenario change management](SCENARIO-CHANGE-MANAGEMENT.md) owns behavior changes.
Project fields track execution, not a second acceptance policy.

| Status | Meaning |
|---|---|
| Draft | Intake/triage; collect incident, scenario, owning repo and DoD. Diagnosis may start before semantic PASS. |
| Ready | Architecture fit PASS, dependencies ready, observable DoD and environment path known. |
| In progress | Executor recorded START/attempt; Verification stage identifies current step. |
| Verification | Validate results, sandbox/E2E, promotion and production DoD. |
| Blocked | Evidence, exact blocker and resume action recorded. |
| Done | All applicable criteria proved; close issue. |

Stages: Reproduction -> Implementation/Draft PR -> Scenario review -> Ready PR ->
Sandbox verification -> Production deploy -> Production smoke -> Complete.
Draft exists before tests; semantic PASS precedes ready PR; sandbox acceptance
precedes merge. Return to implementation after FAIL. Features first specify
scenario changes and DoD. Architecture fit is tied to reviewed revisions.

Manual ordering: operator priority, then oldest created Ready issue whose
dependencies are satisfied. The explicit owner request starts #285 diagnosis
before triage is complete. One operator coordinates claims in this pilot;
an issue comment is NOT an atomic lease. Managed execution needs idempotent
claims, fencing, heartbeat, reconciliation and bounded retries/budget (#286).

## Launch and report

Use [execution prompt](prompts/engineering/execute.md), replacing issue URL,
mode and attempt ID. Pilot: `desktop-manual`, `arch285-desktop-20261019-01`.
Other stages: [triage](prompts/engineering/triage.md),
[verification](prompts/engineering/verify.md), [resume](prompts/engineering/resume.md).
Use the [report template](prompts/engineering/report.md) in the owning issue.
Process gaps go in #286. Handoffs preserve refs, IDs, uncertain effects and next
actions. Avoid automatic issue closure on PR merge while production DoD is pending.

## Engineering identity

Vladimir creates the production engineering user and connects GitHub.
Until verified, START names the actual desktop identity. The engineering user
and the account reproducing a bug are different roles. Record profile/user IDs,
credential references and scopes, repo/Project access, sandbox and promotion
path; never record tokens. Managed execution uses CP -> Runner API.
Follow the [identity onboarding checklist](prompts/engineering/onboard.md);
a connected token alone does not prove that the Run received the right identity.

## Existing production diagnosis entrypoints

CP has `inspect-production-test-account-task.yml` and `inspect-production-task.yml`.
Read current main YAML first. The former supports read-only `find-canary-task`
with a bounded time window and a fixed test-account conversation filter. It is
not a general user lookup. The latter reads task/attempt/Runner receipts by exact
task ID. A workflow's existence does not prove a successful diagnostic run.

For #285, assuming Europe/Moscow, the 19 October 2026 15:25-15:40 window is:

```sh
gh workflow run inspect-production-test-account-task.yml --repo trained-assist/trained-assist-control-plane --ref main -f mode=find-canary-task -f from_ms=1792412700000 -f to_ms=1792413600000
```

Then inspect the resulting task ID. Do not select cancellation for diagnosis.
Record Actions URL and sanitized evidence. Existing environment secrets let this
workflow run without exporting credentials onto the desktop.

The stale CP Environment Contract was corrected in
[CP PR #358](https://github.com/trained-assist/trained-assist-control-plane/pull/358).
Revision `cde47e717d29a0c156a90b2994be974dff4cc813` passed staging and production
checks in [run 39291052041](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/39291052041).
Recheck current main/deployed revisions on each new attempt.

## Desktop and dispatch recovery evidence

On 19 October, desktop socket tests failed with `listen EPERM 127.0.0.1`.
The same suites passed in repository CI. Record local failures as environment
limitations and link the exact successful CI SHA; never relabel a failed local
run as PASS. Existing Actions also provided diagnostics when local Cloudflare
credentials were unavailable.

GitHub returned HTTP 500 for production-check workflow dispatches during the
pilot. A dispatch response error does not prove that no workflow was admitted.
Read the recent workflow runs and reconcile repository, workflow, ref/SHA,
creation window and inputs/attempt marker when available before retrying.
Allow for delayed visibility and keep uncertainty explicit. GitHub concurrency
serializes execution but does not deduplicate requests or guarantee FIFO ordering.
The current canary workflow lacks a caller-supplied attempt ID; managed dispatch
needs durable intent and receipt correlation before automatic retry (#286 E07).

The pilot implementation PR, signed release and smoke evidence belong in #285.
A simple context canary is useful regression evidence but does not establish
that table publication works. Record missing reproduction context separately.

