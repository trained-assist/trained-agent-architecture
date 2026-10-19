# Resume engineering work

Issue: {{ISSUE_URL}}
New attempt: {{ATTEMPT_ID}}
Read last checkpoint, claim, Runs, PRs and deployment receipts. Compare actual state;
expired heartbeat does not prove the former executor stopped. Reconcile unknown
submit/merge/deploy/publish outcomes, then continue the first incomplete step.
Do not repeat an engine or mutation just because of a timeout. Post RESUME linking
previous checkpoint and pinned revisions. Report in owning issue; process gaps #286.

For GitHub Actions dispatch errors/timeouts, reconcile recent workflow runs by
repository, workflow, ref/SHA, time window and attempt marker before retrying.
Concurrency is not deduplication. If the existing workflow has no attempt input
and admission cannot be established, report uncertainty instead of submitting
another identical mutation. Read AGENT-ENGINEERING-WORKFLOW.md for pilot evidence.
