# Architecture Acceptance Protocol

Этот документ фиксирует короткий общий protocol приёмки. Для behavior-changing изменений в architecture repo его применяет [Architecture Change Management & Acceptance](SCENARIO-CHANGE-MANAGEMENT.md). Это не план, task tracker или копия чеклистов implementation repos.

## Change-management acceptance

Для scenario change должны быть связаны:

1. Изменённый scenario и affected observable steps.
2. Implementation issues, PRs и проверенные revisions owning repositories.
3. `PASS` Gate 1 semantic Scenario ↔ Implementation review; `FAIL` и `UNCLEAR` блокируют.
4. Результаты подходящих component probes из Environment Contracts затронутых репозиториев.
5. Сформированный из сценария E2E plan и реальный run на заявленном target environment. Staging и production smoke — разные targets; локальный результат не выдаётся за staging.
6. Evidence с target, revisions, sanitized input, assertions, observable output, релевантными logs/state и оставшимися ограничениями.

Все применимые gates должны иметь результат `PASS`. `FAIL` требует исправления и повторного запуска. `UNCLEAR` требует большей прозрачности scenario/code/evidence или устраняемого Sandbox Gap; он не считается исключением. Gate пропускается только с объяснением неприменимости и ссылкой на подходящее evidence.

Обычный bugfix, возвращающий уже описанное поведение, не требует scenario-change PR; достаточно issue, implementation PR и штатных проверок owning repository. Если меняется expected behavior или публичный контракт, применяется весь Architecture Acceptance Pipeline.

## Общие safeguards и evidence

- Проверки выполняются на target из Environment Contract; среду, похожую на staging, нельзя называть staging без фактической привязки и прогона.
- В dev/test/staging допустимы и полезны deploy, реалистичный тестовый input, controlled failure, диагностика и повтор сценария в пределах объявленных sandbox-разрешений.
- Production — отдельная trust boundary. Ни этот protocol, ни sandbox permissions не разрешают прямые production изменения. Deployment и post-deploy smoke идут только по проверенному promotion path owning repository; smoke ограничен безопасными действиями и данными.
- Секреты, персональные данные и production payloads не помещаются в test evidence. Записываются sanitized input, revision, команды/requests, output, scoped logs/state и ссылки на CI/E2E run.
- Если нужного test path нет, это Sandbox Gap: небольшой gap устраняется вместе с работой; существенный получает issue owning repository и ссылку из architecture change. Отсутствующий E2E не заменяется заявлением о покрытии.
- Положительный ответ сам по себе недостаточен: проверяется внешний observable outcome и применимые failure/authorization/recovery paths.

## Источники требований

Точные компонентные инварианты остаются в своих канонических контрактах и architecture-разделах, чтобы не создавать вторую копию с отдельным статусом:

- [Architecture invariants](ARCHITECTURE.md#12-блоки-и-инварианты).
- [Observability and Error Contract](OBSERVABILITY-AND-ERROR-CONTRACT.md), включая structured failures, scope, TTL и redaction.
- [External Integration Gate](EXTERNAL-INTEGRATION-GATE.md) — idempotency, unknown outcomes и principal binding.
- [User Task IDs and Reporting](USER-TASK-IDS-AND-REPORTING.md) — устойчивость идентификаторов и доставка.
- [Environment Contract template](contracts/ENVIRONMENT-CONTRACT-TEMPLATE.md) — реальные endpoints, test inputs, output/logs/state, reset, permissions и promotion path каждого runtime owner.
- [Sandbox](SANDBOX.md) и [Engineering Approach](ENGINEERING-APPROACH.md) — воспроизводимые прогоны и общий инженерный workflow.

Карточные чек-листы и статус принадлежат issues/Project и implementation repos. Исторические AC-ID и этапы прежнего Migration Project больше не являются общей параллельной acceptance-нумерацией; старые ссылки следует заменять ссылкой на актуальный owning contract и scenario evidence при естественном обновлении документов.
