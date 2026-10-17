# SC-CRM-EXPO-01 — Launch an exhibition catalog through Agent

**Status:** target behavior; sandbox acceptance pending.  
**Change:** [exhibition epic #259](https://github.com/trained-assist/trained-agent-architecture/issues/259), [scenario/baseline #260](https://github.com/trained-assist/trained-agent-architecture/issues/260).  
**Actors:** sales user, Agent, CRM Web, exhibition source, company-data providers, site publisher.  
**Boundaries:** Agent-selected profile and MCP capability; CRM Web catalog/domain API; approved publication target.

## User outcome and ownership

A sales user gives the Agent an exhibitor directory and receives a reviewable catalog of participants, their target classification and evidence, followed by a published site only after the requested preview is accepted. The same task survives a restart and subsequent corrections. CRM Web owns canonical event, company, enrichment, classification and publication records; the Agent owns selected-profile authority, orchestration and capability discovery. Source and provider adapters can reuse Sales Skill handlers until CRM Web takes over their domain state. A site-only export does not imply that CRM deal actions are available.

The historical [exhibition source scenario](../sources/trained-assist-agent/docs/user-scenarios/exhibition/01-exhibition-catalog-to-sales-site.md) describes the older script workflow. It does not establish deployment or Agent MCP capability for this target scenario. The related [CRM Telegram scenario](SC-CRM-TG-01-agent-mcp-command-workflow.md) governs catalog-to-deal commands after those capabilities are declared.

## Trigger and observable path

1. Under an authenticated, selected profile, the user supplies a directory URL or an identified source artifact. The Agent records event/source identity, requested publication mode, and the source revision. It reports a source failure or unsupported format without inventing exhibitors.
2. CRM Web imports stable participant identities with names, stands, source links and provenance. A repeat import or restart resumes from a durable checkpoint and does not silently mark unattempted participants complete. A second supported source format follows the same domain contract.
3. The enrichment adapter resolves legal identity, INN and OGRN with matching evidence; Checko provides financial, employee and tax facts where available. Every non-Russian/unsupported, no-match, low-confidence and unavailable-provider outcome remains distinguishable. For every found INN, the system either records revenue with period/source or records why it is absent; it retries missing INNs separately rather than treating the first search as final.
4. CRM Web classifies participants as target, near-target or other, preserving the evidence and uncertainty used. The review view shows counts, missing-data coverage and a sample of each class before publication. A correction to card fields or classification in the same task updates the durable specification and invalidates affected previews; restarting cannot restore superseded requirements.
5. The approved catalog card presents the company and stand, category, useful description and source/profile/site links where known. Target and near-target cards include available revenue, profit, paid taxes, employees, director and tax regime with source and period. Phone and email are hidden. Zero tax rows are omitted. A Checko tax link uses a validated OGRN and goes to `/company/{ogrn}/taxes`; no link is invented from INN alone. A derived tax regime is explicitly marked as an inference from provider evidence; provider outage is shown as unavailable, never as a regime.
6. The Agent presents a preview and its versioned manifest. Publication uses the approved preview/source/profile/target and a stable operation identity. The user receives the actual URL and a readback of the published artifact; a failed or unknown publish is reconciled before any retry. CRM-enabled deal actions require their own declared capabilities and profile-bound approvals.

## Failure and continuity requirements

- Missing or denied profile authority stops before source/provider/publication effects; a URL or chat payload cannot select another profile.
- Provider timeout, rate limit, malformed response and low-confidence match retain per-company status and checkpoint. A successful HTTP transport response alone does not prove financial coverage.
- A process restart resumes the same event, artifact revisions and operation identities. Repeated enrichment and publish requests do not duplicate accepted effects.
- If publication acknowledges ambiguously, the Agent reads back the target before deciding whether to retry. It never reports a URL as published from an unverified response.
- Site-only publication and CRM deal creation remain separately observable and separately authorized.

## Acceptance plan

Use synthetic profile, exhibitor/provider fixtures and capture-mode publication on a declared free sandbox lane. Component probes cover import identity/deduplication, batch resume, INN/revenue coverage, card rendering, and publication reconciliation through the actual handlers. Generated E2E covers start → preview → approval → readback, restart, same-task correction, unavailable API, denied profile and a second source format. Pin source/deployed SHA, task/run/build/operation IDs and sanitized evidence in #260 and the owning implementation issues. Semantic conformity, component probes and generated E2E each require `PASS` before this scenario is accepted. A local fixture is evidence for its component, not a deployed sandbox E2E.

The two independent full-stack test lanes are `tg-probability`/`tg-shturman` (shared Control Plane and Runner) and `tg-sandbox3`. Before a live invocation, follow [SANDBOX.md](../../SANDBOX.md) and [lane occupancy #185](https://github.com/trained-assist/trained-agent-architecture/issues/185); a free Telegram ingress alone does not make its shared downstream free. Production changes follow each owning repository's promotion path.

## Implementation map

- Batch/resume: [Sales Skill #36](https://github.com/trained-assist/trained-assist-sales-skill/issues/36).
- Domain contract, provider enrichment, renderer/publication, notes and deal wiring: [CRM Web #68](https://github.com/flexi-consulting/crm-web/issues/68), [#69](https://github.com/flexi-consulting/crm-web/issues/69), [#70](https://github.com/flexi-consulting/crm-web/issues/70), [#71](https://github.com/flexi-consulting/crm-web/issues/71).
- Capability/provider binding: [MCP Host #31](https://github.com/trained-assist/trained-assist-mcp-host/issues/31); durable orchestration: [Control Plane #275](https://github.com/trained-assist/trained-assist-control-plane/issues/275).
- End-to-end and canary evidence: [architecture #261](https://github.com/trained-assist/trained-agent-architecture/issues/261), [#262](https://github.com/trained-assist/trained-agent-architecture/issues/262).
