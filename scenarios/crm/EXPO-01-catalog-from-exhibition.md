# EXPO-01 — Build and publish an exhibition catalog

**Status:** target scenario; production ownership, publication rights and live acceptance are not established.

**Actor:** sales consultant; the Agent may help formulate the request.
**Value:** turn an exhibition source into a usable, trustworthy participant catalog and a link the consultant can share.

## Preconditions and ownership

The user enters CRM Web under the Agent-selected profile. CRM Web owns the catalog build, participant identity, reviewed facts and publication artifact. A build may use external discovery and company-data providers through explicit adapters. The Agent is not required to keep the web workflow usable; an Agent MCP capability exists only for operations intentionally exposed to it. The shared profile/session rules are specified by [architecture issue #173](https://github.com/trained-assist/trained-agent-architecture/issues/173).

## Observable flow

1. The consultant provides an exhibition URL or chooses an owned event and requests a catalog.
2. CRM Web discovers participant records, enriches and classifies only from available evidence, and produces a versioned build with a report.
3. The consultant reviews the preview, including source and build revision, qualification labels, and counts. Each participant card includes category, description, segment, revenue/profit with source years, taxes paid with its source period, employee count with its source period, and director name/position when available and permitted. The API and rendered card use the same profile-scoped facts.
4. The consultant approves publication only when the source and publication rights permit it. CRM Web returns the resulting catalog link and build summary.

## Completion and failures

The catalog link opens the same event/build the consultant reviewed; participant identity, classification and report totals agree. All listed business facts are preserved in the versioned app model and visible on the participant card when present. Tax amounts and revenue/profit amounts retain their currency units and source periods; employee counts retain their source period; director names and positions retain provenance. Missing facts remain explicitly unknown/ unavailable, never zero or a fabricated value. Ambiguous or unsafe IDs and links are quarantined. Provider failure is visible as unavailable/unknown, not silently counted as a successful empty result. A stale preview cannot publish over a newer build. Phone, email and other private contact fields are excluded; publication still requires the applicable source and rights review.

## Acceptance evidence

Exercise the real CRM HTTP/Worker build, repository and browser handlers with invented golden events and companies. Inject only provider/network boundaries; verify deterministic build/replay, source provenance, totals, unknown classifications, unsafe/duplicate quarantine, profile isolation and rendered/API parity. Golden cards cover available and missing taxes-paid, employee-count and director facts, exact units/period labels, and exclusion of phone/email. Test MCP discovery and round-trip only for catalog methods declared in the Agent-facing capability manifest. Staging publication requires reviewed rights and the CRM Environment Contract; local fixture output is not a published site.

**Owning implementation:** [CRM Web](https://github.com/flexi-consulting/crm-web), migration/ownership [issue #3](https://github.com/flexi-consulting/crm-web/issues/3).
