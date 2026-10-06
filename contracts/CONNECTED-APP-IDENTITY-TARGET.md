# Connected App identity and profile authority

Status: target decision for C14; implementation and live acceptance are tracked separately. [Connected-app identity v1](https://github.com/trained-assist/trained-assist-control-plane/pull/66) is the current read-token contract. This document describes the missing authority and three different callers: browser, agent relay and background worker.

## Authority

The platform authenticates a stable `principalId`. A platform-owned identity/profile service (initially a Control Plane module) stores profile membership, the selected profile for each user session, grants, session generation and revocation. A trusted host resolver reads this state server side before issuing any Connected App grant. An external OIDC identity provider may authenticate the principal; its login assertion alone does not decide profile membership or app scopes. The old Agent web JWT, Runner API-key registry and Control Plane task-admission principal are not this authority.

`principalId`, `profileId`, user-session ID, app audience, scopes and generation are separate fields. A profile switch increments generation and invalidates previously issued grants; logout, membership loss, disabled principal and scope removal do likewise. The application additionally checks that the requested vacancy/catalog/deal belongs to the resolved profile. Agent Run ID is correlation data only.

## Browser handoff

CRM Web and Recruiting Web act as confidential Backend for Frontend (BFF) clients. The platform authorization component offers an Authorization Code flow with PKCE `S256`, transaction-bound `state`, registered client identity and exact redirect URI. The single-use, short-lived code is bound to the authenticated platform session, selected profile generation, client, audience, redirect URI and PKCE challenge. Its atomic exchange checks all bindings and current membership. The BFF stores app tokens server side and gives the browser only a secure, HttpOnly, SameSite session cookie; it never places an access token in a URL, JavaScript state or local storage. The BFF performs API calls with the audience-bound app token. This follows [RFC 10017 §6.1](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.1) and [RFC 9700 §2.1.1](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1.1).

An app token is opaque, short lived and scoped to one app/profile. The app's registered service credential calls Control Plane introspection on protected requests and receives the [v1 active response](https://github.com/trained-assist/trained-assist-control-plane/pull/66) only while session, selected profile, membership, audience and scopes still match. Revocation is checked against durable current state. Browser profile IDs and old cookies are never issuance inputs. A user entering an app from a deep link returns to the exact permitted domain object after handoff; a wrong-profile object is denied by the app.

## Agent relay and schedules

The agent's MCP relay obtains a separate platform-issued delegation for the authenticated user, selected profile, target app and requested capability. The app applies the same domain handler and ownership checks as its UI. The model cannot author `principalId`, `profileId`, audience or scope; run/task IDs do not confer access. A relay credential is never borrowed from the browser cookie.

Recruiting schedules use an app-owned service identity and a durable grant bound to the owner profile, vacancy, schedule ID and allowed search/score commands. Each occurrence has an idempotency key and audit receipt. The service rechecks vacancy ownership, schedule enablement and credential status before dispatch. A user session can expire without silently disabling a legitimate schedule; revoking the app/vacancy grant does disable future occurrences. Unknown outcomes are reconciled, never blindly replayed. This workload grant is separate from the v1 human browser token.

## Legacy identity migration

Preserve old `USER_ID`/username as source identifiers. An owner-reviewed, receipt-bound crosswalk must explicitly attest `old namespace + source key → principalId + profileId` using both frozen source evidence and current platform membership. Missing, conflicting or unowned rows remain quarantined. No pathname, display name, email similarity or Runner key entry is sufficient by itself. Only approved bindings authorize real catalog/notes/candidate imports; source revision and object ownership are checked independently.

## Acceptance order

1. Create the trusted user-session/profile store and membership lifecycle; test two users with overlapping profiles, switch, logout, revocation and removed membership.
2. Implement and test the BFF code/PKCE handoff and app introspection across CRM and Recruiting; deny replay, wrong client/audience/redirect, expired code and stale generation. The v1 contract in both apps must remain byte-pinned or be explicitly versioned.
3. Add agent-relay delegation and schedule service identity with separate scopes, stable object references and common domain handlers. Offline tests must prove zero Agent Run launches for direct UI/API/schedule paths.
4. Approve legacy crosswalks privately, then import bound data with source receipts. Run one end-to-end user journey per app, plus a complete morning schedule cycle on the RU host, before route cutover or GCP retirement.

The [Control Plane runtime candidate #68](https://github.com/trained-assist/trained-assist-control-plane/pull/68) implements a disabled token service; [#69](https://github.com/trained-assist/trained-assist-control-plane/pull/69) records the current missing authority/handoff. Neither is a live login. CRM [#30](https://github.com/flexi-consulting/crm-web/pull/30) and Recruiting [#70](https://github.com/trained-assist/trained-assist-recruiting-web/pull/70) consume the v1 read contract behind opt-in boundaries.
