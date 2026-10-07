# EXPO-02 — Review an exhibition participant and create a deal

**Status:** target scenario; live profile, catalog and Weeek bindings are not established.

**Actor:** sales consultant.
**Value:** move a reviewed exhibition prospect into the sales pipeline without losing its source or creating duplicate deals.

## Preconditions and ownership

The user opens a participant from a catalog while signed into CRM Web under the Agent-selected profile. The participant and its exhibition/build revision are app-owned domain records. CRM Web owns prelead notes, the reviewed deal request and the durable operation ledger. Weeek is an external provider; its workspace and credential must be bound to the same trusted profile. CA-01 defines session and profile lifecycle behavior.

## Observable flow

1. The consultant checks the exact company, event and available source facts; adds or reviews profile-owned notes.
2. CRM Web prepares a revision-bound deal review with the required destination fields and the source participant. The consultant sees the complete final values.
3. The consultant explicitly confirms. CRM Web consumes a trusted confirmation receipt and records the operation before contacting Weeek.
4. On verified success, the app shows the Weeek deal and links it once to the same participant timeline.
5. If the provider outcome is uncertain, the operation is shown as unresolved while CRM Web reconciles by the exact operation marker. The consultant can inspect progress but cannot cause a second create by retrying the page or request.

## Completion and failures

The confirmed deal and participant link survive app restart and remain profile/event/company scoped. Changing notes or catalog source revision invalidates an unconfirmed review. Missing authority, scope, confirmation, required fields or workspace binding blocks before the external write. Timeout, incomplete provider search, no marker or conflicting markers remain unknown; absence of evidence never authorizes another create. Cross-profile reads and writes fail closed.

## Acceptance evidence

Test real CRM browser/API handlers, D1 repository and Weeek HTTP transport against disposable D1 and a controlled HTTP fixture. Golden cases cover successful create, replay, concurrent confirmation, timeout after POST, exact-marker reconciliation, incomplete scan, restart, stale review, receipt replay, CSRF/origin denial, profile/scope isolation and atomic deal linking. The explicit Agent MCP create capability, if declared, must call the same canonical handler and obtain confirmation from trusted context; a model-supplied boolean is insufficient. A real provider canary requires the reviewed test workspace and CRM Environment Contract; local evidence is not a live deal.

**Owning implementation:** [CRM Web](https://github.com/flexi-consulting/crm-web), [deal acceptance issue #38](https://github.com/flexi-consulting/crm-web/issues/38); Agent profile authority: [architecture issue #173](https://github.com/trained-assist/trained-agent-architecture/issues/173).
