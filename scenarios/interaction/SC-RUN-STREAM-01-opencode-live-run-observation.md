# Live OpenCode run observation in every client

- **Scenario ID:** RUN-STREAM-01
- **Status:** target; implementation and deployed end-to-end acceptance pending
- **Architecture task:** [#278](https://github.com/trained-assist/trained-agent-architecture/issues/278)
- **Runner API implementation:** [ai-agent-runner #381](https://github.com/trained-assist/ai-agent-runner/issues/381)
- **Executor output:** [ai-agent-runner #138](https://github.com/trained-assist/ai-agent-runner/issues/138)
- **Actors:** primary Trained Assist agent, local OpenCode agent via MCP, Web UI, Control Plane, Serverless Runner API, execution worker running OpenCode
- **Boundary:** each client starts/observes/cancels a run through the authenticated Runner API. Only Runner API talks to physical execution workers. All clients observe the same run identity, lifecycle facts, output and terminal result.
- **Related contracts:** [Serverless Agent API](../../SERVERLESS-AGENT-API.md), [Architecture §4.6](../../ARCHITECTURE.md), Runner [Cloudflare API](https://github.com/trained-assist/ai-agent-runner/blob/main/docs/CLOUDFLARE-RUNNER-API.md)

## Scenario

1. An authorized client submits a task with an idempotency key. Runner durably records admission and returns a stable `runId`; a repeated identical start returns the same run, while reuse with different task content reports conflict.
2. The client subscribes to that run's events and receives an initial state snapshot followed by ordered events. It can show queued, worker acceptance, OpenCode process start, available stdout/stderr or public assistant output, finalizing/export, and terminal outcome when these facts are available.
3. The UI shows elapsed time from server timestamps and a clear stale/reconnecting indicator. Worker heartbeat and actual work output remain distinct. The client never invents percentage progress or claims that a heartbeat proves OpenCode is doing useful work.
4. If the network/client restarts, it reconnects with the last event cursor and resumes the same `runId`. Duplicate delivery is deduplicated by stable event ID/sequence. If the cursor has expired, Runner explicitly returns a current snapshot and indicates that earlier events are no longer replayable.
5. A calling AI agent waits on the same `runId`. On terminal completion it receives the structured result, final answer and artifact/history references in its existing session. A local wait timeout or cancellation disconnects only that waiter; the remote run continues.
6. Explicit run cancellation is separate. The caller receives accepted/pending state and later a truthful stopped or unknown outcome. A lost start response, worker restart or late callback is reconciled against the original idempotency key/run and never starts an invisible duplicate.
7. The same sequence works for the primary agent, OpenCode/MCP and Web, while the existing CP/Telegram run path keeps its accepted submit/status/result/cancel semantics.

## Failure and privacy behavior

- Unauthorized callers cannot observe, cancel, or subscribe to another profile's run.
- SSE disconnect, slow reader, proxy timeout, or client restart does not cancel execution or consume unbounded memory. Reconnect replays from the last acknowledged sequence or declares a retention gap.
- Worker disconnect is shown as unknown/stale with last observed timestamps until reconciliation establishes a terminal outcome. It is never silently reported as success or retried as a second execution.
- Event payloads contain only approved public output and lifecycle metadata. Hidden model reasoning, credentials, private OpenCode checkpoints, and unredacted diagnostics are excluded.
- Final execution outcome and artifact/export outcome are separate. Missing/unavailable files are reported; the final answer and history do not disappear silently after worker replacement.
- Clients that cannot use SSE can use bounded JSON polling with the same cursor and state semantics.

## Acceptance evidence

- Component probes cover event schema, sequence, cursor pagination, `hasMore`, explicit retention reset, SSE framing/reconnect, slow/aborted readers, terminal close, and old JSON-client compatibility.
- Two concurrent real OpenCode runs prove isolated, timely output and independent cancellation. Restart/reconcile and late-output-tail scenarios prove the final stream and result agree.
- MCP start → wait returns the terminal answer/history into the initiating agent session; timeout of wait can be resumed with the same `runId`.
- Web observes the same state/output with elapsed timer and reconnect state; it does not poll once per second when streaming is active.
- Existing CP/Telegram canary and the new real-run E2E pass on recorded API/worker/client revisions. Local fake execution and `/healthz` alone are not E2E evidence.

## Current gap

The Cloudflare coordinator polls the worker's cursor-based log snapshot and exposes a bounded output snapshot in status. Its `/events` route currently serves JSON pages rather than a live SSE stream and does not append each newly observed OpenCode output chunk to the replayable Cloudflare event journal. Runner #138 covers executor/gateway incremental output; #381 covers the Cloudflare API relay, durable replay and client-facing SSE. These boundaries must be verified together, without implementing a second output pipeline.
