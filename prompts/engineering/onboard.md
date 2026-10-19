# Verify the production engineering identity

Process epic: https://github.com/trained-assist/trained-agent-architecture/issues/286
User ID: {{USER_ID}}
Profile ID: {{PROFILE_ID}}
Expected GitHub login: {{GITHUB_LOGIN}}
Attempt: {{ATTEMPT_ID}}

Vladimir creates this user and connects GitHub through the existing credential
flow. Record IDs, credential references and owner in #286, never the token.
The production test account used for bug reproduction is a separate role.

## First managed Run

Launch through the existing CP -> Runner API path under the specified profile.
Record the admission receipt, task/run IDs and deployed revisions. This is an
identity/access check, not a task fixing production.

Inside that Run, using its injected GitHub credential:

1. Read the authenticated GitHub identity (`gh api user --jq .login`, or the
   equivalent authenticated GitHub tool) and compare with the expected login.
2. Read architecture AGENTS.md, #286 and Project #1. Read the owning repository
   required for the next task. Record which reads succeeded and exact failures.
3. Post one CHECKPOINT comment in #286 containing the attempt, actual GitHub
   login, user/profile/task/run IDs and access results. Confirm the resulting
   comment author. This proves write access using the managed identity; a
   desktop-authored comment is not equivalent evidence.
4. Report branch/PR and Project field write permissions as unverified until
   exercised on the first authorized task. Verify access through actual
   operations; a token being connected is insufficient.
5. Confirm the Run completed and the report can be read back. Set E04 complete
   only after the required repo/Project access and managed launch are proved.

Use the normal execution prompt for the first Ready task after this check.
Watcher/dispatcher activation remains separate work in #286. Keep desktop
execution available for recovery while those components are being built.

## Failure report

Record the failing boundary (identity, repo read/write, Project, CP admission,
Runner startup or report delivery), sanitized error, receipt and resume action.
Reconcile accepted/unknown admissions before retrying. Credential repair uses
the existing connection flow; never request or paste tokens into an issue/chat.
