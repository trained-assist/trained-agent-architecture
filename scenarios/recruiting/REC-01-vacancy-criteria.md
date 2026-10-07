# REC-01 — Maintain criteria for one vacancy

**Status:** target scenario; live Agent membership and HH migration acceptance are not established.

**Actor:** recruiter.
**Value:** define the candidate profile once and keep searches, response reviews and reports attached to the right vacancy.

## Observable flow

1. The recruiter opens Recruiting Web from the Agent-selected profile and chooses an owned HH vacancy.
2. The recruiter writes criteria or asks the app to derive a draft from the vacancy description, then reviews and saves it.
3. The app shows the saved criteria revision and the vacancy to which it belongs.
4. On switching vacancies, the recruiter sees that vacancy's criteria and candidate history; no criteria or candidate state is silently shared.

## Completion and failures

Search and evaluation results identify their vacancy and criteria revision. A criteria change invalidates generated search plans and stale evaluations; user-pinned queries remain explicit. Unsupported, missing and discriminatory criteria are rejected or marked for human review rather than silently used. Missing HH access is an actionable unavailable state, never an empty vacancy or successful result. Switching the browser profile cannot reassign a running task or disable its durable schedule.

## Acceptance evidence

Call the real Recruiting HTTP/UI handlers and criteria/query-plan repositories with synthetic profiles, vacancies and golden criteria. Verify per-vacancy isolation, revision invalidation, pinned-query semantics, authorization failure, persistence across restart and no provider call for stale/invalid plans. Run direct app behavior without Agent Run; test MCP parity only for any criteria method explicitly published to the Agent.

**Owning implementation:** [Recruiting Web](https://github.com/trained-assist/trained-assist-recruiting-web), migration inventory [issue #3](https://github.com/trained-assist/trained-assist-recruiting-web/issues/3); profile authority: [architecture issue #173](https://github.com/trained-assist/trained-agent-architecture/issues/173).
