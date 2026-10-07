# REC-02 — Review and evaluate HH responses

**Status:** target scenario; live profile membership, HH access and staging E2E remain unverified.

**Actor:** recruiter.
**Value:** see which applicants fit a vacancy, with evidence for each judgment and a clear path to the exact response.

## Observable flow

1. The recruiter opens responses for an owned vacancy in the selected Agent profile.
2. Recruiting Web shows the current HH response/status and the last accepted evaluation, if any.
3. The recruiter requests evaluation. The app evaluates against the current criteria and presents a verdict and evidence per criterion, including an honest no-match result.
4. The recruiter opens the exact candidate conversation when needed; sending a message follows [REC-04](REC-04-approved-candidate-message.md).

## Completion and failures

Each response and evaluation stays bound to its profile, vacancy, candidate and criteria revision. Missing/incomplete resume data is an explicit error or unknown assessment, not an invented score. Re-evaluation updates the current evaluation without duplicating the candidate. A changed vacancy, scope loss or stale criteria cannot publish an old result as current. Provider/auth/evaluator errors never look like zero applicants. Protected reads fail closed on profile mismatch or unavailable authority.

## Acceptance evidence

Test actual HTTP handlers, HH detail transport and evaluation worker with synthetic response pages and an injected evaluator. Verify status projection, evidence completeness, no-match, malformed/missing resume, stale revision, re-evaluation, retry/idempotency, restart, profile/vacancy isolation and privacy-safe logs. Do not fake the HTTP route, handler or storage layer. MCP discovery/transport is additional only for explicitly Agent-exposed evaluation/read methods.

**Owning implementation:** [Recruiting Web](https://github.com/trained-assist/trained-assist-recruiting-web), response route [issue #86](https://github.com/trained-assist/trained-assist-recruiting-web/issues/86) and explicit conversation [issue #93](https://github.com/trained-assist/trained-assist-recruiting-web/issues/93).
