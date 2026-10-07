# REC-04 — Send only the approved candidate message

**Status:** target scenario; live HH conversation and authorization acceptance remain unverified.

**Actor:** recruiter.
**Value:** communicate in the right tone without sending a draft the recruiter has not approved.

## Observable flow

1. The recruiter opens the exact candidate conversation under an owned profile and vacancy.
2. Recruiting Web drafts a reply from current context; the recruiter edits and reviews the final text.
3. The recruiter explicitly confirms that exact text and sends it once.
4. The app shows the confirmed delivery result or a typed unresolved state.

## Completion and failures

The send is bound to candidate, vacancy, profile and reviewed message revision. A new inbound reply or changed conversation invalidates a stale draft and prompts a fresh review. No message is sent without explicit confirmation. Repeated browser submission cannot send twice. An unknown send result is reconciled against provider evidence and never blindly retried. Profile switch, missing send scope or unavailable authority prevents a new send without retargeting other admitted work.

## Acceptance evidence

Exercise actual browser/API command handlers and the HH conversation transport with controlled HTTP responses and synthetic message bodies. Verify same-origin CSRF, exact reviewed body, stale conversation, scope/profile switch, one-send idempotency, timeout/unknown reconciliation and log redaction. Agent MCP is tested only if the send operation is explicitly exposed to Agent runs; browser authorization remains independently tested.

**Owning implementation:** [Recruiting Web](https://github.com/trained-assist/trained-assist-recruiting-web), response/conversation [issue #93](https://github.com/trained-assist/trained-assist-recruiting-web/issues/93); shared authority [architecture issue #173](https://github.com/trained-assist/trained-agent-architecture/issues/173).
