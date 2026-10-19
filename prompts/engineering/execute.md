# Engineering agent start

Issue: {{ISSUE_URL}}
Process epic: https://github.com/trained-assist/trained-agent-architecture/issues/286
Project: https://github.com/orgs/trained-assist/projects/1
Mode: {{MODE}} (desktop-manual or managed-run)
Attempt: {{ATTEMPT_ID}}

Read issue and all comments/linked PRs. Read architecture AGENTS.md, README.md,
ACCEPTANCE-CHECKLIST.md and SCENARIO-CHANGE-MANAGEMENT.md, then owning repository
AGENTS.md/Environment Contract. Compare main and deployed revisions. If docs
contradict observed configuration, establish evidence and correct them in a PR.

Post START in the issue: attempt, actual executor identity, UTC time, source refs,
DoD interpretation, plan and next checkpoint. Check existing claims/Runs first.
In manual mode one operator coordinates execution; comments are not atomic locks.
Managed mode requires a dispatcher claim receipt.

Execute through DoD. For bugs first correlate incident/task/run ID and actual
failure; reproduce on sandbox. Do not infer root cause from generic notifications.
Record accepted scenarios and architecture PASS/FAIL/UNCLEAR. Behavior changes
need a scenario-change PR before runtime code; regression fixes do not require
invented scenario changes. Define checks and observable outcomes before coding.

Use isolated worktree/branch; create implementation draft PR before tests. Fix
using evidence and repeat relevant checks. After semantic PASS mark PR ready;
sandbox component/E2E acceptance precedes merge. Follow owning promotion path,
verify deployed revision and production outcome. Merge is not Done; keep owning
issue open until production DoD passes.

Update unclear documentation as you work. Distinguish facts, hypotheses and
unverified claims. Record missing access/identity by reference without secrets;
continue independent work while a stage is blocked.

After milestones/failures and before stopping, post the report template in this
issue; process gaps go in #286. Preserve reproduction commands, refs, IDs and
next action. Reconcile unknown external effects before retrying submissions,
publishing or deployments. Follow canonical acceptance rules.

Close only with DoD evidence. Otherwise report the exact blocker, completed and
remaining work and resume action. Documentation/health alone does not fix a bug.
