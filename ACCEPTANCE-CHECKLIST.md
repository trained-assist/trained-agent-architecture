# Приёмка: принципы, общий гейт и сквозные проверки

v0.2 · 01.10.2026. Это не план и не трекер. Порядок и зависимости работ — только в [плане реализации](IMPLEMENTATION-AND-INTEGRATION-PLAN.md).
Здесь — долговечные правила: какие доказательства принимаются, общий гейт Done любой карточки и сквозные проверки инвариантов и контрактов.
Чек-листы конкретных карточек, этапов, предусловий, первого среза и перехода когорты перенесены в issues и [Project «Trained Assist — Migration»](https://github.com/orgs/trained-assist/projects/1) — см. раздел 3.
При расхождении действует источник, указанный в пункте.

## 1. Назначение и как пользоваться

- Пункт: `AC-xx · что проверяется. Доказательство: ... Источник: ...`. ID сохраняются в issues; номера сгруппированы блоками, пропуски намеренны, ID не переиспользуются.
- Типы доказательств: `transcript` — sanitized transcript прогона; `logs` — выборка scoped logs с IDs;
  `test` — команда проверки и её вывод; `probe PR-xx` — прогон ловушки из [PROBES](stories/PROBES.md);
  `CI` — ссылка на зелёный run; `review` — записанный вердикт ревью; `decision` — ссылка на решение владельца или issue.
- Доказательство прикладывается в issue карточки. Пункт чек-листа отмечается только со ссылкой на доказательство.
- «Ответ агента успешный» сам по себе доказательством не является
  ([план, «Sandbox и требования к логам»](IMPLEMENTATION-AND-INTEGRATION-PLAN.md#sandbox-и-требования-к-логам)).
- Этап закрыт, когда его истории и ловушки прошли в песочнице ([stories/README](stories/README.md)) и пункты его эпика отмечены с доказательствами.

## 2. Общий гейт карточки (Done)

Применяется к каждой карточке R01–R03, Z01–Z03, P-DB, P01–P30 в дополнение к её специфической приёмке. В issue карточки гейт — один пункт чек-листа; доказательства по AC-01…AC-19 прикладываются ссылками в комментариях issue.

- AC-01 · Положительный путь пройден через внешний контракт, а не внутренний вызов.
  Доказательство: transcript. Источник: ENGINEERING-APPROACH, правило 2.
- AC-02 · Релевантный controlled failure воспроизведён и дал ожидаемый исход.
  Доказательство: transcript + logs. Источник: план, «Общая приёмка каждой карточки».
- AC-03 · Scoped logs читаемы; выполнена строка этапа из таблицы logs checks.
  Доказательство: logs. Источник: [SANDBOX, «Логи обязательны»](SANDBOX.md#логи-обязательны-для-каждой-итерации).
- AC-04 · Версии закреплены: source commit, config/binding refs, версии ПО.
  Доказательство: manifest в transcript. Источник: SANDBOX, «Состав сценария».
- AC-05 · Прогон воспроизводим одной процедурой setup → run → evidence → teardown. Не зависит от временного ssh-alias `vm`.
  Доказательство: test. Источник: SANDBOX; SANDBOX, «Credentials и bindings».
- AC-06 · Fidelity declaration: что эмулировано, что требует live smoke. Локальный PASS не назван облачной проверкой.
  Доказательство: абзац в issue. Источник: ENGINEERING-APPROACH; SANDBOX.
- AC-07 · Значений секретов нет в логах, trace, issue, commit, docs. Signed URL целиком не пишется.
  Доказательство: grep по transcript/logs. Источник: SANDBOX, «Credentials и bindings»; INV-12.
- AC-08 · Прод-токены и прод-профили не скопированы в sandbox.
  Доказательство: env-manifest sandbox. Источник: SANDBOX, «Credentials и bindings».
- AC-09 · У sandbox-сервиса своё имя endpoint, ключ и хранилище. Пересечение с production проверено явно, а не «по настройке».
  Доказательство: test/logs. Источник: SANDBOX, «Credentials и bindings».
- AC-10 · Ротация sandbox-ключа не требует смены прод-ключа.
  Доказательство: decision/описание binding. Источник: SANDBOX, «Credentials и bindings».
- AC-11 · Живой сервис не тронут: боевые bot/webhook/endpoints/базы без изменений.
  Доказательство: transcript. Источник: план, «Решение владельца».
- AC-12 · Лимиты: free-only профиль, paid fallback выключен, число live runs ограничено.
  Доказательство: config + logs. Источник: ENGINEERING-APPROACH, правило 4; P03.
- AC-13 · CI и staging зелёные на актуальной версии PR до merge. В repo есть завершающий job Repository context.
  Доказательство: CI. Источник: SANDBOX; эпик E0; ENGINEERING-APPROACH.
- AC-14 · Независимое перекрёстное ревью после каждого успешного sandbox-этапа.
  Ревьюер — модель другого семейства (Codex проверяет сделанное Claude). Вердикт записан в issue.
  Блокирующие замечания закрыты или превращены в карточки плана. После ревью обновлены следующие шаги в архитектуре/плане.
  Доказательство: review + ссылки на карточки. Источник: **Решение владельца 30.09.2026**.
- AC-15 · Issue ссылается на карточку, IDs историй, Axx, Cxx, INV-xx, сценарии.
  Доказательство: issue. Источник: README, «Как привязывать работу».
- AC-16 · «Готово, когда» затронутых историй проверено снаружи.
  Ловушка зелёная, только если выполнены и видимое пользователю, и сигнал.
  Доказательство: probe PR-xx. Источник: [PROBES](stories/PROBES.md).
- AC-17 · Затронутые API/recovery/cleanup/compatibility проверены по scope карточки.
  Доказательство: transcript. Источник: план, «Общая приёмка каждой карточки».
- AC-18 · Если карточка создаёт данные: TTL/cleanup проверен ускоренным clock. Активные checkpoint/outbox не стираются.
  Доказательство: test. Источник: OBSERVABILITY, TTL и чек-лист.
- AC-19 · Тест проверяет внешний контракт, а не сравнивает функцию с собой.
  Доказательство: review. Источник: SANDBOX, «Состав сценария».

## 3. Где теперь чек-листы

| Прежний раздел | Пункты | Новое место |
|---|---|---|
| §3 Предусловия (preflight) | AC-20…AC-33 | Issue карточки, которую пункт блокирует (например, AC-22 — P01, AC-28 — P-DB, AC-32 — P04), либо эпик этапа (AC-20/21 — E0, AC-29 — E3, AC-33 — E1). AC-34 (issue на каждую карточку) выполнен созданием Project |
| §4 По этапам: пункты одной карточки | AC-40…AC-175, AC-400…AC-404 | Issue карточки (R01–R03, Z01–Z03, P-DB, P01–P30) |
| §4 По этапам: истории, ловушки, logs этапа | те же блоки | Эпик этапа: R00 [#31](https://github.com/trained-assist/trained-agent-architecture/issues/31), E0 [#16](https://github.com/trained-assist/trained-agent-architecture/issues/16), E1 [#17](https://github.com/trained-assist/trained-agent-architecture/issues/17), E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18), E3 [#19](https://github.com/trained-assist/trained-agent-architecture/issues/19), E4 [#20](https://github.com/trained-assist/trained-agent-architecture/issues/20), E5 [#21](https://github.com/trained-assist/trained-agent-architecture/issues/21), E6 [#22](https://github.com/trained-assist/trained-agent-architecture/issues/22), E7 [#23](https://github.com/trained-assist/trained-agent-architecture/issues/23) |
| §4 P-DB, Task Store, контракт разговора | AC-85…AC-88 | P-DB [#32](https://github.com/trained-assist/trained-agent-architecture/issues/32) (AC-85/86), E2 [#18](https://github.com/trained-assist/trained-agent-architecture/issues/18) (AC-87/88) |
| §6 Приёмка первого среза | AC-300…AC-305 | E4 [#20](https://github.com/trained-assist/trained-agent-architecture/issues/20) |
| §7 Переход когорты и промоушен | AC-320…AC-329 | E7 [#23](https://github.com/trained-assist/trained-agent-architecture/issues/23) |
| §8 Открытые вопросы и пробелы | — | [#33](https://github.com/trained-assist/trained-agent-architecture/issues/33) |

## 4. По этапам

Перенесено в эпики и issues карточек (раздел 3). Logs checks этапов — [SANDBOX, «Этапы»](SANDBOX.md#этапы).

## 5. Сквозные инварианты и контракты

Проверяются на каждом этапе, где затронуты. Номер AC-2xx повторяет номер INV. Это правила, а не задачи: в issue карточки, которая затрагивает контракт, соответствующие AC-2xx внесены пунктами чек-листа (например, IDs/Reporting — P12, Model Gateway — P02/P17, Integration Gate — P25, Error Watcher — P27/P28).

- AC-201 · INV-01: профиль, сессия, задача, попытка, worker, clean room — разные IDs в logs.
- AC-202 · INV-02: поздний результат старого generation отвергнут. Проверка: fixture позднего события.
- AC-203 · INV-03: одна интерактивная работа на полосу; вторая только с `parallel` и в отдельной сессии.
- AC-204 · INV-04: параллельные запуски одного проекта не берут глобальный замок профиля.
- AC-205 · INV-05: выбор движка и fallback проходят политику размещения; Claude/Codex не в RU.
- AC-206 · INV-06: отказ границы изоляции не ведёт к запуску с более широкими правами.
- AC-207 · INV-07: мутация с неизвестным исходом не повторяется вслепую (PR-04).
- AC-208 · INV-08: стоп прекращает возобновление на всех уровнях, включая движок (PR-06).
- AC-209 · INV-09: результат сохранён до удаления clean room; доставка повторяется отдельно.
- AC-210 · INV-10: каждый расход привязан к задаче/попытке/шагу/источнику; unknown не равен 0.
- AC-211 · INV-11: бюджет учитывает технические повторы, продолжения GTD и проверки качества.
- AC-212 · INV-12: credentials по явным scopes; значений секретов в журнале нет.
- AC-213 · INV-13: артефакт — стабильный id, владелец, checksum; временный URL не идентичность.
- AC-214 · INV-14: результат задачи под GTD доставлен в GTD inbox с gtdId и receipt.
- AC-215 · INV-15: ожидание ответа видно в Web без живого Run.
- AC-216 · INV-16: GTD только явно, с конкретным следующим контролем, без самоконтроля.
- AC-217 · INV-17: модуль публикует structured errors и основные события со scope и TTL.
- AC-218 · INV-18: у принятой задачи есть проект, либо она ждёт выбора проекта.
- AC-219 · INV-19: доставка по audienceId/destinationId, записанным при приёме.
- AC-220 · INV-20: замена движка не теряет задачи, статусы и результаты (AC-86, AC-28).

Источник: [ARCHITECTURE §12](ARCHITECTURE.md#12-блоки-и-инварианты). Доказательство — logs/test этапа.

Observability — [правила контракта](OBSERVABILITY-AND-ERROR-CONTRACT.md#sandbox-driven-development-observable-acceptance), по каждому новому модулю:

- AC-230 · Источник зарегистрирован: error/lifecycle schemas и TTL.
- AC-231 · Ошибка user path содержит profile, известный replyContext, Task/Run IDs; failed и unknown различаются.
- AC-232 · Timeout, invalid output, auth missing дают readable structured event.
- AC-233 · Profile-scoped ошибка без профиля уходит в quarantine, профиль не угадывается.
- AC-234 · Outage telemetry не блокирует пользовательский путь; dropped-count виден.
- AC-235 · safeSummary без секретов/PII; raw details только по privateDetailsRef.

Model Gateway — [MODEL-GATEWAY-AND-COSTS](MODEL-GATEWAY-AND-COSTS.md):

- AC-240 · Каждый call/attempt несёт userTaskId, jobId/runId, stepId, source, providerCallId;
  gtdId только при контроле. Проверка: logs Ledger.
- AC-241 · Учтены retries, fallback, cache, streaming, validation calls; unknown usage/cost ≠ 0.
- AC-242 · Budget policy проверяется до платного вызова. Проверка: test с исчерпанным бюджетом.
- AC-243 · Автоэскалация заканчивается на OpenCode; Claude Code/Codex только явным выбором.
  Источник: DECISIONS 30.09; ARCHITECTURE 5.3.
- AC-244 · U-20: причина отказа по бюджету/моделям одинакова во всех каналах;
  дорогая модель не включается без разрешения (PR-25). Карточки нет — [#33](https://github.com/trained-assist/trained-agent-architecture/issues/33).

Integration Gate — [EXTERNAL-INTEGRATION-GATE](EXTERNAL-INTEGRATION-GATE.md):

- AC-250 · Webhook: verify → inbox + dedup → быстрый ACK (AC-150).
- AC-251 · Effect: operationId записан до вызова; timeout = unknown → reconcile до повтора (AC-151).
- AC-252 · Principal берётся из binding через Credential Broker, не от модели.
- AC-253 · Callback существующей операции не создаёт вторую задачу.

IDs и Reporting — [USER-TASK-IDS-AND-REPORTING §11](USER-TASK-IDS-AND-REPORTING.md#11-репозитории-и-следующий-шаг):

- AC-260 · Один userTaskId переживает сборку input, retry, diagnosis, escalation до доставки.
- AC-261 · Refresh Web показывает состояние без нового execution и без LLM.
- AC-262 · Ошибка Run остаётся в history, даже если Task продолжилась.
- AC-263 · Accepted Run без ответа виден и контролируется по deadline при пустых очередях.
- AC-264 · Late/duplicate events не меняют стадию неверно.
- AC-265 · Delivery failure не превращает success в повтор Run.
- AC-266 · Чужую задачу по известному ID прочитать нельзя.
- AC-267 · Следующий hourly запуск получает новый userTaskId.
- AC-268 · Отсутствие userTaskId у пользовательской работы — ошибка контракта, не новый ID.

Error Watcher — [SYSTEM-ERROR-WATCHER](SYSTEM-ERROR-WATCHER.md):

- AC-270 · Одна активная diagnostic Task на incident; новые события дополняют её.
- AC-271 · Автоэскалация диагностики только до OpenCode; лимиты попыток/budget из конфига.
- AC-272 · Suppression не удаляет исходные errors и не делает задачи успешными.
- AC-273 · Wildcard-mute всей платформы запрещён; permanent ignore имеет audit и revoke.
- AC-274 · Независимый deterministic health alarm сообщает о неработающем watcher.
- AC-275 · Fixtures раздела «Проверка» спецификации пройдены.

## 6. Приёмка первого среза

Перенесено в эпик E4 [#20](https://github.com/trained-assist/trained-agent-architecture/issues/20). Основание: [stories/README, «Приёмочный набор первого среза»](stories/README.md#приёмочный-набор-первого-среза).

## 7. Переход когорты и промоушен

Перенесено в эпик E7 [#23](https://github.com/trained-assist/trained-agent-architecture/issues/23). Основание: [ARCHITECTURE §10](ARCHITECTURE.md#10-переход-с-текущего-прода); план, «Путь интеграции с действующей системой».

## 8. Открытые вопросы и пробелы

Перенесено в [#33](https://github.com/trained-assist/trained-agent-architecture/issues/33).
