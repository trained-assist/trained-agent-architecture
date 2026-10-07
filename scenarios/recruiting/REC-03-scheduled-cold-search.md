# REC-03 — Wake to fresh cold-search candidates

**Status:** target scenario; cutover away from the retiring GCP VM and a complete natural scheduled cycle remain unverified.

**Actor:** recruiter; the durable scheduler and Recruiting service are system actors.
**Value:** start the morning with current, vacancy-matched candidates who have not already been processed.

## Observable flow

1. The recruiter selects an owned vacancy, confirms its criteria and HH authorization, then enables a recurring cold-search schedule.
2. At the scheduled time the Recruiting service claims one durable occurrence and runs its bounded search/evaluation path independently of a browser session and Agent Run.
3. The service atomically persists candidate state, seen identities and an accepted result snapshot.
4. In the morning, the recruiter opens `/hh/proactive` and sees the newest accepted candidates, their match evidence, source time and any pending follow-up work.
5. A manual run uses the same domain handler and does not create a duplicate occurrence or candidate.

## Completion and failures

The schedule, occurrence, vacancy, criteria revision and results stay profile-bound across process restart and profile switch. Repeated ticks, overlap and lost acknowledgments do not dispatch duplicate provider effects. A completed result with zero matches is fresh; an auth/provider/partial/unknown result is visibly unavailable or stale, never an empty fresh list. Previously accepted results remain inspectable with their age/status. Unknown effects are quarantined and reconciled; no automatic blind replay. Paid contact access is outside this scenario unless separately requested and approved.

## Acceptance evidence

Use the real scheduler, HTTP entrypoint, HH transport, result repository and morning page/API with synthetic golden data and controlled HH/network adapters. Probe due-time execution, manual/scheduled parity, duplicate tick and overlap, crash before/after dispatch, restart, lease loss, criteria change, zero matches, provider/auth errors, seen persistence and profile switching. Run a natural full-query scheduled cycle on the approved non-GCP target before retiring the old VM; a local timer test is not that E2E. CRM deployment is an independent gate.

**Owning implementation:** [Recruiting Web](https://github.com/trained-assist/trained-assist-recruiting-web), [cold-search exit issue #187](https://github.com/trained-assist/trained-assist-hh-skill/issues/187), connected identity [architecture issue #173](https://github.com/trained-assist/trained-agent-architecture/issues/173).
