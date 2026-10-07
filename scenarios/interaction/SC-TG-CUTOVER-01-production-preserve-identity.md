# SC-TG-CUTOVER-01 — Production Telegram cutover preserves identity and destination

Status: **target scenario; production acceptance not yet demonstrated**. This is an operational migration scenario for the three existing Telegram bot contours. It does not redefine Telegram UX or introduce a new gateway architecture.

Related trackers: [gateway production boundary and inventory #392](https://github.com/trained-assist/trained-assist-tg-bot/issues/392), [freelance enablement #232](https://github.com/trained-assist/trained-assist-tg-bot/issues/232), [architecture cutover tracker #208](https://github.com/trained-assist/trained-agent-architecture/issues/208), [sandbox E2E #190](https://github.com/trained-assist/trained-agent-architecture/issues/190).

## Actors and boundary

- An existing Telegram user in a private chat, group, or supergroup.
- A new user entering through the existing production user creation and login flow.
- An operator promoting the gateway and controlling each bot's webhook ownership.
- The Telegram gateway, Control Plane, and Runner as components at their public contracts.

The observed legacy identity contract is `username` → Agent-owned profile/workspace; `chatId` is the Telegram delivery destination. A migration may use a Control Plane `profileId` only after the owning system confirms the mapping. It must not infer one from display names, Telegram user IDs, or chat IDs. Forum topic state remains scoped to `chatId:threadId`; chat authorization remains available at the base chat key.

## Preconditions

- Production users and session state are inventoried from the existing Cloudflare KV namespaces without deleting or rewriting source records.
- Every retained session resolves to its existing profile identity; unresolved or duplicate mappings fail closed and are reported with source evidence.
- The target Control Plane and Runner revisions, profile/principal bindings, and user-creation path are compatible and have passed their declared non-production acceptance.
- Each Telegram token has exactly one webhook owner. Existing production Worker revisions and webhook destinations are recorded for rollback.
- Main, recruiter, and freelance bot namespaces and data scopes are explicit; shared user registry access does not imply shared bot session state.

## Observable scenario

1. The operator promotes one bot contour using its owning repository's production promotion path. No other bot's Worker, webhook, or namespace changes in that step.
2. An existing authorized user sends `/start` from a private chat. The gateway recognizes the preserved login and responds as that same profile without requesting `/login`.
3. An existing authorized group/supergroup sends `/start` and a bounded task. The gateway resolves the same profile from the chat-bound session and returns the terminal response to that original chat. If the message was in a forum topic, delivery returns to the original thread.
4. A new user follows the current production account creation and `/login` flow. The user record, session, profile/principal binding, and Control Plane request resolve consistently; no sandbox user or credential is imported into production.
5. A bounded task travels through the Control Plane and Runner, reaches one terminal outcome, and is delivered once to the originating chat/thread. The same test is run for main, recruiter, and freelance with each contour's intended profile and capabilities.
6. The Worker is restarted or redeployed through the approved path. The existing user sends `/start` again and remains authorized; no login state depends on Worker memory.
7. During every step, an update for one bot cannot read another bot's session or be delivered under another bot's identity. No second Worker owns the same token webhook.

## Failure and rollback behavior

- Missing or ambiguous profile mapping, unavailable identity authority, wrong `getMe`, webhook mismatch, failed signature check, or incompatible Control Plane contract blocks that contour before webhook switch.
- No fallback silently routes a failed Control Plane request to another bot, profile, or Agent backend.
- If post-switch smoke fails, restore the prior Worker revision and its matching webhook destination for that bot; do not delete or rewrite KV data. Verify the old route receives updates before enabling new work.
- Unknown task/run outcome is reconciled by its stable IDs before any retry. Do not re-submit blindly.

## Acceptance evidence

For each contour, link the exact gateway/Control Plane/Runner revisions, source Environment Contracts, sanitized session/profile mapping evidence, `/start` result for an existing private chat and existing group/supergroup, new-user login result, one bounded task with exactly one run and terminal delivery to the original chat/thread, and restart/redeploy continuity. Record webhook owner/host and identity without tokens or full webhook URLs. Run semantic conformity, component probes, and generated E2E against the declared staging target before production promotion; record post-promotion smoke separately as production evidence.

Status remains **not accepted** until every required step has evidence. The inventory and webhook diagnostics recorded 2026-10-07 in gateway #392 establish only current state and ingress configuration, not this scenario's positive E2E.
