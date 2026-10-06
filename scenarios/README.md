# Межкомпонентные сценарии

[Stories](../stories/README.md) — канонические пользовательские требования. Здесь хранятся только дополнительные сценарии взаимодействия компонентов, которые не принадлежат одному implementation repo.

- [Явный выбор при конфликте запусков](interaction/run-conflict-explicit-choice.md).

Новые сценарии задают actor, trigger, scope/IDs, ожидаемый результат и отказ, без статусов реализации. Копии сценариев других репозиториев удалены: их исторический снимок и соответствие stories сохранены в [#161](https://github.com/trained-assist/trained-agent-architecture/issues/161) и [TRACEABILITY](../stories/TRACEABILITY.md). Текущий executable сценарий читается в его repo-владельце.

## Историческая фикстура

`scenarios/sources/trained-assist-tg-bot/docs/user-stories/CURRENT-STATE.md` — неизменяемый снимок для `eval/fast-replies/decisions/legacy-shadow-baseline.v1.jsonl`. Он описывает базовую линию сравнения, не текущую архитектуру или статус реализации. Новые сценарии и требования добавляются в `stories/` и `scenarios/interaction/`, а не в этот снимок.
