# Review with real playbooks

Статус: **desk review / виртуальный прогон · 30.09.2026**. Проверяем модель [Playbooks vs GTD](PLAYBOOKS-VS-GETTING-THINGS-DONE-BOUNDARIES.md) на реальных committed artifacts. Никакие jobs, CI, deploy, CRM mutations или LLM calls не запускались. Это не runtime conformance test.

Термин владельца: **Awaiting user input**. Сквозной контроль: **gtdId**.

## Уточнение модели после review — 30.09.2026

Примеры U/G ниже описывают **зарегистрированные managed executions**, а не обязательность GTD для каждого artifact/cron. После решения владельца GTD opt-in: нужен concrete next-step/acceptance control. Один step с terminal result может пройти без G; справочный playbook также не включает контроль автоматически.

Позднейшая сверка domain code обнаружила HH generic cron action hh_proactive_search: hourly interval поддерживается, default 24h. Это уточняет границы этого artifact-only review; реальное enabled deployment не проверено. [Общая архитектура](ARCHITECTURE.md), [GTD boundaries](PLAYBOOKS-VS-GETTING-THINGS-DONE-BOUNDARIES.md).

## 1. Что прочитано

11 JSON-playbooks, **132 шага**, пять domain repositories. Engineering Markdown-guides обнаружены, но подробный прогон ниже основан на JSON execution artifacts. Новые ID в примерах условные, не реальные записи production.

| Playbook / pinned source | Репозиторий | Версия artifact | Шагов |
|---|---|---|---|
| [ci-run](https://github.com/trained-assist/software-engineering-playbooks/blob/bf9fd8845d9bea8938dc1b6e5f0f99a5e462243e/playbooks/ci-run.json) | software-engineering-playbooks | v1 | 1 |
| [ci-setup](https://github.com/trained-assist/software-engineering-playbooks/blob/bf9fd8845d9bea8938dc1b6e5f0f99a5e462243e/playbooks/ci-setup.json) | software-engineering-playbooks | v1 | 5 |
| [debugging](https://github.com/trained-assist/software-engineering-playbooks/blob/bf9fd8845d9bea8938dc1b6e5f0f99a5e462243e/playbooks/debugging.json) | software-engineering-playbooks | v1 | 13 |
| [feature](https://github.com/trained-assist/software-engineering-playbooks/blob/bf9fd8845d9bea8938dc1b6e5f0f99a5e462243e/playbooks/feature.json) | software-engineering-playbooks | v1 | 15 |
| [new-software](https://github.com/trained-assist/software-engineering-playbooks/blob/bf9fd8845d9bea8938dc1b6e5f0f99a5e462243e/playbooks/new-software.json) | software-engineering-playbooks | v1 | 16 |
| [skill-tool](https://github.com/trained-assist/software-engineering-playbooks/blob/bf9fd8845d9bea8938dc1b6e5f0f99a5e462243e/playbooks/skill-tool.json) | software-engineering-playbooks | v1 | 15 |
| [exhibition-catalog-to-sales-site](https://github.com/trained-assist/trained-assist-sales-skill/blob/b45aa6eecb1da612d1766dbae739e15b10a01de2/playbooks/exhibition-catalog-to-sales-site.json) | trained-assist-sales-skill | v1 | 34 |
| [freelance-project-spec](https://github.com/trained-assist/trained-assist-documents-skill/blob/fe4e88ec5c7a2332e2450e11961a9c6d49b55045/playbooks/freelance-project-spec.json) | trained-assist-documents-skill | v1 | 11 |
| [presentation-creation](https://github.com/trained-assist/trained-assist-documents-skill/blob/fe4e88ec5c7a2332e2450e11961a9c6d49b55045/playbooks/presentation-creation.json) | trained-assist-documents-skill | v3 | 11 |
| [recruiting-vacancy-launch](https://github.com/trained-assist/trained-assist-hh-skill/blob/0a45af2e1173e3d2172f0d025fdd3f7fc100c2f4/playbooks/recruiting-vacancy-launch.json) | trained-assist-hh-skill | v1 | 3 |
| [customer-development-collect](https://github.com/trained-assist/trained-assist-marketing-skill/blob/59ef5334b9d4edffa30b4f379dbdf734adc96e22/playbooks/customer-development-collect.json) | trained-assist-marketing-skill | v2 | 8 |

| Репозиторий | Проверенная revision |
|---|---|
| software-engineering-playbooks | `bf9fd8845d9bea8938dc1b6e5f0f99a5e462243e` |
| trained-assist-sales-skill | `b45aa6eecb1da612d1766dbae739e15b10a01de2` |
| trained-assist-documents-skill | `fe4e88ec5c7a2332e2450e11961a9c6d49b55045` |
| trained-assist-hh-skill | `0a45af2e1173e3d2172f0d025fdd3f7fc100c2f4` |
| trained-assist-marketing-skill | `59ef5334b9d4edffa30b4f379dbdf734adc96e22` |

Проверены definition, instructions, execution_kind, validation, waits/hooks и inputs/requires. Реализация всех domain handlers/validators и актуальные credentials/deployment здесь не проверялись. Классификация «может стать llm-recipe-job» — предложение, не описание существующего runtime.

## 2. Базовый прогон IDs

Для каждого активированного plan:

| Момент | Что создаём / сохраняем |
|---|---|
| Durable приём пользовательской работы | userTaskId=U1 и task view |
| Регистрация на контроль | gtdId=G1 → owner/scope, userTaskId=U1, criteria/policy/state |
| Compile pinned playbook | planId=P1, playbookRef/revision/digest, bindings и stepIds |
| Готов первый шаг | jobId=J1, stepId=S1, operationId для submission |
| Dispatch | runId=R1; envelope несёт U1/G1/P1/S1/J1/R1 |
| Outcome в Output | resultId/eventId + тот же control binding |
| Output → GTD inbox | Durable ACK, dedup; G1 находит P1/S1 и решает transition |
| Следующий шаг | Новая Job/Run для S2; U1/G1/P1 сохраняются |
| Retry шага | Тот же stepId/jobId, новый runId; допустимые effects reconciled |
| Diagnosis/repair | Новая Job/Run с purpose и parentRunId, прежние U1/G1 |
| Ожидание | Durable wait/checkpoint; Run освобождён, G1 остаётся waiting |
| Acceptance | GTD completed, Task succeeded; доставка отдельно |

GTD может контролировать U1 **без P1**, например разовый query или долгую делегацию. gtdId не обозначает обязательный playbook/schedule.

**Практическая находка:** у всех 132 steps в прочитанных JSON отсутствует собственное поле id. Compiler должен создавать и сохранять stepId один раз. Для legacy artifact адрес stageId + ordinal допустим только внутри pinned revision; title не идентификатор. После изменения template running plan не перестраиваем.

## 3. Engineering: feature v1, 15 шагов

Реальный путь: framing/research → change proposal/issue → sandbox → implementation/tests/PR → CI/merge/deploy/real verification/observation → archive.

| Стадия из artifact | Прогон в новой модели |
|---|---|
| frame/propose | U1/G1/P1, отдельные step Jobs; материалы/evidence сохраняются в plan storage |
| apply/implement | ai-agent-job через Runner; Claude/OpenCode выбирает host policy |
| apply/verify-local | Короткие checks и external CI; external run reference фиксируется до wait |
| apply/open-pr | Созданный PR записывается как structured external ref, а не только строка «PR: URL» |
| deliver/ci-green | Pending CI → awaiting condition; failed CI → structured outcome/recovery; green → gate satisfied |
| deliver/merged | programmatic wait; дешёвые checks, не живой engine на сутки |
| deliver/deployed + verify-real | Evidence именно нужной версии, не просто HTTP 200 |
| deliver/observe | Artifact допускает sleep на сутки; GTD timer, без clean room/LLM ожидания |
| archive | Acceptance по required gates; результат в web, optional chat notice |

**Нужный новый binding:** workspaceRef + artifact manifest/version. Тексты требуют одной ветки/рабочей области плана. При каждом новом clean room нельзя терять файлы или читать прежний чужой cwd. Последовательные steps материализуют согласованное состояние; concurrent writers требуют lease/version checks.

**Потенциальная ошибка:** если observer ждёт сутки, обычный execution timeout нельзя считать timeout всей цели. Различаем run deadline, wait deadline и User Task deadline.

### Остальные engineering artifacts

| Playbook | Специфическая проверка |
|---|---|
| debugging v1, 13 steps | Awaiting user input для шагов воспроизведения; ожидание следующего появления ошибки — condition wait, не user input |
| new-software v1, 16 steps | repo input опционален; после repo-bootstrap появляется новый repository binding, его сохраняем для последующих шагов |
| skill-tool v1, 15 steps | Разделяет «tool виден в новой сессии» и «tool реально вызван». Оба evidence обязательны; green CI сам их не доказывает |
| ci-setup v1, 5 steps | Настройка workflow создаёт внешние изменения, PR/merge waits; это отдельная цель, не автоматическое продолжение ci-run без разрешения |
| ci-run v1, 1 step | Даже один template-step включает dispatch → wait → read result; требуется несколько Runs/state transitions одного step |

### ci-run: external run ID не наш runId

1. U2/G2/P2/S1/J1/R1 dispatch-ит cloud tests.
2. GitHub вернул externalOperationRef={provider:github, kind:actions_run, id:…}; сохраняем receipt.
3. Outcome awaiting_condition → Output → G2. R1 завершён; slot освобождён.
4. GTD watcher фиксирует завершение внешнего CI.
5. Новый R2 читает результат той же external operation, **не диспатчит снова**.
6. Утерян start/dispatch ACK → reconcile перед повторной внешней mutation.

В artifact поле внешнего сервиса называется run_id; его нельзя подставлять в платформенный runId.

Ещё нюанс: цель ci-run — **сообщить результат тестов**, включая красный. Поэтому Job может успешно дать report «tests failed», а Task выполнена; repair — новая разрешённая работа. В feature красные tests нарушают обязательный gate. Один provider conclusion не определяет success всей Task.

## 4. Sales: exhibition-catalog-to-sales-site v1, 34 шага

Artifact содержит не только создание сайта, но и live acceptance, Telegram integration и дальнейшее sales workflow.

### Виртуальный путь

- U3/G3/P3: gates проверяют section/capability/credential readiness.
- Discover → scrape → enrich → registry → classify → assemble: отдельные stepIds, часть programmatic Jobs.
- Enrichment API unavailable оставляет incomplete data; registry unknown не превращается в ok.
- Site → deploy → PR/report: сохраняются artifact refs, deployed URL и external operation refs.
- Acceptance B0–B5 создаёт/удаляет test deals, rejects и notes.
- C1–C5 проверяет Telegram business-card flow; это domain acceptance, не обязательный канал отчёта GTD.
- D1–D6 продолжает **реальную работу**: активная выставка, live notes/rejections/deals/closure/report.
- Final report сохраняется в web; G3 закрывается только по установленной цели.

### Что модель обязана уточнить

| Проблема, видимая в artifact | Изменение модели |
|---|---|
| «programmatic» + validation, но не всегда явный operation handler | Validation не исполняет работу. Нужен resolved operationRef/input/output contract либо явно документированный adapter; текущие handlers здесь не проверены |
| requirements/requires не покрывают автоматически все указанные в prose инструменты | Compile/readiness checks по реально используемым capabilities; manifest version + permitted bindings |
| Test mutation → процесс упал до delete | Durable effect receipts + cleanup obligations, исполняемые даже после primary failure/cancel |
| L2 session недоступна, artifact допускает l2_unavailable | Recorded allowed exception по конкретному gate; не универсальное succeeded/skip |
| Шаги D — human sales activity без определённого финального срока | Уточнить completion criteria или вынести operating workflow в отдельную зарегистрированную цель; не крутить endless agent |
| Публикация сайта + реальные CRM records | Access/destination/credential policy привязаны к profile/project; public template не делает private data public |

Для test deal сохраняем externalEntityRef, purpose=test, createdByRunId и cleanup state. [ТЕСТ]-маркер помогает обнаружению, но не заменяет точные IDs/ownership. Удаление по общему текстовому match без scope способно затронуть чужие тесты; target binding должен ограничивать объекты.

**Вывод:** G3 показывает «под контролем», но одного gtdId мало для автоматического выполнения всех 34 шагов. Нужны completion/gate policies и безопасное handling внешних эффектов. Предлагаем логически разделить delivery сайта и его дальнейшее использование; это рекомендация, исходный playbook не изменён.

## 5. Documents: presentation-creation v3, 11 шагов

Это самый явный пример человеческих остановок и независимой research работы.

| Реальный шаг | Прогон |
|---|---|
| Сбор запроса | Если не хватает вводных: awaitingInputId=A1, U4/G4/P4/S1; web state «Awaiting user input» |
| Исследование через hermes_research | Durable delegated work либо зарегистрированный handoff; parentRun может закончиться |
| Согласование направления | A2 связывается с текущим deck/ideation revision и options; ответ принимает GTD |
| Согласование outline | A3 + outline digest/version; старое approval не одобряет изменённую колоду |
| RU/EN rewrite | Фиксированные transforms — кандидаты для llm-recipe-job при подготовленных inputs; модель не читает filesystem сама |
| Render/check | Render/check handler — deterministic; интеллектуальная подгонка может остаться ai-agent-job |
| Отправка файлов через tg_send_file | В новой модели результат: artifact manifest → Report/Gateway, web доступ обязателен, Telegram optional |

G4 принимает outcome research даже если parent engine умер. Для independent child: U5/G5 и parentUserTaskId=U4/createdByRunId=Rresearch_creator. Если нужен только следующий step той же цели, сохраняем U4/G4 и новый Run. Выбранная required dependency не позволяет G4 закрыть parent преждевременно.

**Найденное расхождение:** artifact прямо требует tg_send_file и validator user_received_files. Для web-first варианта acceptance необходимо определить через authorized artifact availability/delivery receipt, а не наличие Telegram-чата. User saw/downloaded — отдельный signal, его не выводим из gateway ACK.

## 6. Documents: freelance-project-spec v1, 11 шагов

Реальный процесс: provenance → facts/requirements/assumptions → вопросы → solution → risk-engine → normalized source → long/short → проверка.

- U6/G6/P6 сохраняет отдельные provenance IDs и artifact refs; это не task/job IDs.
- «Сформировать вопросы» в artifact не содержит явного обязательного waiting gate. В модели определяем required answers и допускаемые assumptions; если нужны ответы — Awaiting user input + awaitingInputId.
- Возобновление держит source/context version: новый ответ обновляет input, downstream outputs прежней версии нельзя выдавать как актуальные.
- Risk-engine и сборка _source описаны как programmatic: нужен execution handler, не только file_exists validator.
- long и short генерируются независимо от одного source ref. Можно две Jobs одного step/цели, но parallel dependencies/join должны быть явными; это не требует публичного batch entity.
- NO-GO — domain verdict, не обязательно infrastructure failure. Task может успешно выдать обоснованный NO-GO; продолжение spec зависит от product policy.

В двух agent steps отсутствует instructions (critique и final spec check), есть лишь named validators. Это не автоматическое доказательство поломки: runtime мог иметь shared step semantics. При portable compilation требуется подтвердить resolver либо вернуть unsupported contract до dispatch.

## 7. Recruiting: recruiting-vacancy-launch v1, 3 шага

Artifact действительно содержит:
1. Credential + vacancy draft check.
2. Publish landing, если его нет.
3. Sync messages + evaluate, **если вакансия уже есть на HH**.

U7/G7/P7 → три шага; при missing HH credential policy даёт blocked/action required, а не LLM, который «придумывает» доступ. Landing URL сохраняется как effect receipt, чтобы retry не публиковал второй лендинг. Отсутствие HH vacancy в третьем шаге допускается самим artifact, это domain branch, не автоматический failed Run.

**Важно:** этот artifact не содержит hourly schedule и явного cold search step. Текст финального hook упоминает холодный поиск, но hook text не подтверждает его выполнение. Отдельную реализацию sync/cold search вне этого файла здесь не проверяли.

Если добавляем расписание:
- scheduleId=SC1 постоянно;
- occurrence 10:00 → U8, occurrence 11:00 → U9; G8/G9 только при explicit completion control;
- Job definition может быть общей; Runs новые;
- отключить SC1 ≠ отменить G8;
- overlap/catch-up/retention задаются отдельно.

## 8. Marketing: customer-development-collect v2, 8 шагов

Реальный процесс: snapshot materials → authors mapping → stage → extract signals → aggregate needs → report/limitations.

- U10/G10/P10 фиксирует source snapshot; повтор ingestion должен сохранять domain dedup IDs.
- Неясная product stage → Awaiting user input(A4), не вечный agent loop.
- Prepared snapshot + rubric подходит fixed LLM extraction/aggregation; сбор материалов с tools остаётся отдельным authorized operation.
- Частота считается по независимым authors; их IDs — domain entity IDs, не userTaskId.
- Publish page заменяется/дополняется scoped web result view по owner policy.
- Chat является **источником данных**, даже если notification chat optional. Удаление lifecycle chat-binding не отменяет авторизацию и сохранённый sourceConversationRef.

**Validator gap:** programmatic «проверить непустой snapshot» проверяет лишь наличие authors.raw.json через find. Пустоту данных этот predicate не доказывает. Также file_exists/grep URL — слабое evidence полноты/качества, не полноценное acceptance.

## 9. Общие находки

| Приоритет | Находка | Что добавить в target model |
|---|---|---|
| P0 | gtdId не фигурирует в прочитанных artifacts как runtime envelope binding | Генерировать в GTD, пинить до dispatch, передавать и проверять во всех managed outcomes |
| P0 | Natural-language markers DURABLE/PR URL встречаются в instructions | Structured ResultEnvelope, wait/effect refs; legacy parser только adapter, missing marker не причина повторять неизвестную внешнюю mutation |
| P0 | User waits указаны prose, не всегда machine contract | Awaiting user input: durable awaitingInputId, schema, checkpoint, answer/version/deadline |
| P0 | External writes/retry и test cleanup | Receipt/reconcile + cleanup obligations, явно owned и видимые |
| P1 | Нет step.id во всех 132 шагах | Compiler-generated pinned stepId; explicit stepKey в будущих versions |
| P1 | Wait condition vs agent timeout vs monitoring window | Отдельный GTD wait state/timer/conditionRef, освобождение engine |
| P1 | Named validators без inspected implementation | Preflight resolver и supported validator capability; inconclusive отдельно от failed acceptance |
| P1 | 3 steps без instructions | Shared semantics явно resolve-ить или уточнить artifact; не дописывать догадками |
| P1 | Telegram-only file delivery / notify hooks | Web-first result view, notification subscriptions отдельно |
| P1 | Workspace/local files между шагами | workspaceRef + artifact snapshot/version manifest, writer policy |
| P1 | Broad plan mixes delivery and ongoing business workflow | Explicit completion criteria и разрешённые bounded continuations |
| P2 | Многие fixed transforms оформлены agent steps | Изолировать prepared-input LLM recipes, если tools/adaptive loop не нужны |

3 steps без instructions: sales classify/borderline, freelance solution critique, freelance final spec validation. Тип/role/validator metadata присутствуют, поэтому вывод — уточнить contract resolution, а не объявить их неработающими.

## 10. Минимальный GTD record и outcome

GTD record:
```json
{
  "gtdId": "G1",
  "userTaskId": "U1",
  "planId": "P1",
  "state": "active",
  "controlGeneration": 1,
  "currentStepId": "S1",
  "completionPolicyRef": "policy_ref",
  "nextCheckAt": null,
  "waitRef": null
}
```

planId nullable для контроля без playbook. Record также хранит scope, pinned policies, attempts/budget/deadline, inbox receipts и outgoing continuation. schema выше иллюстративна.

Outcome несёт userTaskId/gtdId/jobId/runId, planId/stepId если применимы, eventId/resultId, controlGeneration, kind и output/wait/effect refs. GTD проверяет binding и актуальность, а не ищет task по user-facing тексту.

Output → GTD ACK означает: событие записано в durable inbox, дальнейшая обработка восстанавливается. Следующий dispatch защищён operationId/outbox и generation. Missing/unknown gtdId у managed outcome → quarantine/reconcile, пользователь видит проблему; **не silent discard** и не второй recovery owner.

## 11. Проверки, которые превращают desk review в executable evidence

- [ ] Compile всех 11 artifacts в pinned plans с воспроизводимыми step mappings.
- [ ] Fake executor выдаёт done/failed/awaiting_user_input/awaiting_condition/unknown_effect с неизменными U/G IDs.
- [ ] Fake cloud CI: dispatch once → pending → red/green → resume без второго dispatch.
- [ ] Presentation approval + restart: A2/A3 актуальны; duplicate answer не возобновляет дважды.
- [ ] Sales test mutation + crash: effect recorded; cleanup выполняется без дубля создания.
- [ ] GTD outcome потерял ACK: inbox dedup; ровно одно логическое continuation.
- [ ] Parent engine закончился: accepted research outcome доступен в web и будит required next step.
- [ ] HH occurrence новый U; G только при explicit control; launch artifact не falsely заявляет cold search.
- [ ] CD пустой snapshot даёт domain blocked/empty, а не ошибочный green file check.
- [ ] Private input/output не становятся публичными через default publish hook.

**Заключение review:** линейная модель подходит этим artifacts, но обязана учитывать GTD control binding, structured waits/effects, persistent artifacts и явные acceptance contracts. Один gtdId облегчает маршрутизацию контроля; надёжность обеспечивает протокол передачи и восстановления, а не само наличие ID.
