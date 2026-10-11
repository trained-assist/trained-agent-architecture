# System review: why `/stop` is hard, and how to make it smaller

Status: design review for [epic #246](https://github.com/trained-assist/trained-agent-architecture/issues/246), 11.10.2026. This is a review of current source and existing sandbox evidence, not permission to change a shared lane.

## The actual user contract

When a person presses `/stop`, the system must prevent a later automatic launch in the same conversation, avoid stopping work from another conversation, and never say “stopped” without evidence. The user may receive `stop pending` or `outcome unknown`; those are honest outcomes after a bounded request. A timeout cannot prove that a process did not continue elsewhere.

That contract is materially harder than sending a process signal. It crosses independent durable owners:

| Owner | State that can still cause work or an effect |
| --- | --- |
| Telegram gateway | collected input, debounce/launch intent, delivery outbox and recovery queue |
| Control Plane | task generation, workflow, accepted attempts, pinned stop window and native-stop evidence |
| Runner API | admission receipt, run identity and worker routing |
| VM worker | live process, process exit and result/persistence finalisation |

The gateway already documents the first important distinction: stopping a process alone did not work because buffered input could launch later. It therefore holds intake before requesting backend stop. The CP separately models `cancel_requested` and a confirmed terminal cancellation. The Runner cannot regard a lost cancel response as proof of an exit. These are necessary facts, not accidental complexity.

## Why the current path is difficult to operate

### 1. One action spans four state machines without one visible operation record

The current gateway makes a local intake hold, cancels local queues for legacy mode, calls the CP-target flow, and interprets the response. The CP snapshots targets, sends native cancellation to every relevant attempt, polls Runner status/result, and persists its confirmation. The Runner forwards cancellation to the VM, which must observe the process exit.

Each owner has a sensible local receipt, but the operator and E2E see a chain of HTTP calls instead of one durable `stopOperationId` with a timeline. A failure is consequently reported as a generic unconfirmed stop even where the exact owner, target and last successful step are known.

### 2. The system must freeze the target set while admission can race with stop

An input may be buffered, accepted by CP but have no Runner receipt yet, admitted by Runner but not be attached to CP, or already be executing. Looking up “the current task” after stop begins is unsafe: it can miss an old attempt or catch a new one. The current CP code handles this with an admission barrier, a pinned stop window, request IDs, task generations and idempotency keys. That is correct defensive work, but it is embedded in endpoint-specific code and therefore hard to see as one invariant.

### 3. Cancellation acknowledgement is weaker than exit evidence

The VM can accept `POST /cancel` and then continue while the process shuts down. A gateway/CP timeout can happen before or after the VM receives the signal. Retrying the delivery is generally safe only as an idempotent request for the same run and owner generation; declaring success requires a terminal status plus a matching result/exit evidence. The CP currently performs cancel → status → result synchronously and classifies many failures separately. This protects correctness but makes the user request depend on several network round trips.

### 4. There are multiple identities because each is needed for a different boundary

`chatId` and optional topic scope the user conversation. `profileId` controls the principal. `userTaskId`, `attemptId`, `runId`, `idempotencyKey`, receipt and owner generation distinguish lifecycle and execution. Removing these names wholesale would reintroduce cross-chat cancellation or cancellation of a replacement run. The problem is not the number of identifiers; it is that their translation is spread over the gateway, CP and Runner.

### 5. Historic recovery paths run beside the intended path

The gateway supports Intake, outbox, recovery store, retry queue and legacy KV compatibility paths. Each path was added to prevent a stopped item from resurrecting. Conditional ownership makes a failure analysis branch through feature flags and storage locations. The result is a real operational burden even when the current control-plane path does not use every legacy queue.

### 6. The synchronous E2E asks for a distributed transaction that the platform does not have

There is no atomic commit spanning Durable Objects, CP storage, Runner state and a VM process. A “stop succeeded” response can only be a projection of durable receipts from each owner. Trying to complete every step in the Telegram webhook request couples the test to transient network timing and obscures the durable recovery path.

## What should stay complex

Do not simplify away these invariants:

- intake is quiesced before a stop may be shown as confirmed;
- a stop snapshot is scoped to conversation, profile, task generation and admission window;
- a replacement run is never cancelled by an old stop request;
- `cancel requested`, `pending`, `unknown` and `confirmed stopped` remain distinct;
- Runner/VM exit evidence is retained and checked against the same run/generation;
- no automatic relaunch follows an unconfirmed stop.

These protect user intent and data safety. They should become explicit protocol facts rather than implicit restrictions distributed through callbacks.

## Target protocol

Make CP the sole owner of a durable **stop operation**, while the gateway remains owner of its local intake hold.

```mermaid
sequenceDiagram
  participant U as User / Telegram
  participant G as Gateway intake
  participant C as CP stop operation
  participant R as Runner API
  participant V as VM worker

  U->>G: stop conversation
  G->>G: persist hold and admission barrier
  G->>C: request stop(conversation scope, barrier receipt)
  C->>C: seal target snapshot; create stopOperationId
  C->>R: cancel exact runId/generation or idempotency key
  R->>V: idempotent cancel delivery
  V-->>R: terminal exit/result evidence
  R-->>C: matching receipt
  C->>C: persist confirmed or pending/unknown
  C-->>G: operation projection
  G-->>U: confirmed, pending, or unknown
```

The request may synchronously wait for a short budget, then returns `pending` with `stopOperationId`. CP continues reconciliation through an outbox/job and publishes the final projection through the normal delivery path. A retry of `/stop` reads the same operation instead of creating a new target snapshot.

The minimal operation record is:

`stopOperationId, conversationScope, profileId, admissionBarrierReceipt, snapshotId, target attempts {attemptId, runId?, ownerGeneration, idempotencyKey}, state, lastDiagnostic, evidenceRefs, createdAt, updatedAt`.

The state machine is intentionally small:

`requested → snapshot_sealed → cancel_dispatched → confirmed`

with `pending` and `unknown` as nonterminal reconciliation states. `no_admitted_work` is a confirmed terminal result. A new user launch creates a new admission window; it does not mutate an old operation.

## Refactoring order

1. **Expose the existing facts as one operation view.** Add a CP read model/API that joins the existing stop window, target snapshot and native-stop evidence under `stopOperationId`. Do not change the cancellation semantics yet.
2. **Make gateway calls idempotent.** Gateway persists and reuses one stop-operation key per conversation/admission window. Its only synchronous responsibilities are intake hold and request/read of the CP operation; queue cleanup is represented in the same operation evidence.
3. **Move polling out of the Telegram request.** CP performs cancel/status/result reconciliation asynchronously and writes each owner receipt. The webhook uses a bounded wait and then shows pending rather than converting a slow healthy cancellation into an apparent failure.
4. **Give Runner one cancellation receipt contract.** It accepts the exact run identity plus generation or an idempotency key before admission, and exposes `requested`, `pending`, `terminal`, `unknown`. Retain exit evidence; do not infer it from a transport acknowledgement.
5. **Retire duplicate recovery paths only after evidence.** Inventory which stop operation consumes outbox/recovery/retry/KV state for the selected lane. Migrate one path at a time and prove that a stopped input cannot relaunch after gateway or CP restart.
6. **Flatten implementation at stable boundaries.** Extract `sealSnapshot`, `dispatchCancellation`, `reconcileTarget`, and `projectStopOperation`; name the protocol values directly. Do not flatten the atomic checks inside each step merely to reduce indentation.

## Acceptance matrix

The first E2E should report the stop operation and evidence, rather than only the final Telegram text.

| Case | Required final observation |
| --- | --- |
| stop before admission | intake held; exact idempotency key marked cancelled-before-admission; no Runner run |
| stop after admission, before execution | same run/generation terminal; no engine side effect |
| stop during execution | VM exit evidence for that run/generation; CP task terminal only after it |
| lost cancel response | operation remains pending/unknown; reconciliation reaches evidence or stays honest; no second run |
| gateway/CP restart | same `stopOperationId`, snapshot and intake hold resume; no relaunch |
| new input after stop | belongs to a new admission window; old operation cannot cancel it |
| unrelated chat/profile | unchanged; no target is selected |

## Review conclusion

The task is hard because it correctly tries to preserve user intent across asynchronous, independently durable systems. The main avoidable complexity is not the protections themselves; it is the absence of one named stop operation and one authoritative, observable reconciliation loop. First consolidate the protocol around that record and its five states. Then remove duplicated gateway recovery branches only when the E2E matrix proves their responsibility has moved.

### Source basis

- Gateway intake hold and legacy queue cancellation: `trained-assist-tg-bot/src/lib/stop-chat.js`.
- Gateway CP target request and scope validation: `trained-assist-tg-bot/src/lib/agent-client.js`.
- CP target snapshot and external-stop confirmation: `trained-assist-control-plane/src/workflow-port/external-stop.ts` and `src/workflow-port/workflow-port.ts`.
- Runner cancellation delivery and VM cancel endpoint: `ai-agent-runner/src/adapters/external-worker-adapter.ts` and `src/vm-worker/http-server.ts`.
