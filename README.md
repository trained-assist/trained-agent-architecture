# Trained Agent Architecture

Общая архитектура Trained Assist и сквозные спецификации продукта. Фокус — явные границы сервисов и уменьшение связанности core.

## Разделы

- [Linearization Step — текущая итерация brainstorm](LINEARIZATION-STEP.md) — Input → Router → три типа executor → Output → Report to User → Gateway → пользователь; одна обратная связь для follow-up.

- [Brainstorm: core и границы репозиториев](BRAINSTORM-CORE-AND-REPOSITORIES.md) — предыдущая итерация: Conversation Service, controller и распределение state. Текущий фокус центрального потока перенесён в Linearization Step; варианты не утверждены.

- [Терминология и OpenLineage](TERMINOLOGY.md) — Job, Run, Dataset, Facets и границы нашей инфраструктуры.

- [Целевая архитектура бэкенда](ARCHITECTURE.md) — блоки A01–A13, инварианты INV-01–INV-13, факты и открытые решения.
- [Пользовательские сценарии](scenarios/README.md) — общий индекс и 39 исходных файлов из шести репозиториев; происхождение закреплено в manifest.
- [Контракты](contracts/README.md) — девять предлагаемых границ ключевых сервисов, семантика сообщений, ownership, retries и failures.
- [Execution runtime](runtime/EXECUTION-RUNTIME.md) — терминология изолированного исполнения и предложение о выделении runner из core.

Статус: draft для согласования. Копирование сценариев не меняет runtime readers и не утверждает старые планы как новые решения. API в контрактах иллюстративен.

## Как привязывать работу

В эпиках указывать architecture_blocks (Axx), contracts (Cxx), invariants (INV-xx), scenario links, текущий пробел, целевой контракт и evidence приёмки. Архитектуру и межсервисные сценарии описывать здесь; код, локальные implementation docs и тесты — в репозитории соответствующего сервиса. Статусы выполнения — в issues/трекере.
