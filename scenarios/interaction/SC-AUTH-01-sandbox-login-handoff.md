# SC-AUTH-01 — One-command sandbox login handoff

**Status:** proposed; implementation not verified  
**Architecture issue:** [#210](https://github.com/trained-assist/trained-agent-architecture/issues/210)  
**Implementation:** [trained-assist-tg-bot#432](https://github.com/trained-assist/trained-assist-tg-bot/issues/432)

## Goal and actors

An authorized operator can prepare access for a known sandbox user with one Telegram command. The operator receives a concise, ready-to-forward login bundle. The user can authenticate in the intended sandbox without guessing the username, password syntax, bot link, or target profile.

Actors are the sandbox bot operator, the invited Telegram user, the Telegram gateway, and the sandbox user registry. This flow must not issue or disclose production credentials.

## Preconditions and boundary

- The command is handled only by the configured administrative boundary on the isolated sandbox bot.
- The target username already exists in the sandbox registry.
- The operator invokes the command in a private chat with the bot, or the bot can first deliver the secret response to that operator's private chat. It never falls back to publishing a password or bearer link in a group.
- The requested bot audience and sandbox profile are trusted deployment configuration, not caller-provided parameters.

## Main flow

1. The operator runs `/pass_reset <username>`.
2. The gateway verifies the operator boundary and resolves exactly one existing sandbox account.
3. The gateway generates a fresh password and a short-lived, single-use login handoff token. The token is opaque, scoped to this sandbox account/audience, and bound to the Telegram user who completes the handoff where that identity is available.
4. The gateway stores only the minimum verification state needed to consume the token safely. It does not log the password, token, or full deep link.
5. The gateway sends the operator, in private chat, the username, password, a ready-to-copy `/login username password` fallback, and a Telegram deep link that completes the sandbox login. The operator can forward the bundle through a trusted channel.
6. The user opens the deep link. The gateway atomically consumes the token once, creates a session for the intended sandbox username/profile, and confirms which test bot is ready.
7. The user sends a harmless test message; the sandbox bot responds through its ordinary test path.

## Visible failures and retry behavior

- Missing/unknown/ambiguous username: no credential is rotated; explain the exact correction.
- Operator not authorized or wrong bot audience: no state change and no secret output.
- Private delivery fails: report failure only in the invoking chat without exposing credentials; do not leave a new undisclosed credential active.
- Expired, replayed, wrong-audience, or wrong-user token: deny login, explain that the operator must issue a fresh handoff, and retain no reusable bearer value.
- Storage, session creation, or Telegram delivery has an unknown outcome: report that outcome as unknown; do not create another credential or login session automatically.
- Manual `/login username password` remains supported for the password fallback.

## Security and invariants

- Password and handoff token are secrets. They are sent only to the operator's private chat and are never written to ordinary logs or group messages.
- The deep link is a bearer credential until consumed; it is short-lived, single-use, audience/profile-scoped, and omitted from analytics and diagnostic output.
- Atomic single-use enforcement prevents concurrent replay. Password reset and link issuance have a durable, reviewable outcome.
- Sandbox auth state, user registry, and profile are isolated from production.
- This scenario does not return Telegram Bot API tokens, Control Plane principal secrets, or external integration tokens. Those are not user login credentials.
- The task intake and any pre-existing task/stop reconciliation state remain unchanged by login issuance.

## Acceptance evidence

For pinned architecture and implementation revisions, verify command authorization and private delivery; wrong/unknown target; successful deep-link login; password fallback; expiry; replay and concurrent replay; audience/profile mismatch; DM failure; restart; and a harmless user-originated sandbox Telegram message. Use the bot repository's Environment Contract and record sanitized output. Local tests are component evidence, not Telegram sandbox E2E.
