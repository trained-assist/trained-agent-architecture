# Зависимости реализации и интеграции Trained Assist

Документы содержат действующие требования, контракты и инструкции. Планы выполнения, статусы, ревью прошлых версий и evidence ведутся в GitHub issues/PR/Project. Целевая модель не является утверждением о текущем deployment; его готовность проверяется по конкретным SHA и приёмке.

Документ сохраняет ID карточек и обязательные зависимости, но не датированные критические пути, очереди мержа или счётчики выполненных тестов. Оператор выбирает следующий шаг по актуальному issue; ID I/P не задаёт обязательную линейную очередь.

## Путь интеграции

| Условие | Обязательство | Владельцы |
|---|---|---|
| Допуск и recovery | Durable receipt до dispatch, устойчивый operationId, fencing, неизвестный launch сверяется без дублирования | [CP](https://github.com/trained-assist/trained-assist-control-plane), [Runner #92](https://github.com/trained-assist/ai-agent-runner/issues/92) |
| Запуск через собственный API | Async admission → status/events/result/cancel; чистая среда и scoped credentials | [Runner #136](https://github.com/trained-assist/ai-agent-runner/issues/136) |
| Накопительное состояние профиля | Trusted binding, prepare base revision, run branch, единственный WorkspaceService CAS/conflict, committedRevision для следующего Run | [Runner #95](https://github.com/trained-assist/ai-agent-runner/issues/95), [persistence contract](AGENT-RUNNER-DATA-PERSISTENCE-IMPLEMENTATION.md) |
| Канал | Request/destination сохраняются, receipt отделена от terminal result, один delivery owner | [Integrator #140](https://github.com/trained-assist/trained-agent-architecture/issues/140) |
| Инструменты и ввод | Scoped capabilities работают без Agent Run; registered forms/choices продолжают конкретную задачу | [MCP #146](https://github.com/trained-assist/trained-agent-architecture/issues/146) |
| Перенос пользователей | Проверенный импорт, финальная дельта после остановки старых writers, readback следующего Run | [GCP exit #145](https://github.com/trained-assist/trained-agent-architecture/issues/145) |
| Cutover | Один admission owner, ограниченная когорта, rollback новых операций без повторного исполнения unknown mutations | [rollout contract](https://github.com/trained-assist/trained-assist-control-plane/blob/main/docs/ROLLOUT-COHORT-FLAG-OWNER-ROLLBACK.md) |

## Регион и ресурсы

Canary выполняется через API: Франция на OpenCode → отдельно РФ на OpenCode → отдельно GHA. Готовность CLI не доказывает готовность worker/API. При CPU или RAM >=60% новая нагрузка на VM не допускается и проходит установленную policy GHA; недоступность fallback не разрешает обход лимита. Claude/Codex в РФ запрещены, включая fallback. GCP VM не является fallback. Источник конкретной реализации/метрик — [#136](https://github.com/trained-assist/ai-agent-runner/issues/136).

## Совместная разработка

Общие deployments, endpoints, bindings и lifecycle имеют одного интеграционного владельца. Независимые модули разрабатываются в собственных ветках. Состояния engine/publication/cleanup не объединяются. Повтор публикации не запускает движок заново. При неизвестном исходе сначала reconcile.

Fast-path и interaction research расширяют контракт после corpus/eval: ограниченные tool calls не требуют полного агента, а end-to-end цель не запрещает обязательный user input. GTD остаётся opt-in. Требования к логам и TTL проверяются в каждой карточке по [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md).

## Scope границ репозиториев

Ownership задаёт [ARCHITECTURE §9](ARCHITECTURE.md#9-репозитории-и-ownership). Здесь не создаётся второй реестр владельцев. Runtime code, runnable probes и fixtures живут в implementation repo; shared contracts и пользовательские истории — в архитектурном. Статусы и чеклисты — в [Project](https://github.com/orgs/trained-assist/projects/1) и issue карточки.

## Карточки

Полное содержание карточки (работа, sandbox, acceptance, logs acceptance, чек-листы и evidence) — в её issue. Здесь только стабильная структура: ID, название, этап, зависимости и ссылка. Зависимости уровня карточки имеют приоритет над номером этапа.

| ID | Карточка | Stage | Depends on | Issue · эпик |
|---|---|---|---|---|
| R01 | Вопросы, coverage и отбор партии | R00 | Нет; inventory Z01 можно делать параллельно | [#34](https://github.com/trained-assist/trained-agent-architecture/issues/34) · R00 [#31](https://github.com/trained-assist/trained-agent-architecture/issues/31) |
| R02 | Воспроизводимые VM-пилоты по партиям | R00 | R01 по выбранной партии; доступ и bindings этой партии | [#35](https://github.com/trained-assist/trained-agent-architecture/issues/35) · R00 [#31](https://github.com/trained-assist/trained-agent-architecture/issues/31) |
| R03 | Решение и привязка к реализации | R00 | R02 по соответствующей партии; обоснованный screening rejection не требует установки | [#36](https://github.com/trained-assist/trained-agent-architecture/issues/36) · R00 [#31](https://github.com/trained-assist/trained-agent-architecture/issues/31) |
| Z01 | Inventory и общий development baseline | I00 | Нет | [#37](https://github.com/trained-assist/trained-agent-architecture/issues/37) · E0 [#16](https://github.com/trained-assist/trained-agent-architecture/issues/16) |
| Z02 | Bounded AutoFix workflow | I00 | Z01 | [#38](https://github.com/trained-assist/trained-agent-architecture/issues/38) · E0 [#16](https://github.com/trained-assist/trained-agent-architecture/issues/16) |
| Z03 | Repository context compression и logs baseline | I00 | Z01, Z02 | [#39](https://github.com/trained-assist/trained-agent-architecture/issues/39) · E0 [#16](https://github.com/trained-assist/trained-agent-architecture/issues/16) |
| P01 | Воспроизводимый sandbox Runner | I01 | Z03 | [#40](https://github.com/trained-assist/trained-agent-architecture/issues/40) · E1 [#17](https://github.com/trained-assist/trained-agent-architecture/issues/17) |
| P02 | OpenCode Run и structured logs | I01 | P01 | [#41](https://github.com/trained-assist/trained-agent-architecture/issues/41) · E1 [#17](https://github.com/trained-assist/trained-agent-architecture/issues/17) |
| P03 | Fault injection и error source registry | I01 | P02 | [#42](https://github.com/trained-assist/trained-agent-architecture/issues/42) · E1 [#17](https://github.com/trained-assist/trained-agent-architecture/issues/17) |
| P-DB | Оркестратор: выбор пары база + движок и cloud smoke (внешняя предпосылка) | I02A | — | [#32](https://github.com/trained-assist/trained-agent-architecture/issues/32) · E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18) |
| P04 | Admission и durable receipt | I02A | P03 | [#43](https://github.com/trained-assist/trained-agent-architecture/issues/43) · E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18) |
| P05 | Status и replayable streaming | I02A | P04 | [#44](https://github.com/trained-assist/trained-agent-architecture/issues/44) · E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18) |
| P06 | Recovery API-сессии | I02A | P05 | [#45](https://github.com/trained-assist/trained-agent-architecture/issues/45) · E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18) |
| P07 | Artifact manifest и export | I02B | P06 | [#46](https://github.com/trained-assist/trained-agent-architecture/issues/46) · E3 [#19](https://github.com/trained-assist/trained-agent-architecture/issues/19) |
| P08 | Direct upload/download и большие файлы | I02B | P07 | [#47](https://github.com/trained-assist/trained-agent-architecture/issues/47) · E3 [#19](https://github.com/trained-assist/trained-agent-architecture/issues/19) |
| P09 | Workspace snapshots и конфликты | I02B | P07, P08 | [#48](https://github.com/trained-assist/trained-agent-architecture/issues/48) · E3 [#19](https://github.com/trained-assist/trained-agent-architecture/issues/19) |
| P10 | Тонкий Web client и task view | I03 | P12 и базовый Run/status/recovery (P02/P05/P06). Artifact-сценарии дополнительно ждут P07–P09; первый текстовый диалог не ждёт файлов. | [#49](https://github.com/trained-assist/trained-agent-architecture/issues/49) · E4 [#20](https://github.com/trained-assist/trained-agent-architecture/issues/20) |
| P11 | Telegram-equivalent fixture и sandbox bot | I03 | P10 | [#50](https://github.com/trained-assist/trained-agent-architecture/issues/50) · E4 [#20](https://github.com/trained-assist/trained-agent-architecture/issues/20) |
| P12 | Primitive Input/Output и routing | I03 | P-DB + [схема Task Store](TASK-STORE-SCHEMA-V1.md) + conversation/project/audience contract ([CONVERSATIONAL-SESSION-CONTRACT](CONVERSATIONAL-SESSION-CONTRACT.md)); базовый Runner/status/recovery (P02/P05/P06). P10/P11 — потребители API, не prerequisite этой карточки. | [#51](https://github.com/trained-assist/trained-agent-architecture/issues/51) · E4 [#20](https://github.com/trained-assist/trained-agent-architecture/issues/20) |
| P13 | MCP lifecycle и scoped bindings | I04 | P12 | [#52](https://github.com/trained-assist/trained-agent-architecture/issues/52) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P14 | Доменные tools и playbook artifact retrieval | I04 | P13 | [#53](https://github.com/trained-assist/trained-agent-architecture/issues/53) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P15 | MCP integration sandbox | I04 | P14 | [#54](https://github.com/trained-assist/trained-agent-architecture/issues/54) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P16 | Route policy и high-precision rules | I05 | P15 | [#55](https://github.com/trained-assist/trained-agent-architecture/issues/55) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P17 | Bounded reply-or-route recipe | I05 | P16 | [#56](https://github.com/trained-assist/trained-agent-architecture/issues/56) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P18 | Corpus и baseline eval | I05 | P03, P12 | [#57](https://github.com/trained-assist/trained-agent-architecture/issues/57) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P19 | Четыре режима capability | I06 | P14, P17, P18 | [#58](https://github.com/trained-assist/trained-agent-architecture/issues/58) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P20 | Brief builder и retrieval | I06 | P19 | [#59](https://github.com/trained-assist/trained-agent-architecture/issues/59) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P21 | One-call vs two-call и required-input UX | I06 | P20 | [#60](https://github.com/trained-assist/trained-agent-architecture/issues/60) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P22 | Schedule без обязательного GTD | I07 | P-DB, Task Store/Workflow Port и минимальный typed dispatch/result из P12. P21 и полный fast path не обязательны; простой schedule pilot можно начать раньше. | [#61](https://github.com/trained-assist/trained-agent-architecture/issues/61) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P23 | GTD opt-in и bounded control | I07 | P22 | [#62](https://github.com/trained-assist/trained-agent-architecture/issues/62) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P24 | Реальные playbooks и адаптация плана | I07 | P23 | [#63](https://github.com/trained-assist/trained-agent-architecture/issues/63) · E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21) |
| P25 | Gate extraction и provider sandbox | I08 | P15 | [#64](https://github.com/trained-assist/trained-agent-architecture/issues/64) · E6 [#22](https://github.com/trained-assist/trained-agent-architecture/issues/22) |
| P26 | HH/домен pilot | I08 | P25, P22 | [#65](https://github.com/trained-assist/trained-agent-architecture/issues/65) · E6 [#22](https://github.com/trained-assist/trained-agent-architecture/issues/22) |
| P27 | Incident aggregation и suppression | I09 | P03, P18 | [#66](https://github.com/trained-assist/trained-agent-architecture/issues/66) · E6 [#22](https://github.com/trained-assist/trained-agent-architecture/issues/22) |
| P28 | Diagnosis LLM→OpenCode и report | I09 | P27, P21 | [#67](https://github.com/trained-assist/trained-agent-architecture/issues/67) · E6 [#22](https://github.com/trained-assist/trained-agent-architecture/issues/22) |
| P29 | Promotion и fleet acceptance | I10 | P24, P09 | [#68](https://github.com/trained-assist/trained-agent-architecture/issues/68) · E7 [#23](https://github.com/trained-assist/trained-agent-architecture/issues/23) |
| P30 | Multi-worker/region contract | I10 | P29 | [#69](https://github.com/trained-assist/trained-agent-architecture/issues/69) · E7 [#23](https://github.com/trained-assist/trained-agent-architecture/issues/23) |

Пробелы плана (истории без карточки, предпосылки, открытые пороги и решения) — [#33](https://github.com/trained-assist/trained-agent-architecture/issues/33). Мета-эпик автономной доставки — [#27](https://github.com/trained-assist/trained-agent-architecture/issues/27); credential-контур — [#30](https://github.com/trained-assist/trained-agent-architecture/issues/30).

Трактовка «сжатия» в I00: compact repository map + task-relevant context bundle/brief с refs; исходный код не удаляется. Название/продукт автофиксера не задан, используем configurable AutoFix contract.

## История

Прежние критические пути, инвентари и merge-последовательности доступны по pinned revision в [#161](https://github.com/trained-assist/trained-agent-architecture/issues/161). Их наличие не означает, что перечисленная работа всё ещё открыта.
