# SC-CRM-TG-01 — CRM Telegram workflow through Agent MCP

**Status:** target behavior; sandbox acceptance pending.  
**Change:** [architecture issue #214](https://github.com/trained-assist/trained-agent-architecture/issues/214).  
**Actors:** CRM user, Telegram gateway, Agent, CRM Web, connected CRM provider.  
**Channels:** Telegram, Agent MCP, CRM Web handlers.

## Goal and ownership

A CRM user can use the CRM Telegram bot to reach supported CRM capabilities. The gateway owns Telegram commands, callbacks, deep-link transport and response delivery. The Agent owns the selected-profile authority, capability discovery and MCP calls. CRM Web owns canonical catalog, prospect and deal data, validation, approval and persistence. A Telegram username, chat payload or user-supplied profile identifier cannot select or change the acting profile.

Every bot action must map to a currently declared Agent MCP capability backed by a CRM Web handler. The bot must not clone CRM state or call a legacy worker for domain actions. A visible menu entry without a declared capability and an observable result is not an implemented command.

## Main path — create a deal from a catalog participant

1. The user opens the isolated CRM test bot or follows a catalog link carrying a stable participant reference.
2. The gateway validates the update, deduplicates it, and retains bot/chat/thread and request identity. It sends the user's command and exact arguments to the Agent under the authenticated session's selected profile; it does not derive a profile from message text.
3. The Agent discovers and calls the declared CRM capability. CRM Web resolves the participant inside that profile's authorized catalog and prepares a deal draft.
4. The user sees the exact company, event, profile, price/tax facts and fields that will be written, then explicitly confirms or cancels.
5. On confirmation, CRM Web validates the approval and creates the deal idempotently. The gateway reports success only from the canonical result. If the provider reply is lost, the Agent reconciles the same operation identity; it never creates again blindly.
6. The user can read the final deal reference and status in Telegram and in the connected CRM site. The browser path remains usable without an Agent Run.

## Other supported commands

`/start`, `/help`, catalog links, and each advertised CRM command must have an explicit mapping to a declared capability or a gateway-owned transport action. The menu and help must be derived from the accepted CRM capability/command registry. Unsupported legacy actions are reported as unavailable; they are not silently simulated or sent to the old bot. The historical command inventory and known gaps are tracked in issue #214 and owning implementation issue [trained-assist-tg-bot #465](https://github.com/trained-assist/trained-assist-tg-bot/issues/465).

## Required failure behavior

- Wrong, missing, expired, or unavailable profile authority fails closed before CRM effects.
- A stale or malformed deep link returns a clear error and does not guess a catalog, profile, or participant.
- Duplicate Telegram update/callback is idempotent and does not create a second deal.
- Missing, denied, or stale user confirmation does not write.
- CRM Web or Agent MCP unavailable is reported as unavailable/pending, never as success.
- An unknown provider result is reconciled against the same operation; no blind retry creates another deal.
- Switching a connected-site browser profile cannot retarget an already admitted Telegram task or change its scheduled work.

## Acceptance evidence

Use a dedicated sandbox Worker, test bot and synthetic CRM profile/provider. Test the actual Worker webhook, command registration, `/start` parser and callbacks; route Agent MCP calls to actual CRM Web handlers and sandbox persistence. Only Telegram delivery, profile/approval authority and the external deal provider may be controlled test boundaries. Verify one review-confirm-confirmed-deal path, a lost provider response with reconciliation and no second write, plus profile mismatch, stale link, duplicate update, unavailable capability and missing approval. Pin revisions, Environment Contracts and sandbox target in issue #214 and linked implementation issues. No production bot webhook or real CRM/provider write is part of this scenario.

## Implementation status

The dedicated `trained-assist-tg-bot-sales-sandbox` Worker and `@flexi_leads_bot` test identity are provisioned; the test bot has no Telegram webhook. Its public health endpoint responds and its command menu currently contains only generic Agent commands. CRM catalog/deal calls have passed synthetic Agent Runner → CRM Web handler probes, but those probes register test descriptors and do not prove production Agent capability registration or Telegram-to-Agent delivery. CRM commands, trusted Agent profile binding, and `/start` catalog-link handling remain unimplemented in the gateway path; full deal acceptance remains pending. See [issue #214](https://github.com/trained-assist/trained-agent-architecture/issues/214) and [issue #465](https://github.com/trained-assist/trained-assist-tg-bot/issues/465).
