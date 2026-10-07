# CA-01 — Connected app session follows the Agent profile

**Status:** target scenario; runtime acceptance pending. This records the accepted C14 identity boundary in R-015 and does not enable Connected App login or provision membership.

**Actors:** authenticated Agent user; Agent identity/profile authority; CRM or Recruiting Web BFF; Control Plane Connected App broker; app domain handler; scheduler; Agent capability relay when a capability is explicitly exposed.

**Owning contracts and work:** [identity target](../../contracts/CONNECTED-APP-IDENTITY-TARGET.md), [connected app journeys](../../contracts/CONNECTED-APP-USER-SCENARIOS.md), [R-015](../../REQUIREMENTS_LOG.md); Control Plane [#90](https://github.com/trained-assist/trained-assist-control-plane/issues/90); CRM Web and Recruiting Web implementation issues and Environment Contracts. Independent app journeys retain their own acceptance gates.

## Preconditions

- Agent authority has authenticated a principal and resolved the selected profile and current selection generation from its server-side session. Browser input cannot assert principal, profile, membership or generation.
- A Connected App client is registered with exact audience and redirect URI. Its requested app scopes are separately granted for the selected profile.
- Any enabled membership is explicitly provisioned and reviewed by Agent authority. Fixtures alone never enable live access.

## Browser handoff and protected request

1. The user opens CRM Web or Recruiting Web and starts its registered authorization-code flow. The Agent authority authenticates/resumes the user session and resolves the selected profile from that session.
2. Agent authority issues a short-lived, one-use context bound to the app client, exact redirect, transaction nonce, Agent session, principal, profile and generation. If the authority and broker are in one Worker, this is a private typed call; across a service boundary it is a signed, versioned assertion.
3. The BFF completes Authorization Code with PKCE S256. The broker checks the current Agent context and app grant and atomically consumes the one-use context/code. It issues an opaque, short-lived token scoped to one app, profile and granted operations. BFF stores tokens server-side and gives the browser only a Secure, HttpOnly, SameSite cookie.
4. For each protected request, BFF validates Origin/CSRF for commands, uses a server-owned return destination and allowlisted backend, and calls the app API with its app token. Broker introspection checks current Agent session, membership/profile generation and app audience/grants. The real app handler then authorizes the requested domain object against the token profile and performs the operation.
5. A normal UI/API action reaches its app handler directly; it does not require an Agent Run or MCP. If the Agent exposes a capability for that operation, real MCP discovery/transport maps the declared method to the same handler and returns the same object identity, revision and typed outcome. UI-only and scheduler operations do not acquire artificial MCP requirements.

## Profile lifecycle and scheduled work

1. Switching the browser's selected profile advances that browser session's generation and invalidates its app tokens. A task already admitted remains bound to its original profile; a profile switch neither retargets nor silently cancels that task and does not disable a durable schedule.
2. Every later effect is checked against current Agent membership and the applicable app/workload grant. A schedule has a separate service identity and durable grant bound to its owner profile, vacancy, schedule and allowed commands; each occurrence has an idempotency key and audit receipt. The scheduler cannot choose a profile or carry HH credentials.
3. Revoked membership/grants block new effects. If an external write has an unknown outcome, the app records and reconciles it before retrying; it does not blindly repeat the side effect.

## Required failures (fail closed)

- Forged browser/model profile, unregistered client, wrong audience or redirect, mismatched PKCE/state, expired or replayed code/assertion: deny issuance/exchange and produce no app side effect.
- Stale profile generation, changed selection, logout, disabled principal, removed Agent membership, missing app grant or wrong-profile domain object: deny protected access/effect; do not infer membership from Control Plane app-grant rows.
- Agent authority or introspection unavailable: return a typed unavailable response and perform no protected read or side effect. An outage is not proof of logout/membership loss; do not silently fall back to cached authorization.
- Unsafe return URL, failed Origin/CSRF check, or attempted open redirect: reject the request without performing a command.
- Profile switch while work is active: retain the task's original profile binding; never attribute subsequent effects to the newly selected browser profile. Existing permitted scheduled occurrences remain enabled unless explicitly disabled or their workload authorization is revoked.
- External command timeout with unknown outcome: surface pending/unknown and reconcile by operation ID before another attempt.

## Acceptance evidence

Use at least two principals and two profiles with overlapping domain data. Test the Agent authority itself through its real Worker routes, D1 migrations, handlers and SQL; replace only the external authenticated identity/gateway transport at its boundary. Test the Connected App broker through its real Worker routes and D1 handlers, replacing only the Agent authority port with a stateful deterministic fixture for isolated broker cases. Also run an integrated probe using the real authority module and broker in the same Worker/D1. Replace real external CRM/HH/network providers only at their declared ports. Seed invented identity data with explicit synthetic reviewer and receipt references; never use fixtures to create real access.

Prove real authorization decisions and side effects, including forged profile, cross-audience scope, stale generation, logout/removal, unavailable authority, assertion/code expiry and replay, CSRF/redirect denial, profile switch during admitted task, schedule ownership/deduplication, wrong-profile object and unknown-outcome reconciliation. Assert denied requests make zero protected reads/writes where applicable.

For each app, probe its user-facing/API handler and declared domain capabilities. Add MCP discovery, transport and payload-parity probes only for operations actually exposed to the Agent; compare them with the same canonical handler. Verify scheduled cold search through the app's scheduler entrypoint independently of MCP. Run generated E2E against the target declared by each owning Environment Contract. Record target and pinned revisions for Agent authority, broker, each app and capability adapter. Scenario ↔ implementation semantic conformity must be `PASS`; then component probes and generated E2E must pass. Until all applicable gates pass, status remains target-only and live user issuance remains disabled.
