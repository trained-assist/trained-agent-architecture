# MCP / capabilities review — R1 evidence snapshot

Status: **partial static audit; not a complete runtime inventory or usage baseline** · 05.10.2026
Parent: [issue #146](https://github.com/trained-assist/trained-agent-architecture/issues/146)
Scope: first read-only pass over the legacy agent composition path and existing target contracts. No runtime, profile data, credentials, user conversations, or production configuration was changed.

## Evidence and revision pins

The issue's legacy source blobs were checked against `trained-assist/trained-assist-agent` current `main` at `5296257b5bbb6709bbf6fb97bb12ebae52e0ed6b` (2026-10-05). The cited blob IDs still match:

| Source | Blob | What this pass verified |
|---|---|---|
| `config/skill-catalog.json` | `6cebad64f70e1d7007fabd095a31b8af1f02f6cd` | Section/module/server map and declared `alwaysOnDomains` |
| `src/runner/index.js` | `b9aabc1cc70b2e8f0f319ef7916cd984496b8191` | Turn mount, task-context construction, and profile playbook-menu injection |
| `src/runner/system-prompt.js` | `a7505b0ede972d8886819eaa1d167cec6c8d064a` | Base/persona/project/domain/mode/runtime prompt layering |
| `src/skills/turn-intent.js` | `37cef17549e3dcbc432319382464bddf1f9e7931` | Deterministic intent estimate and escalation marker |
| `src/skills/enforce.js` | `023b2c253e69c949bd6023714e1bfe2ed5417779` | Runtime skill plan integration |
| `src/skills/resolve.js` | `4fd4483d4c9e0b441d7372ae76c66eb8fd99a1c2` | Section expansion and prompt-domain resolution |

The source tree is newer than the issues cited as historical evidence. In particular, the current catalog calls itself shadow-only: do not infer actual tool exposure from its section declarations. Tool mounting currently follows `skills.json` and the turn-intent/enforcement path. The catalog is useful as a declared inventory, not proof of runtime parity.

## Prompt composition trace (static)

The current runner builds two related payloads:

1. **Task text/context:** current time and timeout/finalization note; optional turn-mount note; user notes and project notes; previous error; requirements log; optional HH API error; development playbook suggestion; owned awaiting-user notice; a fixed knowledge-artifact/publication instruction block; session history; then the current user request. The final request is prefixed `Пользователь:` when history is present. There is a 1,000,000-character emergency cap which slices the assembled string; it is not a token budget or safe context policy.
2. **System prompt:** `agent-system-prompt.txt` plus profile persona, bound project's `PROFILE.md`, ready skill prompt domains, answer-router mode block, and (OpenCode only) a runtime capability addendum based on configured MCP server names and modality-related environment bindings. The shadow catalog comparison observes this path but does not alter it.
3. **Tools:** run MCP config is built from the resolved profile/turn skill plan. A deterministic turn-intent estimate may narrow sections. If no matching profile section is resolved, the path fails open to the full profile tool set; machine/GTD, wrap-up, and escalation retry paths also use the full set. This protects capability recall but can mount unrelated tools and schemas.

Static trace locations at the pinned source revision: `src/runner/index.js` around lines 2648–2731 and `src/runner/system-prompt.js` around lines 76–148. These are repository line references for the pinned checkout, not a guarantee that the path is exercised identically by every engine; final engine payload tracing remains outstanding.

## Findings

| ID | Evidence | Risk | Proposed disposition | Compatibility / validation |
|---|---|---|---|---|
| R1-F1 | Catalog declares `core.always` and includes platform, browser, connect, credentials, web operations, artifacts, Telegram send, publish/deploy, search, Hermes, durable tasks, playbooks, and content rewrite modules. It also declares `engineering-baseline` always-on. | A broad declared core and always-on domain can make unrelated instructions/tools persistent. The catalog is shadow-only, so runtime exposure must be traced independently before attributing actual cost. | Classify each leaf by stable capability, domain, provider, action, owner, exposure and readiness. Then compare declared vs observed lists; move only with consumer evidence. | Preserve legacy names through mapping. Measure schemas actually sent per engine and representative task, not just module count. |
| R1-F2 | `turn-intent` narrows with deterministic intent; unresolved/no-match cases fail open to the full profile set. Internal/machine, wrap-up and retry runs also mount full profile tools. | False negatives and fallback behavior can erase input savings. Escalation can repeat execution if its continuation boundary is not typed. | Keep full discovery independent from mounted run toolset; make unavailable/expansion outcomes explicit and resume from checkpoint without replaying completed mutations. | Negative cases: unrelated domains absent from selected payload; fallback reason observable; mutation-before-expansion is not repeated. |
| R1-F3 | Task context unconditionally includes a fixed artifact/publication instruction block, including a request to store “key” facts; it can also append notes, project notes, requirements log and history. | Repeated general rules and scoped records may inflate every task; the “key” wording risks teaching storage of secrets in knowledge artifacts. Presence of the code block does not establish the actual bytes/tokens sent in every run. | Split stable policy from scoped retrieval. Remove secret-storage advice from portable wording and route secrets only through credential broker refs/status. | Compare full task/system/tool payload, with source-block attribution and a regression case containing a secret-like value. |
| R1-F4 | `system-prompt.js` layers base + persona + project + ready-domain rules + answer mode; OpenCode receives an additional runtime block. Domain build errors are caught and execution continues. | Hidden engine defaults and error fallback may make observed provider input differ from the builder's files; a failed domain assembly can silently produce an incomplete prompt. | Record a manifest of block IDs, source refs, versions, bytes/tokens and assembly outcome; make fallback mode visible while preserving an explicitly versioned safe minimal policy. | Capture final outbound payload for each supported engine; test hidden system defaults/native resume duplication. |
| R1-F5 | `MAX_PROMPT_CHARS=1_000_000` slices the final task string. No pinned tokenizer/provider usage measurement is emitted at this boundary in the traced code. | Emergency process-size protection is not a context gate; slicing may remove middle constraints without a typed failure. chars/4 cannot establish token usage. | Add per-class absolute and relative budgets from measured baseline; overflow must expand/retrieve or return a visible typed limit outcome, never silently truncate substantive input. | Pinned tokenizer in CI plus provider usage where available; holdout eval for constraint recall before promotion. |
| R1-F6 | The source comments and issue #146 call for MCP discovery/tool schemas and actual engine payload inspection, but this pass inspected the repo source and catalog only. | Static configs cannot establish runtime `tools/list`, pagination, hidden/internal exposure, dynamic-list support, schema bytes, or actual call usage. | Continue R1 against live sandbox instances with no production mutation; inventory all servers/relays/modules and direct-call each eligible handler. | Capture initialize/list/call evidence and readiness at a pinned deployment/config snapshot; never log credential values. |

## Baseline status and missing evidence

The supplied issue reports one private `agent-input (5).txt` at 42,486 characters / 60,463 UTF-8 bytes / 352 lines. Those numbers describe the complete input sample (request + OCR/history/etc.), not system prompt, schemas, or tokens. The file is not present in this checkout and must not be copied into this public repository. Therefore this pass does **not** claim a reproduced sample measurement.

Still required before R1 can be called complete:

- A secure local measurement of the supplied sample, with only sanitized block-level counts published; include system instructions, task instructions, history/memory, compact catalog, actual schemas and total provider input separately.
- A sanitized, labeled corpus with separate external-user, owner/development and synthetic strata. The issue's declared external-user priority must be preserved; owner volume cannot dominate the aggregate.
- Runtime MCP inventory from all configured local/sibling/relay servers: pagination, aliases, hidden/internal methods, readiness, actual schema sizes and owner mapping.
- Usage counts by capability/user over an explicit date window; absence of telemetry is “unknown”, not “rare”.
- Final payload captures for each supported engine, including provider token usage when available, repeated turns, native resume and fallback/error paths.

Until that evidence exists, no percentage/token-savings claim, rarity claim, complete method count, or quality-improvement claim is supported.

## Existing target contracts to reuse

- [Task Router and MCP](TASK-ROUTER-AND-MCP.md): one handler behind adapters; full original input; bounded context; host owns policy and continuation.
- [Capability Catalog and Fast Replies](CAPABILITY-CATALOG-AND-FAST-REPLIES.md): complete compact discovery distinct from run toolset; explicit names and required-input/readiness semantics.
- [Interactive Execution and User Input](INTERACTIVE-EXECUTION-AND-USER-INPUT.md): typed host-owned interaction and durable continuation; no Agent Run just to render or submit a form.
- Parent issue #146's R1→R8 split remains authoritative for execution. This document records R1 evidence and gaps; it does not authorize building a second registry or wait system.
