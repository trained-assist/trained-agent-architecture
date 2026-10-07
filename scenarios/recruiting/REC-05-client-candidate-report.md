# REC-05 — Prepare and deliver a client candidate report

**Status:** target scenario; live client policy, authorization and delivery remain unverified.

**Actor:** recruiter; the client is the report audience.
**Value:** prepare a clear, sourced candidate profile for one client without exposing unsupported or stale claims.

## Observable flow

1. The recruiter starts a report from an accepted candidate source for an owned vacancy and selects the intended client/audience.
2. Recruiting Web drafts the report from the exact resume facts and current accepted evaluation, applying that client's reviewed policy and format.
3. The recruiter reviews the source facts, edits allowed sections and previews the report.
4. The recruiter approves export/publication through the app's authorized delivery path and receives the final artifact/status.

## Completion and failures

The report records its source and policy revisions. Rejected, cross-profile, stale, unscored or unsupported candidates cannot become report sources. Every material claim is traceable to permitted source facts; missing information stays missing rather than being invented. A source or policy change invalidates the preview and requires review again. A failed/uncertain export is visible and does not silently create a different report or deliver twice. Draft preview is private to the recruiter until explicit audience-approved release.

## Acceptance evidence

Test the real report API/UI, persistence and rendering with invented candidates, resume facts and client policies. Golden expectations independently assert allowed facts, section order/format, escaping, audience separation, source/policy revision fences, editing/regeneration and export idempotency. Fail closed for stale, rejected, cross-profile and unsupported sources. Test any declared Agent MCP report method against the same handler; UI/report operation works without Agent Run.

**Owning implementation:** [Recruiting Web](https://github.com/trained-assist/trained-assist-recruiting-web), report draft [issue #95](https://github.com/trained-assist/trained-assist-recruiting-web/issues/95), response source [issue #98](https://github.com/trained-assist/trained-assist-recruiting-web/issues/98), content/policy [issue #104](https://github.com/trained-assist/trained-assist-recruiting-web/issues/104).
