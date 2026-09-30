# Пользовательские сценарии — снапшот старых репозиториев

> **Канонические истории теперь в [stories/](../stories/README.md)** — ценность и шаги, без привязки к реализации, со связью с этапами плана. Этот каталог — неизменяемый снапшот старых сценариев (реализация, инциденты, статусы); что куда вошло — [TRACEABILITY](../stories/TRACEABILITY.md). Новые истории сюда не пишутся.

Импорт 30.09.2026: **39 файлов из шести репозиториев**, включая README/GOALS, user stories, контекст/requirements/proposals сценариев и две приёмочные спецификации Web. Содержимое источников сохранено без изменений. Это полный импорт найденных docs/user-scenarios и docs/user-stories в перечисленных источниках плюс Web acceptance/reconnect docs; не утверждение, что вся документация всех репозиториев исчерпана.

## Как читать

Сценарий описывает наблюдаемое поведение продукта и может связывать несколько репозиториев. Каталог sources отражает происхождение, а не целевое владение функциональностью. Следующие согласованные cross-repository сценарии рекомендуется писать по области продукта в scenarios/<domain>/ с явными channels, services и contracts. Сначала сверяем и объединяем дубли; механически назначать core владельцем всех сценариев нельзя.

Скопированные статусы «работает», «план», «не создано» относятся к исходному документу и его ревизии. Относительные ссылки разрешаются в контексте исходного репозитория; код и весь supporting docs tree не копируются. Для недостающего относительного target открывайте ссылку на источник. Это особенно важно для TG TARGET-STATE и других исторических планов: импорт не утверждает их как архитектурное решение.

**Копирование не мигрирует runtime readers.** Исходные файлы остаются на месте. Например, agent GOALS.md описывает reader issue-fixer; перевод reader на versioned документ этого репозитория — отдельная задача с compatibility/rollout, иначе можно сломать автоматический gate. Пока это централизованный снимок для сверки, а не две автоматически синхронизируемые версии спецификации.

[Контракты](../contracts/README.md) · [Целевая архитектура](../ARCHITECTURE.md) · [Execution runtime](../runtime/EXECUTION-RUNTIME.md) · [Manifest импорта](IMPORT-MANIFEST.json)

## Новые общие сценарии (не копии)

Новые истории пишутся в [stories/](../stories/README.md). Детальные сценарии поведения, которые не помещаются в историю (как RC ниже), остаются здесь и ссылаются на ID истории.

- [interaction/run-conflict-explicit-choice.md](interaction/run-conflict-explicit-choice.md) — RC-01…RC-08: явный выбор при новой задаче во время работающего рана (TG/Web/API), решения владельца 30.09.2026; закрывает/уточняет US-QUEUE-01, US-MISC-01, US-BUF-02, CH-01, SS-06/07.

## Каталог

Связи с Cxx ниже — предварительная классификация для навигации, не результат детального ревью каждого сценария.

| Источник | Скопированный файл | Контракты для сверки |
|---|---|---|
| trained-assist-agent | [docs/user-scenarios/GOALS.md](sources/trained-assist-agent/docs/user-scenarios/GOALS.md) | C01, C02, C03 |
| trained-assist-agent | [docs/user-scenarios/README.md](sources/trained-assist-agent/docs/user-scenarios/README.md) | C01, C02, C03 |
| trained-assist-agent | [docs/user-scenarios/core/01-channel-concurrency.md](sources/trained-assist-agent/docs/user-scenarios/core/01-channel-concurrency.md) | C01, C02, C03 |
| trained-assist-agent | [docs/user-scenarios/core/02-background-run-visibility.md](sources/trained-assist-agent/docs/user-scenarios/core/02-background-run-visibility.md) | C01, C02, C03 |
| trained-assist-agent | [docs/user-scenarios/core/02-stop-and-supplement.md](sources/trained-assist-agent/docs/user-scenarios/core/02-stop-and-supplement.md) | C03, C04 |
| trained-assist-agent | [docs/user-scenarios/core/03-web-session-log-views.md](sources/trained-assist-agent/docs/user-scenarios/core/03-web-session-log-views.md) | C02, C08 |
| trained-assist-agent | [docs/user-scenarios/core/04-durable-plan-artifacts.md](sources/trained-assist-agent/docs/user-scenarios/core/04-durable-plan-artifacts.md) | C02, C04, C05, C09 |
| trained-assist-agent | [docs/user-scenarios/core/04-durable-wait-latency.md](sources/trained-assist-agent/docs/user-scenarios/core/04-durable-wait-latency.md) | C02, C04, C05, C09 |
| trained-assist-agent | [docs/user-scenarios/core/05-web-session-durability.md](sources/trained-assist-agent/docs/user-scenarios/core/05-web-session-durability.md) | C01, C02, C03 |
| trained-assist-agent | [docs/user-scenarios/core/06-tool-platform-keys.md](sources/trained-assist-agent/docs/user-scenarios/core/06-tool-platform-keys.md) | C06, C07 |
| trained-assist-agent | [docs/user-scenarios/engineering/01-development-playbook.md](sources/trained-assist-agent/docs/user-scenarios/engineering/01-development-playbook.md) | C04, C05, C06, C09 |
| trained-assist-agent | [docs/user-scenarios/engineering/02-custom-playbook-authoring.md](sources/trained-assist-agent/docs/user-scenarios/engineering/02-custom-playbook-authoring.md) | C04, C05, C06, C09 |
| trained-assist-agent | [docs/user-scenarios/engineering/03-credential-reachability.md](sources/trained-assist-agent/docs/user-scenarios/engineering/03-credential-reachability.md) | C04, C05, C06, C09 |
| trained-assist-agent | [docs/user-scenarios/engineering/03-playbook-guide-mode.md](sources/trained-assist-agent/docs/user-scenarios/engineering/03-playbook-guide-mode.md) | C04, C05, C06, C09 |
| trained-assist-agent | [docs/user-scenarios/exhibition/01-exhibition-catalog-to-sales-site.md](sources/trained-assist-agent/docs/user-scenarios/exhibition/01-exhibition-catalog-to-sales-site.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/freelance/01-freelance-project-spec.md](sources/trained-assist-agent/docs/user-scenarios/freelance/01-freelance-project-spec.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/recruiter/01-full-end-to-end.md](sources/trained-assist-agent/docs/user-scenarios/recruiter/01-full-end-to-end.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/recruiter/02-ats-setup-and-scoring.md](sources/trained-assist-agent/docs/user-scenarios/recruiter/02-ats-setup-and-scoring.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/recruiter/03-response-regen.md](sources/trained-assist-agent/docs/user-scenarios/recruiter/03-response-regen.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/recruiter/04-cold-search.md](sources/trained-assist-agent/docs/user-scenarios/recruiter/04-cold-search.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/recruiter/05-vacancy-switch.md](sources/trained-assist-agent/docs/user-scenarios/recruiter/05-vacancy-switch.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/recruiter/06-hh-reconnect.md](sources/trained-assist-agent/docs/user-scenarios/recruiter/06-hh-reconnect.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/speech/01-speech-transcribe.md](sources/trained-assist-agent/docs/user-scenarios/speech/01-speech-transcribe.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/speech/02-requirements-flags.md](sources/trained-assist-agent/docs/user-scenarios/speech/02-requirements-flags.md) | C01, C02, C05, C06, C07 |
| trained-assist-agent | [docs/user-scenarios/speech/03-proposal-design.md](sources/trained-assist-agent/docs/user-scenarios/speech/03-proposal-design.md) | C01, C02, C05, C06, C07 |
| trained-assist-tg-bot | [docs/user-stories/CURRENT-STATE.md](sources/trained-assist-tg-bot/docs/user-stories/CURRENT-STATE.md) | C01, C02, C03 |
| trained-assist-tg-bot | [docs/user-stories/KNOWN-BUGS-2026-09-22.md](sources/trained-assist-tg-bot/docs/user-stories/KNOWN-BUGS-2026-09-22.md) | C01, C02, C03 |
| trained-assist-tg-bot | [docs/user-stories/README.md](sources/trained-assist-tg-bot/docs/user-stories/README.md) | C01, C02, C03 |
| trained-assist-llm-ladder | [docs/user-scenarios/ladder/sticky-rung-per-conversation.md](sources/trained-assist-llm-ladder/docs/user-scenarios/ladder/sticky-rung-per-conversation.md) | C08 |
| software-engineering-playbooks | [docs/user-scenarios/ci/cloud-test-run.md](sources/software-engineering-playbooks/docs/user-scenarios/ci/cloud-test-run.md) | C04, C05, C06, C09 |
| software-engineering-playbooks | [docs/user-scenarios/playbooks/skill-tool.context.md](sources/software-engineering-playbooks/docs/user-scenarios/playbooks/skill-tool.context.md) | C04, C05, C06, C09 |
| software-engineering-playbooks | [docs/user-scenarios/playbooks/skill-tool.md](sources/software-engineering-playbooks/docs/user-scenarios/playbooks/skill-tool.md) | C04, C05, C06, C09 |
| software-engineering-playbooks | [docs/user-scenarios/playbooks/skill-tool.proposal.md](sources/software-engineering-playbooks/docs/user-scenarios/playbooks/skill-tool.proposal.md) | C04, C05, C06, C09 |
| software-engineering-playbooks | [docs/user-scenarios/playbooks/skill-tool.requirements.md](sources/software-engineering-playbooks/docs/user-scenarios/playbooks/skill-tool.requirements.md) | C04, C05, C06, C09 |
| trained-assist-hh-skill | [docs/user-scenarios/README.md](sources/trained-assist-hh-skill/docs/user-scenarios/README.md) | C01, C02, C05, C06, C07 |
| trained-assist-hh-skill | [docs/user-scenarios/recruiting/01-cold-search-to-review-page.md](sources/trained-assist-hh-skill/docs/user-scenarios/recruiting/01-cold-search-to-review-page.md) | C01, C02, C05, C06, C07 |
| trained-assist-hh-skill | [docs/user-scenarios/recruiting/02-ats-config-to-scored-responses.md](sources/trained-assist-hh-skill/docs/user-scenarios/recruiting/02-ats-config-to-scored-responses.md) | C01, C02, C05, C06, C07 |
| trained-assist-web | [docs/ACCEPTANCE-TESTS.md](sources/trained-assist-web/docs/ACCEPTANCE-TESTS.md) | C01, C02, C03 |
| trained-assist-web | [test/ui-reconnect-integrity.md](sources/trained-assist-web/test/ui-reconnect-integrity.md) | C01, C02, C03 |

## Минимальный формат нового общего сценария

- Scenario ID, цель пользователя, контекст и prerequisites.
- Каналы: TG/Web/API/другие; ожидаемое поведение отдельно там, где оно различается.
- Services/repositories и contract IDs; владельцы конкретных данных и этапов.
- Trigger → наблюдаемые шаги → ожидаемый результат/evidence.
- Failure paths: lost ACK, restart, budget/auth/quota, partial export, stop, duplicates — применимые к сценарию.
- Validation: provider/consumer contract tests и сквозной replay; ссылки на реализацию и проверенную ревизию.
- Статус: target/current; доказательство реализации датировано. Исполнение эпика ведётся в tracker, не через конкурентное изменение статуса одного файла.

## Дальнейший переход

1. Сверить дубли core/TG/HH и выбрать единые сценарии поведения.
2. Разделить факты текущего поведения, согласованную цель и proposals.
3. Назначить owners сервисов/контрактов и versioned consumption из других репозиториев.
4. Только после этого убрать дубли или оставить локальные ссылки и implementation-specific тесты.
