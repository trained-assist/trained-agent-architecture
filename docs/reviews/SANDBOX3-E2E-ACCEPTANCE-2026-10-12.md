# Sandbox3 E2E acceptance — 2026-10-12

This is the current evidence record for the isolated `tg-sandbox3` lane. It
supersedes older handoff statements that the scenario had not yet been run.
It does not claim a real Telegram webhook ingress or a Telegram Bot API file
download: the harness invokes the deployed gateway through its authenticated
operator test-update endpoint and substitutes controlled `getFile` bytes for
the file fixture. Outbound Telegram replies were sent to the pinned sandbox
chat and confirmed by Telegram provider message IDs.

## Deployed identities and bootstrap

- CP Worker: `trained-assist-cp-sandbox3`, deployed SHA
  `1a68ab55a2eef1d527837326de3e0ec536d7fb6f`.
- Telegram Worker source SHA: `77292fd7f958db6401334eadb62f50a978089a18`.
- The authenticated read-only preflight [run 38183877096](https://github.com/trained-assist/trained-assist-control-plane/actions/runs/38183877096)
  verified the exact Cloudflare account, live CP SHA, Cloudflare Runner API
  route, `sandbox3-agent-api-principal`, and delegated profile
  `integration-sandbox3-v1`. It created no CP task, Worker run, or model call.
- The CP lane preflight in each E2E artifact reported the Runner API service
  binding and no direct physical executor binding. Each scenario started from
  empty CP and Telegram Intake state and ended with `cpEmpty=true` and
  `tgEmpty=true`; the normal sandbox delivery policy was restored.

## User-shaped scenarios

| Scenario | Evidence | Result |
|---|---|---|
| Conversation history | [run 38184012532](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38184012532) | Two distinct tasks and successful Runner executions; the follow-up recalled the prior turn; both answers were delivered once and had Telegram provider receipts. Cleanup left CP and Intake empty. |
| Duplicate update during execution | [run 38184339598](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38184339598) | The same update was replayed while the Runner was active; the lane retained one task and one execution and sent one answer. Cleanup left CP and Intake empty. |
| File intake and answer | [run 38184624993](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38184624993) | The file fixture traversed Worker media intake → Ingress Buffer → CP input/manifest persistence → Runner. Manifest/hash assertions passed, the Telegram file ID was not persisted, the answer matched `LANTERN`, and one Telegram reply was confirmed. Cleanup left CP and Intake empty. The test mocked Telegram `getFile` bytes. |
| Playwright artifact task and delivery | [capture run 38228110321](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38228110321), [Telegram delivery run 38228860714](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38228860714) | Both completed one successful Runner execution, matched the requested Example Domain title/marker, and persisted manifests for `browser-check.md` and `browser-proof.png`. The delivery run sent each artifact once to the pinned sandbox chat and recorded a provider message ID. The capture run had `communicationOutcome=selected`; the delivery run had `communicationProviderCode=timeout`, fell back to Agent execution, and still completed successfully. Neither run downloaded and inspected the artifact bytes, so screenshot validity is not proven. |
| Playwright task and artifact manifests | [run 38228110321](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38228110321) | The sandbox profile completed one Runner execution for the requested headless Playwright task, returned the expected Example Domain title/marker, and persisted manifests for `browser-check.md` and `browser-proof.png`. The run used capture delivery. The harness did not download either artifact's bytes, so this does not yet prove the screenshot contents or user delivery of the files. |

The earlier capture-only file run [38183263775](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/38183263775)
also passed the artifact persistence and duplicate-update assertions without
Telegram sends. The real-delivery rerun above closes the user-visible reply
part of that scenario.

## Candidate and placement boundary

Signed Runner candidate [workflow 37865618383](https://github.com/trained-assist/ai-agent-runner/actions/runs/37865618383)
is valid and retained, but its manifest targets `agent-runner-api-sandbox`, the
legacy Node API service. The matching VM deployment workflow is explicitly
disabled (`if: false`) and marked retired because the supported Agent Run API
is the Cloudflare Worker. Do not install that candidate into a VM or use it as
the candidate for `trained-assist-runner-api-sandbox3`. The live E2E used the
Cloudflare Runner API route. Its authenticated health/profile contract and
successful correlated executions are proven; physical France worker identity
for each run and France/GHA failover behavior remain separate placement gates.

## Remaining acceptance

- Test a message arriving through the real sandbox Telegram webhook and
  correlate Telegram update → Intake → CP task → Runner receipt → delivered
  answer. Current worker-driven tests deliberately avoid this slower ingress
  boundary.
- Test one real Telegram file upload through Bot API `getFile`; current file
  tests mock only that external byte-fetch operation.
- Prove physical France worker identity and typed pre-admission GHA fallback
  behavior with the Runner-owned placement probe. Do not infer those facts from
  `cloudflare-workflows` in the CP execution record or from API liveness alone.
- Download and inspect Playwright artifact bytes in the sandbox before cleanup;
  current runs prove manifest persistence and (for 38228860714) Telegram
  document delivery, but not screenshot contents.
- Run the shared-document/Drive user scenario.

No production Telegram route, production data store, VM service, shared
principal registry, or Runner bindings were changed for these tests.
