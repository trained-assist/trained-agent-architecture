# Review #253: процесс разработки и integration gates

Review выполнено 12.10.2026 по [Epic #253](https://github.com/trained-assist/trained-agent-architecture/issues/253),
comments и pinned implementation revisions. Цель A→B→C и откладывание OAuth остаются разумными.
Основной риск — переходы по отчётам, которые не доказывают межрепозиторную совместимость,
и фактический controller, не исполняющий собственный restart contract.

## Findings

| Severity | Наблюдение | Следствие и требуемое изменение |
|---|---|---|
| P1 | Локальный controller.sh извлекает только `type=message.part.updated`, хотя CLI emits `type=text`. В failure path отсутствуют imports os и определение SESSION_ID; timestamp содержит literal shell substitution внутри Python. `set -euo pipefail` завершает script до extraction при ненулевом exit. Handoff всё ещё описывает Z00.a от 11.10. | Контекст теряется, loop повторяет работу с устаревшим состоянием. Versioned controller читает фактический JSONL, пишет atomically, сохраняет failure intent и запрещает автоматический retry до reconcile. |
| P1 | На shared D1 схема Ladder уже содержит service/status/expiry. Host [PR #27, SHA 6677071](https://github.com/trained-assist/trained-assist-mcp-host/pull/27/files) добавляет те же столбцы через ALTER. | Прямой migration probe поверх [Ladder 0009](https://github.com/trained-assist/trained-assist-llm-ladder/blob/5132e96527825ab6f127349b80a9ae46f210cb22/schema/migrations/0009_identity.sql) падает `duplicate column name: service`. Определить одного владельца identity schema и проверить upgrade отдельно от fresh install; Host-only fixture не закрывает этот gate. |
| P1 | `verifyKey` в Host проверяет `identity_users.service='mcp-host'`; Ladder schema default `ladder`. `issueApiKey` принимает service, но не сохраняет его. Нет key_id/services grants по Epic. | Один Ladder user/key не получает MCP доступ по текущему контракту. Перед I05.b нужна совместимость issuance→lookup на общей БД и key-level service grants; single-service user нельзя считать выполненным требованием B. |
| P1 | Host `makeTrace` возвращает keyHash; тест явно проверяет его присутствие, несмотря на требование Epic использовать key_id, без token/hash. `humanScope` создаёт fake runId и operationId=human-invocation. | Component PASS закрепляет нарушение invariants. Проверять отсутствие hash в tool results/logs и human lifecycle с operationId=user, без fake machine identity. |
| P1 | [Progress 6120090257](https://github.com/trained-assist/trained-agent-architecture/issues/253#issuecomment-6120090257) называет I04.b DONE по проверке session start, I02.a IN_REVIEW после merge и I05.a done при открытом prerequisite I04.a. Есть ещё progress с тем же marker. | Неправильная dependency readiness. Canonical progress закреплять ID, получать все страницы, сверять PR API и приёмку строки; merge и acceptance хранить отдельно. Следующий шаг — reconcile и contract probe, затем исправления identity, затем I05.b/I05.c. |
| P2 | Host тест «machine fixture worker catalog digest is unchanged» проверяет только exports; опубликованный live probe — initialize 200. | Нет доказательства сохранения digest или authenticated discovery/invocation. Требовать pinned digest assertions и положительные/отрицательные machine vectors на выбранном Worker. |
| P2 | Blocker «CF credentials» опубликован без подтверждения актуального credential reference. Scheduler повторяет сессии каждые пять минут без durable ownership/unknown-outcome gate. | Сначала сверять Keychain reference и permissions/target, а не объявлять отсутствие доступа. При WAITING делать read-only check; после crash не повторять start/deploy/key issuance вслепую. |

Host findings относятся к SHA 66770710412be572d6ec7d2f0185edef8837f9ea; review не утверждает,
что последующие commits их не исправили. На момент чтения GitHub API Host PR #27 и Ladder
PR #235/#238 merged, Ladder PR #237 open. Эти факты не означают accepted I05.a/I04.a.
Активный старый executor продолжал I05.b; его незавершённые изменения не редактировались.

## Воспроизведённое evidence

Локальный SQLite probe: выполнить canonical Ladder `0009_identity.sql`, затем SQL из Host
`0002_identity_canonical.sql` SHA 6677071. Результат — `duplicate column name: service`.
На этой же БД вставить synthetic active recruiter user с service=ladder и active key;
Host predicate service=mcp-host не выбирает пользователя. Использованы synthetic literals,
без настоящих credentials и без облачных mutations. Это component evidence, не D1 live acceptance.

CLI source `packages/opencode/src/cli/cmd/run.ts` в локальном opencode-forever содержит
`emit("text", { part })` для законченного assistant text. Текущие controller logs содержат
`type=text`/`tool_use`/`step_finish`; прежний parser ожидает другой envelope.

## Изменения процесса

Restart semantics восстановлены в [контроллере](../../tools/continuous-dev/README.md).
Он хранит одну JSON state machine, intent перед spawn, private evidence и атомарный handoff;
file lock исключает concurrent launcher в одном state-dir. Ошибка/неизвестный исход требует
reconcile, waiting state останавливает LLM loop, DONE шага не закрывает Epic. Новая версия
не активируется поверх работающего legacy executor.

В [prompt](../../tools/continuous-dev/system-prompt.md) добавлены gates совместимости общей
схемы/ключа, prerequisite acceptance, trace redaction, machine vectors, canonical progress ID
и проверка credential references. Изменения не выполняют runtime исправления Host/Ladder;
их acceptance остаётся в owning issues/PRs, связанными с #253/#256.

Semantic conformity: восстановление существующего restart contract Epic §7 и dependency
rules, без смены целевого MCP поведения. Component/E2E target — изолированный local launcher
с fake CLI, без provider расходов. Проверки controller не заменяют milestone A через Session
Manager + настоящий gateway. Cloud gates неприменимы к launcher-only bugfix.
