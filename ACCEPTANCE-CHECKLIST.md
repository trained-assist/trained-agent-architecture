# Чек-лист приёмки

Draft v0.1 · 30.09.2026. Это не план.
Порядок и зависимости работ — только в [плане реализации](IMPLEMENTATION-AND-INTEGRATION-PLAN.md).
Здесь — что проверить и каким доказательством, чтобы принять карточку, этап или переход когорты.
Новых требований документ не вводит, кроме правила перекрёстного ревью (AC-14).
При расхождении действует источник, указанный в пункте.

## 1. Назначение и как пользоваться

- Пункт: `AC-xx · что проверяется. Доказательство: ... Источник: ...`.
- Типы доказательств: `transcript` — sanitized transcript прогона; `logs` — выборка scoped logs с IDs;
  `test` — команда проверки и её вывод; `probe PR-xx` — прогон ловушки из [PROBES](stories/PROBES.md);
  `CI` — ссылка на зелёный run; `review` — записанный вердикт ревью; `decision` — ссылка на решение владельца или issue.
- Доказательство прикладывается в issue карточки. Пункт отмечается только со ссылкой на доказательство.
- «Ответ агента успешный» сам по себе доказательством не является
  ([план, «Sandbox и требования к логам»](IMPLEMENTATION-AND-INTEGRATION-PLAN.md#sandbox-и-требования-к-логам)).
- Номера сгруппированы блоками; пропуски намеренны. ID не переиспользуются.

## 2. Общий гейт карточки (Done)

Применяется к каждой карточке Z01–Z03, P01–P30 в дополнение к её специфической приёмке.

- [ ] AC-01 · Положительный путь пройден через внешний контракт, а не внутренний вызов.
  Доказательство: transcript. Источник: ENGINEERING-APPROACH, правило 2.
- [ ] AC-02 · Релевантный controlled failure воспроизведён и дал ожидаемый исход.
  Доказательство: transcript + logs. Источник: план, «Общая приёмка каждой карточки».
- [ ] AC-03 · Scoped logs читаемы; выполнена строка этапа из таблицы logs checks.
  Доказательство: logs. Источник: [SANDBOX-PLAN, «Логи обязательны»](SANDBOX-PLAN.md#логи-обязательны-для-каждой-итерации).
- [ ] AC-04 · Версии закреплены: source commit, config/binding refs, версии ПО.
  Доказательство: manifest в transcript. Источник: SANDBOX-PLAN, «Состав сценария».
- [ ] AC-05 · Прогон воспроизводим одной процедурой setup → run → evidence → teardown. Не зависит от временного ssh-alias `vm`.
  Доказательство: test. Источник: SANDBOX-PLAN; SANDBOX-BINDINGS §5.
- [ ] AC-06 · Fidelity declaration: что эмулировано, что требует live smoke. Локальный PASS не назван облачной проверкой.
  Доказательство: абзац в issue. Источник: ENGINEERING-APPROACH; SANDBOX-PLAN.
- [ ] AC-07 · Значений секретов нет в логах, trace, issue, commit, docs. Signed URL целиком не пишется.
  Доказательство: grep по transcript/logs. Источник: SANDBOX-BINDINGS §7; INV-12.
- [ ] AC-08 · Прод-токены и прод-профили не скопированы в sandbox.
  Доказательство: env-manifest sandbox. Источник: SANDBOX-BINDINGS §7.
- [ ] AC-09 · У sandbox-сервиса своё имя endpoint, ключ и хранилище. Пересечение с production проверено явно, а не «по настройке».
  Доказательство: test/logs. Источник: SANDBOX-BINDINGS §7.
- [ ] AC-10 · Ротация sandbox-ключа не требует смены прод-ключа.
  Доказательство: decision/описание binding. Источник: SANDBOX-BINDINGS §7.
- [ ] AC-11 · Живой сервис не тронут: боевые bot/webhook/endpoints/базы без изменений.
  Доказательство: transcript. Источник: план, «Решение владельца».
- [ ] AC-12 · Лимиты: free-only профиль, paid fallback выключен, число live runs ограничено.
  Доказательство: config + logs. Источник: ENGINEERING-APPROACH, правило 4; P03.
- [ ] AC-13 · CI и staging зелёные на актуальной версии PR до merge. В repo есть завершающий job Repository context.
  Доказательство: CI. Источник: SANDBOX-PLAN, блокер 7; ENGINEERING-APPROACH.
- [ ] AC-14 · Независимое перекрёстное ревью после каждого успешного sandbox-этапа.
  Ревьюер — модель другого семейства (Codex проверяет сделанное Claude). Вердикт записан в issue.
  Блокирующие замечания закрыты или превращены в карточки плана. После ревью обновлены следующие шаги в архитектуре/плане.
  Доказательство: review + ссылки на карточки. Источник: **Решение владельца 30.09.2026**.
- [ ] AC-15 · Issue ссылается на карточку, IDs историй, Axx, Cxx, INV-xx, сценарии.
  Доказательство: issue. Источник: README, «Как привязывать работу».
- [ ] AC-16 · «Готово, когда» затронутых историй проверено снаружи.
  Ловушка зелёная, только если выполнены и видимое пользователю, и сигнал.
  Доказательство: probe PR-xx. Источник: [PROBES](stories/PROBES.md).
- [ ] AC-17 · Затронутые API/recovery/cleanup/compatibility проверены по scope карточки.
  Доказательство: transcript. Источник: план, «Общая приёмка каждой карточки».
- [ ] AC-18 · Если карточка создаёт данные: TTL/cleanup проверен ускоренным clock. Активные checkpoint/outbox не стираются.
  Доказательство: test. Источник: OBSERVABILITY, TTL и чек-лист.
- [ ] AC-19 · Тест проверяет внешний контракт, а не сравнивает функцию с собой.
  Доказательство: review. Источник: SANDBOX-PLAN, «Состав сценария».

## 3. Предусловия (preflight)

Блокеры полного прохода — [SANDBOX-PLAN, «Блокеры»](SANDBOX-PLAN.md#блокеры-полного-прохода--проверено-на-хосте-30092026).
Поле «До» — какую приёмку пункт блокирует; это не порядок работ.

- [ ] AC-20 · В новых repo есть CI и staging: ai-agent-runner, trained-assist-control-plane,
  trained-assist-integration-gate, trained-assist-error-watcher.
  До: merge первой карточки I01. Доказательство: CI. Источник: SANDBOX-PLAN, блокер 7.
- [ ] AC-21 · Onboarding AutoFix/staging этих repo выполнен по Z01/Z02.
  До: I01. Доказательство: coverage-таблица Z01. Источник: план, «Scope границ».
- [ ] AC-22 · Решение по VM2 записано: очищена до пустого namespace, либо профиль удалён, либо VM2 объявлена не-sandbox.
  На sandbox нет копии реального профиля и `agent-data`.
  До: I01. Доказательство: decision + transcript. Источник: SANDBOX-PLAN, блокер 5; SANDBOX-BINDINGS §1.
- [ ] AC-23 · На sandbox-машине установлен opencode для live free-smoke. Детерминированные тесты идут на локальном LLM stub.
  До: live smoke I01. Доказательство: transcript. Источник: SANDBOX-PLAN, блокер 6; SANDBOX-BINDINGS §3.
- [ ] AC-24 · Выделен `LLM_LADDER_TOKEN` для sandbox как binding.
  До: live smoke через Ladder. Доказательство: описание binding. Источник: SANDBOX-PLAN, блокер 4.
- [ ] AC-25 · Создан отдельный sandbox Telegram-бот; прод-токен не перенесён.
  До: реальный bot smoke P11. Доказательство: decision. Источник: SANDBOX-PLAN, блокер 2; #1808 Q-F.
- [ ] AC-26 · GCS-бакет расшарен на VM service account,
  либо записано: fixture — локальный S3, sandbox — R2, GCS cloud smoke не выполнен.
  До: I02B. Доказательство: decision. Источник: SANDBOX-PLAN, блокер 1.
- [ ] AC-27 · Созданы отдельные Cloudflare bindings Workers/KV/D1/R2 на своих именах.
  До: I02B/I03. Доказательство: список bindings. Источник: SANDBOX-BINDINGS §6.
- [ ] AC-28 · Cloudflare Workflows + D1: три live-проверки на настоящем аккаунте. Продолжение инстанса после kill -9.
  Срабатывание `sleep` и таймаута ожидания. Деплой новой версии во время ожидания. Иначе — записанное решение о DBOS + Postgres.
  До: P04–P09, P22, P23, I10. Доказательство: transcript + decision в DECISIONS.
  Источник: SANDBOX-PLAN, блокер 8; ARCHITECTURE 4.5, 13.
- [ ] AC-29 · Протокол переноса данных snapshot → run → commit → cleanup имеет карточку и владельца.
  До: I02B, P29. Доказательство: issue. Источник: SANDBOX-PLAN, блокер 9.
- [ ] AC-30 · Режим HH/CRM test-account зафиксирован (read-only).
  До: I08. Доказательство: decision. Источник: SANDBOX-PLAN, блокер 4; SANDBOX-BINDINGS §6.
- [ ] AC-31 · Есть shell-доступ к RU VM.
  До: региональная приёмка I10/P30. Доказательство: transcript. Источник: SANDBOX-PLAN, блокер 3.
- [ ] AC-32 · Sandbox API key и scopes (C13) выпущены. До: I02A. Доказательство: описание binding. Источник: SANDBOX-BINDINGS §6.
- [ ] AC-33 · Каждый binding описан: путь + переменная + владелец + процедура + дата ротации.
  Доказательство: таблица bindings. Источник: SANDBOX-BINDINGS §4.
- [ ] AC-34 · Карточка в работе заведена issue с полями Stage / Depends on / Sandbox / Acceptance evidence.
  Доказательство: issue. Источник: SANDBOX-PLAN, риск 11.

## 4. По этапам

Для каждого этапа: карточки, истории, минимальный набор ловушек, logs checks, пороги.
Сами logs checks — строка этапа в [SANDBOX-PLAN](SANDBOX-PLAN.md#логи-обязательны-для-каждой-итерации).
Этап закрыт, когда его истории и ловушки прошли в песочнице ([stories/README](stories/README.md)).

### I00 — baseline репозиториев (Z01–Z03)

Истории: DEV-01, DEV-02. Ловушки: PR-29.

- [ ] AC-40 · Z01: coverage-таблица по всем участвующим repo; onboarding нового repo воспроизводим.
  Значений credentials в inventory нет. Доказательство: таблица + test. Источник: Z01.
- [ ] AC-41 · Z02: намеренная ошибка исправлена; чистый repo не меняется;
  неподдержанная ошибка остановлена по cap; нет самостоятельного merge/deploy. Доказательство: transcript. Источник: Z02; DEV-02.
- [ ] AC-42 · Z03: Repository context на PR и main; job идёт и после failed checks;
  устаревший SHA распознаётся; secrets/generated исключены.
  Доказательство: CI + manifest. Источник: Z03; DEV-01; ENGINEERING-APPROACH.
- [ ] AC-43 · PR-29: возраст последнего успешного выпуска виден; тревога при отставании прода.
  Доказательство: probe PR-29. Источник: PROBES.
- [ ] AC-44 · Logs I00: rule ID, tool/version, attempt count, patch refs,
  source commit, included/omitted paths, budget; no-change повтор и failed check.
  Доказательство: logs. Источник: SANDBOX-PLAN, строка I00.

### I01 — Runner на sandbox VM (P01–P03)

Истории: OPS-01, OPS-02, OPS-03; начало OPS-04, API-04.
Ловушки: PR-02, PR-09 (файлы владельцев), PR-17, PR-19, PR-25 (запись расхода).

- [ ] AC-50 · P01: чистая VM поднимается без ручных шагов; второй setup идемпотентен.
  Доказательство: transcript двух прогонов. Источник: P01; OPS-01; уроки VM2.
- [ ] AC-51 · P01: нет обязательного binding → диагностируемая readiness-ошибка без crash-loop.
  Standalone Runner работает без bot token. Доказательство: transcript. Источник: P01; OPS-01.
- [ ] AC-52 · P01: host ID уникален; schedules/delivery off — проверено отсутствием фактических запусков.
  Teardown трогает только experiment namespace. Доказательство: logs. Источник: P01; SANDBOX-PLAN, VM2.
- [ ] AC-53 · P02: success, nonzero exit, startup/auth failure, timeout, cancel, child cleanup
  имеют typed outcome и журнал. Доказательство: transcript. Источник: P02; OPS-02.
- [ ] AC-54 · P02 / PR-09: два test principals не читают чужие workspace. Доказательство: probe PR-09. Источник: P02; INV-06.
- [ ] AC-55 · P03: rate limit, invalid output, provider unavailable, kill/restart, log sink outage
  воспроизводимы; logging failure bounded. Доказательство: test. Источник: P03; OPS-03.
- [ ] AC-56 · P03: missing runtime/dependency/secret, недоступный secret backend, ошибочная role
  ловятся до старта; readiness отделена от liveness. Доказательство: transcript. Источник: P03.
- [ ] AC-57 · P03: firewall снаружи и reachability изнутри проверены; timestamps UTC.
  Доказательство: transcript. Источник: P03; SANDBOX-PLAN, VM2.
- [ ] AC-58 · Partition при живом engine → connection_lost и report, нового Run нет.
  Выход процесса не удаляет volume; потеря диска моделируется отдельно.
  Доказательство: probe PR-02. Источник: P03; ARCHITECTURE 4.6; SANDBOX-PLAN, «Проверки связи».
- [ ] AC-59 · PR-17: повтор текста без вызова целевого инструмента дольше N минут → остановка.
  PR-19: превышение лимита записано как timeout. Доказательство: probe. Источник: PROBES.
- [ ] AC-60 · PR-25: у каждого запуска записаны модель, попытка, расход; нет запуска с пустым расходом.
  Доказательство: probe + logs. Источник: PROBES; INV-10.
- [ ] AC-61 · Logs I01: start/exit/cancel/process-tree/heartbeat/recovery, profile/task/run/engine/provider refs.
  Доказательство: logs. Источник: SANDBOX-PLAN, строка I01.

### I02A — Serverless Agent API (P04–P06)

Истории: API-01…API-05; U-16 для API. Ловушки: PR-03, PR-06 (базовая отмена).

- [ ] AC-65 · P04: дубль submit → та же квитанция; другой payload → conflict; без права → отказ до запуска.
  Квитанция означает «принято», а не «запущено». Доказательство: test. Источник: P04; API-01.
- [ ] AC-66 · P05: queued/starting/running/terminal различимы; разрыв потока не теряет итог.
  «Связь потеряна» — отдельное состояние; status не запускает агента. Доказательство: test. Источник: P05; API-02.
- [ ] AC-67 · P05: «cancel requested» не выдаётся за «stopped»; отмена только этой задачи.
  Доказательство: transcript. Источник: P05; API-03.
- [ ] AC-68 · P06: после restart принятая задача не исчезает и не запускается дважды.
  Всё проходит без Telegram и Web. Доказательство: transcript. Источник: P06; API-05.
- [ ] AC-69 · P06: reconnect/replay без rerun; сигнал повтора дедуплицирован;
  userTaskId тот же, runId новый; старый процесс остановлен или лишён прав до нового запуска.
  Доказательство: logs previous/new runId, generation. Источник: P06; ARCHITECTURE 4.6.
- [ ] AC-70 · PR-03: повтор с тем же ключом не меняет число задач. Доказательство: probe PR-03.
- [ ] AC-71 · PR-06 (база): за 15 мин нет нового запуска цепочки; через 10 с нет живых процессов.
  Доказательство: probe PR-06. Источник: PROBES; U-04; INV-08.
- [ ] AC-72 · Logs I02A: receipt/idempotency/auth scope, event sequence/replay; API key не логируется.
  Доказательство: logs. Источник: SANDBOX-PLAN, строка I02A.

### I02B — артефакты и workspace (P07–P09)

Истории: API-06, API-07. Минимального набора ловушек в PROBES нет — см. раздел 8.

- [ ] AC-75 · P07: клиент без профиля скачал точные bytes (hash совпал).
  Доказательство: transcript + hash. Источник: P07; API-06; INV-13.
- [ ] AC-76 · P07: сбой export не удаляет единственную копию; partial manifest объявлен явно.
  Повтор finalization/commit не запускает engine. Доказательство: test. Источник: P07; ARCHITECTURE 4.6.
- [ ] AC-77 · P08: expired URL, чужой principal, CORS, size/hash mismatch,
  прерванный upload/resume, abort cleanup. Bytes идут мимо API. Доказательство: test. Источник: P08; API-06.
- [ ] AC-78 · P09: два writers не перезаписывают версию молча; path traversal отвергнут;
  режимы no-profile и folder работают. Доказательство: test. Источник: P09; API-07.
- [ ] AC-79 · P09: следующая попытка видит прежние файлы в новой clean room;
  процессы и секреты не наследуются. Доказательство: transcript. Источник: P09; ARCHITECTURE 4.6.
- [ ] AC-80 · Рестарт VM с persistent volume: данные целы, финализация повторяема.
  Уничтожение единственного volume → явная потеря, без ложного обещания.
  Доказательство: transcript. Источник: SANDBOX-PLAN, «Проверки связи».
- [ ] AC-81 · Logs I02B: artifactId/hash/size/version, multipart state, export commit/fail, cleanup decision.
  Доказательство: logs. Источник: SANDBOX-PLAN, строка I02B.

### P-DB, схема Task Store, контракт «разговор / проект / аудитория»

Карточки в плане нет ([stories/README, «Предпосылки без карточек»](stories/README.md#пробелы-плана)).
От этих пунктов зависят P12 и P22.

- [ ] AC-85 · P-DB cloud smoke выполнен (AC-28); выбор записан в DECISIONS. Источник: ARCHITECTURE 4.5, 13.
- [ ] AC-86 · План из пяти шагов с ожиданием ответа пользователя и рестартом исполнителя
  проходит через Workflow Port; статус и история читаются из Task Store. Доказательство: transcript. Источник: ARCHITECTURE 4.5.
- [ ] AC-87 · Схема Task Store выведена из прод-схемы `state.db`; статус — колонка, история — журнал;
  owner/lease/generation в базе; доступ только через repository-интерфейс.
  Доказательство: review схемы. Источник: ARCHITECTURE 4.1.
- [ ] AC-88 · Контракт conversation/project/audience опубликован и указан в P12.
  Доказательство: ссылка на документ. Источник: ARCHITECTURE 5, 11.

### I03 — Web, затем Telegram (P10–P12)

Истории: U-01…U-06, U-30 (частично), OPS-04 — Web/P12; U-07…U-10 — P11.
Ловушки: PR-01, PR-06, PR-07, PR-08, PR-10, PR-11, PR-12, PR-13, PR-14, PR-27.

- [ ] AC-90 · U-02 / P10: пять уточнений, перезапуск между 3-й и 4-й.
  4-й ответ ссылается на факт из 1-го; ни одна реплика не выполнена дважды.
  Доказательство: transcript + probe PR-01. Источник: U-02; ARCHITECTURE 5.1; P10.
- [ ] AC-91 · U-02: задержка и стоимость хода записаны рядом со старым путём.
  Доказательство: таблица замеров. Источник: U-02; P10.
- [ ] AC-92 · P12: проекции conversation и task различаются; project/audience и контекст
  переживают restart; один userTaskId от ingress до результата. Доказательство: logs. Источник: P12.
- [ ] AC-93 · U-01: подтверждение приёма раньше начала работы; номер задачи виден до ответа;
  сбой доставки не делает задачу «ошибкой» и не перезапускает её. Доказательство: transcript. Источник: U-01; P12; INV-09.
- [ ] AC-94 · U-03: после переподключения текст не задваивается; повтор при обрыве не исполняет задачу снова;
  ссылка на сессию открывается после перезапуска системы. Доказательство: transcript. Источник: U-03.
- [ ] AC-95 · U-04: «Остановлено» только после подтверждённой остановки; 15 мин без перезапуска
  повтором, таймером, доводкой; стоп в одном чате не трогает другие. Доказательство: probe PR-06, PR-07. Источник: U-04; INV-08.
- [ ] AC-96 · U-05: /stop, /status не проходят через модель и очередь; ответ в той же сессии.
  Доказательство: logs. Источник: U-05; P12.
- [ ] AC-97 · U-06: при 0–1 проекте вопроса нет; выбор сохраняется; агент видит только данные проекта.
  Новая тема при двух проектах → выбор проекта. Доказательство: probe PR-10. Источник: U-06; INV-18.
- [ ] AC-98 · PR-09 на I03: второй пользователь не видит данных первого. Доказательство: probe PR-09.
- [ ] AC-99 · P10: после reconnect видна существующая Task; private scopes проверены;
  Run из Web совпадает с Run в API. Доказательство: transcript. Источник: P10.
- [ ] AC-100 · U-30 (частично): без входа — только страница входа. Доказательство: test. Источник: U-30.
- [ ] AC-101 · P11: CI fixture, затем отдельный test bot; production bot/webhook не переключён.
  Доказательство: transcript. Источник: P11; AC-25.
- [ ] AC-102 · U-07 / PR-12: пачка из 10 сообщений и голосовых → одна задача, одна кнопка запуска;
  число принятых = числу элементов входа. Доказательство: probe PR-12. Источник: U-07.
- [ ] AC-103 · U-08 / PR-13: тип вложения верен; файл >20 МБ — понятное сообщение; кириллица в имени.
  Доказательство: probe PR-13. Источник: U-08.
- [ ] AC-104 · U-09 / PR-11: ответ только в чат и бот-заказчик. Доказательство: probe PR-11. Источник: U-09; INV-19.
- [ ] AC-105 · U-10: нет активных кнопок завершённых задач. Доказательство: transcript. Источник: U-10.
- [ ] AC-106 · PR-14: принятое шлюзом сообщение получает квитанцию ≤2 с или записанный отказ.
  Доказательство: probe PR-14. Источник: PROBES; U-01, U-07.
- [ ] AC-107 · PR-08 / U-12: 15 мин без выбора — ноль автозапусков; не больше одной активной задачи;
  с «Параллельно» — не больше двух, в разных сессиях. Карточки нет — см. раздел 8.
  Доказательство: probe PR-08. Источник: U-12; RC-01…08; INV-03.
- [ ] AC-108 · PR-27: 30 ходов — рост входных токенов на ход ограничен; стоимость сравнена со старой.
  Доказательство: probe PR-27. Источник: PROBES; U-02.
- [ ] AC-109 · OPS-04: номер задачи виден пользователю; служебный вид только поддержке.
  Доказательство: transcript. Источник: OPS-04 (карточки служебного вида нет).
- [ ] AC-110 · Logs I03: ingress ref, profile/channel/destination, dedup/media, delivery attempts/ACK;
  ошибка TG/Web прослеживается до scoped report. Доказательство: logs. Источник: SANDBOX-PLAN, строка I03.

### I04 — MCP и доменные capabilities (P13–P15)

Истории: U-28 (доступы), U-29 (подтверждение). Ловушки: PR-04, PR-16.

- [ ] AC-115 · P13: tool вызван реально, а не только виден в list; чужой binding недоступен;
  failed startup в logs; UID MCP не заявлен как OS isolation. Доказательство: transcript. Источник: P13.
- [ ] AC-116 · P14: версия/bindings/permissions явны; read не запускает план;
  fake mutation подтверждена receipt; advisory playbook без gtdId. Доказательство: transcript. Источник: P14.
- [ ] AC-117 · P15: success/error/delay/auth expiry/duplicate callbacks на fixtures;
  одинаковый outcome по всем transport. Доказательство: test. Источник: P15.
- [ ] AC-118 · PR-04: при неизвестном исходе внешнее действие выполнено не больше одного раза.
  Доказательство: probe PR-04. Источник: U-29; INV-07.
- [ ] AC-119 · PR-16: «ок» инструмента сверяется с проверяемым результатом. Доказательство: probe PR-16.
- [ ] AC-120 · U-28: нет сырых технических ошибок; ключи сервиса не видны модели.
  Доказательство: transcript. Источник: U-28; INV-12.
- [ ] AC-121 · Logs I04: readiness/handshake/invocation/timeout/cleanup, scoped binding, effect receipt.
  Доказательство: logs. Источник: SANDBOX-PLAN, строка I04.

### I05 — первый fast path (P16–P18)

Истории: U-14, U-17. Ловушки: PR-15, PR-21…PR-24 + весь корпус быстрых ответов.

- [ ] AC-125 · Корпус `dev` + `holdout`: 100% верных маршрутов на FR-050…FR-056; ноль ложно-быстрых ответов о живых данных.
  Доказательство: отчёт eval; формат корпуса — `python3 eval/fast-replies/check.py`.
  Источник: [FAST-REPLIES](stories/FAST-REPLIES.md); stories/README, первый срез.
- [ ] AC-126 · P16: цитата со ссылкой не запускает агента; live data не получает выдуманный ответ;
  права не выводятся из regex. Доказательство: probe PR-21, PR-23. Источник: P16; U-17.
- [ ] AC-127 · PR-22: реальная задача, похожая на шаблонный вопрос, запущена. Доказательство: probe.
- [ ] AC-128 · P17: schema invalid, model timeout, budget/provider failure, awaiting input,
  insufficient context дают корректные outcomes; один continuation owner; OpenCode — конечный auto executor.
  Доказательство: test. Источник: P17; DECISIONS 30.09.
- [ ] AC-129 · PR-15: отказ прозой и пустой ответ не записаны как успех. Доказательство: probe PR-15.
- [ ] AC-130 · PR-24: слова «rate limit» в обычном ответе не уводят в аварийный путь. Доказательство: probe.
- [ ] AC-131 · U-14: после закрывающей реплики новый сбор данных не запускается. Доказательство: transcript.
- [ ] AC-132 · P18: корпус versioned; profile data не публикуются; logs не считаются разметкой без review.
  Доказательство: review. Источник: P18.
- [ ] AC-133 · Logs I05: routing reason/policy, mode, needs_executor, escalation, время первого полезного ответа.
  Доказательство: logs. Источник: SANDBOX-PLAN, строка I05.

### I06 — capability catalog (P19–P21)

Истории: U-18, U-19 (Web). Ловушки I06–I07: PR-05, PR-18, PR-20.

- [ ] AC-135 · P19: template — handler deterministic-job, не четвёртый Job type;
  неподдержанное не рекламируется. Доказательство: review + test. Источник: P19; U-18.
- [ ] AC-136 · P20: brief содержит ограничения и ссылки на оригинал; права не выдуманы;
  cache keyed profile/context/catalog/policy; размер brief измерен. Доказательство: test. Источник: P20.
- [ ] AC-137 · P21: one-call vs two-call сравнены по correctness/latency/calls/cost; выбор записан.
  Доказательство: отчёт eval + decision. Источник: P21.
- [ ] AC-138 · U-19 / PR-05: ожидание переживает перезапуск; ответ засчитан один раз;
  за время ожидания нет расхода модели; userTaskId сохранён. Доказательство: probe PR-05. Источник: U-19; P21; INV-15.
- [ ] AC-139 · Logs I06: catalog/brief version, eval case ID, calls, latency, usage; raw prompt не в корпусе.
  Доказательство: logs. Источник: SANDBOX-PLAN, строка I06.

### I07 — расписание, планы, выборочный GTD (P22–P24)

Истории: U-21 (частично), U-22, U-23, U-24, U-25, U-27.
Ловушки: PR-05, PR-18, PR-20; также PR-11, PR-17 (этап I07 в PROBES).

- [ ] AC-140 · P22 / U-22: выключение расписания не отменяет принятую задачу;
  crash replay не создаёт второй occurrence; ошибки запусков видны. Доказательство: test на virtual clock.
- [ ] AC-141 · P22: простой cron не создаёт GTD events; gtdId отсутствует. Доказательство: logs. Источник: P22; INV-16.
- [ ] AC-142 · P23 / U-23: G получает только одна явная managed task; wait не держит токены;
  self-GTD не создаётся; caps завершают продвижение. Доказательство: transcript. Источник: P23; INV-16.
- [ ] AC-143 · P24: PR → CI → verify gates с evidence; правка не меняет running step IDs;
  HH simple schedule без GTD. Доказательство: transcript. Источник: P24.
- [ ] AC-144 · U-25: пробуждение после ответа пользователя ≤5 с; после внешнего условия ≤60 с;
  переживает перезапуск; шаг не запускается дважды. Доказательство: замеры + logs. Источник: U-25.
- [ ] AC-145 · U-21 / PR-18: одно статус-сообщение на запуск; о сбое ровно одно сообщение с «Повторить/Отменить».
  Доказательство: probe PR-18. Источник: U-21.
- [ ] AC-146 · PR-20: план не закрывается без свежего доказательства по каждому пункту.
  Доказательство: probe PR-20. Источник: U-23.
- [ ] AC-147 · U-24: обязательную проверку нельзя выключить; брошенный чек-лист через сутки освобождает чат.
  Доказательство: test на virtual clock. Источник: U-24.
- [ ] AC-148 · U-27: чужой план не цепляется к разговору; напоминание одно. Доказательство: transcript.
- [ ] AC-149 · Logs I07: occurrence dedup, gtdId только opt-in, registration reason, wait/deadline/ACK.
  Доказательство: logs. Источник: SANDBOX-PLAN, строка I07.

### I08 — External Integration Gate (P25–P26)

Истории: U-28, U-29 полностью. Минимального набора ловушек в PROBES нет; применимы PR-04, PR-16.

- [ ] AC-150 · Webhook: проверка подписи → durable inbox + dedup → быстрый ACK → async dispatch.
  Доказательство: test с дублем callback. Источник: EXTERNAL-INTEGRATION-GATE.
- [ ] AC-151 · Timeout мутации = unknown до reconcile; повтор только после reconcile. Доказательство: test. Источник: P25; INV-07.
- [ ] AC-152 · После переключения нет двух adapter implementations; бизнес-правила в доменах.
  Доказательство: review. Источник: P25.
- [ ] AC-153 · P26: hourly не выдаётся за production enabled; неподдержанный webhook не обещан;
  данные идут через общий task flow. Доказательство: transcript. Источник: P26; AC-30.
- [ ] AC-154 · Logs I08: operationId/external refs, callback signature/dedup, unknown→reconciled;
  raw payload приватный. Доказательство: logs. Источник: SANDBOX-PLAN, строка I08.

### I09 — Error Watcher (P27–P28)

Истории: OPS-05, OPS-06, U-33. Ловушки: PR-26.

- [ ] AC-160 · P27: шторм 1000 events не даёт 1000 LLM calls; один incident; исходные ошибки сохранены.
  Доказательство: probe PR-26 + счётчик calls. Источник: P27; OPS-05.
- [ ] AC-161 · P27: unknown profile → ops reconciliation, не случайная user delivery.
  Доказательство: logs. Источник: P27; OBSERVABILITY.
- [ ] AC-162 · Mute записан с причиной и автором; expiry/regression открывают incident снова.
  Доказательство: test. Источник: OPS-05; SYSTEM-ERROR-WATCHER.
- [ ] AC-163 · P28: issue создан один раз и только после receipt; diagnostic failure не расследует себя.
  Доказательство: transcript. Источник: P28; OPS-06.
- [ ] AC-164 · U-33: сообщение без технических деталей; если доставка невозможна — видно в Web/API.
  Доказательство: transcript. Источник: U-33; P28.
- [ ] AC-165 · Logs I09: errorEvent/incident/sourceTask/diagnosticTask, fingerprint/count, self-loop guard.
  Доказательство: logs. Источник: SANDBOX-PLAN, строка I09.

### I10 — promotion, совместимость, RU/EU (P29–P30)

Истории: OPS-09, OPS-11. Ловушки: PR-28.

- [ ] AC-170 · P29: pinned release/config; smoke через API/Web/TG с коррелированными IDs;
  retention и rollback evidence; paid profiles off. Доказательство: transcript. Источник: P29.
- [ ] AC-171 · Clean promotion: experiment data/keys не стали production; sandbox пересоздан.
  Доказательство: transcript. Источник: P29; ENGINEERING-APPROACH, правило 8.
- [ ] AC-172 · PR-28: расхождение версий сервисов блокирует выпуск. Доказательство: probe PR-28.
- [ ] AC-173 · P30: нет double execution после failover; partition — не failover;
  записи прежнего владельца исключены до перехода. Доказательство: transcript. Источник: P30; OPS-11.
- [ ] AC-174 · P30: OpenCode region по provider constraints; Claude/Codex не в RU.
  Доказательство: logs. Источник: P30; INV-05. Требует AC-31.
- [ ] AC-175 · Logs I10: release/config/worker/region/ownerGeneration, cohort/rollback, fencing/drain;
  prod и sandbox различимы. Доказательство: logs. Источник: SANDBOX-PLAN, строка I10.

## 5. Сквозные инварианты и контракты

Проверяются на каждом этапе, где затронуты. Номер AC-2xx повторяет номер INV.

- [ ] AC-201 · INV-01: профиль, сессия, задача, попытка, worker, clean room — разные IDs в logs.
- [ ] AC-202 · INV-02: поздний результат старого generation отвергнут. Проверка: fixture позднего события.
- [ ] AC-203 · INV-03: одна интерактивная работа на полосу; вторая только с `parallel` и в отдельной сессии.
- [ ] AC-204 · INV-04: параллельные запуски одного проекта не берут глобальный замок профиля.
- [ ] AC-205 · INV-05: выбор движка и fallback проходят политику размещения; Claude/Codex не в RU.
- [ ] AC-206 · INV-06: отказ границы изоляции не ведёт к запуску с более широкими правами.
- [ ] AC-207 · INV-07: мутация с неизвестным исходом не повторяется вслепую (PR-04).
- [ ] AC-208 · INV-08: стоп прекращает возобновление на всех уровнях, включая движок (PR-06).
- [ ] AC-209 · INV-09: результат сохранён до удаления clean room; доставка повторяется отдельно.
- [ ] AC-210 · INV-10: каждый расход привязан к задаче/попытке/шагу/источнику; unknown не равен 0.
- [ ] AC-211 · INV-11: бюджет учитывает технические повторы, продолжения GTD и проверки качества.
- [ ] AC-212 · INV-12: credentials по явным scopes; значений секретов в журнале нет.
- [ ] AC-213 · INV-13: артефакт — стабильный id, владелец, checksum; временный URL не идентичность.
- [ ] AC-214 · INV-14: результат задачи под GTD доставлен в GTD inbox с gtdId и receipt.
- [ ] AC-215 · INV-15: ожидание ответа видно в Web без живого Run.
- [ ] AC-216 · INV-16: GTD только явно, с конкретным следующим контролем, без самоконтроля.
- [ ] AC-217 · INV-17: модуль публикует structured errors и основные события со scope и TTL.
- [ ] AC-218 · INV-18: у принятой задачи есть проект, либо она ждёт выбора проекта.
- [ ] AC-219 · INV-19: доставка по audienceId/destinationId, записанным при приёме.
- [ ] AC-220 · INV-20: замена движка не теряет задачи, статусы и результаты (AC-86, AC-28).

Источник: [ARCHITECTURE §12](ARCHITECTURE.md#12-блоки-и-инварианты). Доказательство — logs/test этапа.

Observability — [чек-лист контракта](OBSERVABILITY-AND-ERROR-CONTRACT.md#sandbox-driven-development-observable-acceptance), по каждому новому модулю:

- [ ] AC-230 · Источник зарегистрирован: error/lifecycle schemas и TTL.
- [ ] AC-231 · Ошибка user path содержит profile, известный replyContext, Task/Run IDs; failed и unknown различаются.
- [ ] AC-232 · Timeout, invalid output, auth missing дают readable structured event.
- [ ] AC-233 · Profile-scoped ошибка без профиля уходит в quarantine, профиль не угадывается.
- [ ] AC-234 · Outage telemetry не блокирует пользовательский путь; dropped-count виден.
- [ ] AC-235 · safeSummary без секретов/PII; raw details только по privateDetailsRef.

Model Gateway — [MODEL-GATEWAY-AND-COSTS](MODEL-GATEWAY-AND-COSTS.md):

- [ ] AC-240 · Каждый call/attempt несёт userTaskId, jobId/runId, stepId, source, providerCallId;
  gtdId только при контроле. Проверка: logs Ledger.
- [ ] AC-241 · Учтены retries, fallback, cache, streaming, validation calls; unknown usage/cost ≠ 0.
- [ ] AC-242 · Budget policy проверяется до платного вызова. Проверка: test с исчерпанным бюджетом.
- [ ] AC-243 · Автоэскалация заканчивается на OpenCode; Claude Code/Codex только явным выбором.
  Источник: DECISIONS 30.09; ARCHITECTURE 5.3.
- [ ] AC-244 · U-20: причина отказа по бюджету/моделям одинакова во всех каналах;
  дорогая модель не включается без разрешения (PR-25). Карточки нет — см. раздел 8.

Integration Gate — [EXTERNAL-INTEGRATION-GATE](EXTERNAL-INTEGRATION-GATE.md):

- [ ] AC-250 · Webhook: verify → inbox + dedup → быстрый ACK (AC-150).
- [ ] AC-251 · Effect: operationId записан до вызова; timeout = unknown → reconcile до повтора (AC-151).
- [ ] AC-252 · Principal берётся из binding через Credential Broker, не от модели.
- [ ] AC-253 · Callback существующей операции не создаёт вторую задачу.

IDs и Reporting — [USER-TASK-IDS-AND-REPORTING §11](USER-TASK-IDS-AND-REPORTING.md#11-репозитории-и-следующий-шаг):

- [ ] AC-260 · Один userTaskId переживает сборку input, retry, diagnosis, escalation до доставки.
- [ ] AC-261 · Refresh Web показывает состояние без нового execution и без LLM.
- [ ] AC-262 · Ошибка Run остаётся в history, даже если Task продолжилась.
- [ ] AC-263 · Accepted Run без ответа виден и контролируется по deadline при пустых очередях.
- [ ] AC-264 · Late/duplicate events не меняют стадию неверно.
- [ ] AC-265 · Delivery failure не превращает success в повтор Run.
- [ ] AC-266 · Чужую задачу по известному ID прочитать нельзя.
- [ ] AC-267 · Следующий hourly запуск получает новый userTaskId.
- [ ] AC-268 · Отсутствие userTaskId у пользовательской работы — ошибка контракта, не новый ID.

Error Watcher — [SYSTEM-ERROR-WATCHER](SYSTEM-ERROR-WATCHER.md):

- [ ] AC-270 · Одна активная diagnostic Task на incident; новые события дополняют её.
- [ ] AC-271 · Автоэскалация диагностики только до OpenCode; лимиты попыток/budget из конфига.
- [ ] AC-272 · Suppression не удаляет исходные errors и не делает задачи успешными.
- [ ] AC-273 · Wildcard-mute всей платформы запрещён; permanent ignore имеет audit и revoke.
- [ ] AC-274 · Независимый deterministic health alarm сообщает о неработающем watcher.
- [ ] AC-275 · Fixtures раздела «Проверка» спецификации пройдены.

## 6. Приёмка первого среза

Основание: [stories/README, «Приёмочный набор первого среза»](stories/README.md#приёмочный-набор-первого-среза).
Смысл: новая система заменяет старую для одного пилотного пользователя (I03 + I05).

- [ ] AC-300 · Истории U-01…U-10, U-12, U-14, U-16, U-17 приняты по своим AC-пунктам.
- [ ] AC-301 · Главный сценарий U-02 принят (AC-90, AC-91).
- [ ] AC-302 · Корпус быстрых ответов принят (AC-125).
- [ ] AC-303 · Минимальные наборы ловушек I01, I02A, I03, I05 зелёные.
- [ ] AC-304 · Задержка и стоимость хода на U-02 и корпусе записаны рядом со старым путём.
- [ ] AC-305 · Все карточки, чьи части вошли в срез, приняты по общему гейту (раздел 2), включая перекрёстное ревью (AC-14).

## 7. Переход когорты и промоушен

Основание: [ARCHITECTURE §10](ARCHITECTURE.md#10-переход-с-текущего-прода);
план, «Путь интеграции с действующей системой», шаги 1–6.

- [ ] AC-320 · Для когорты записано условие перехода: какие сценарии проходят,
  задержка и стоимость не хуже прода, дата прекращения приёма новых задач старым путём. Доказательство: decision.
- [ ] AC-321 · Подключение пилотного клиента — отдельное записанное решение после sandbox-приёмки.
  Доказательство: decision. Источник: план, шаг 4.
- [ ] AC-322 · Один dispatch owner выбирает ровно одного исполнителя на запрос;
  result и delivery однозначны. Доказательство: logs. Источник: план, шаг 4.
- [ ] AC-323 · Переключаются только новые задания когорты; принятые старые завершает старый владелец;
  нет двух очередей, продолжающих одну работу. Доказательство: logs. Источник: план, шаг 5; OPS-09.
- [ ] AC-324 · Откат проверен прогоном. Доказательство: transcript. Источник: OPS-09; P29.
- [ ] AC-325 · Совместимость: старые сценарии воспроизведены в sandbox на sanitized inputs;
  реальные mutating requests не дублируются в два сервиса. Источник: план, шаг 3.
- [ ] AC-326 · IDs и credentials старой/новой системы связаны mapping contract;
  stable external correlation сохранена. Источник: план, «Путь интеграции».
- [ ] AC-327 · До снятия старых путей пройден сквозной сценарий: приём → результат → Web/чат,
  stop и дополнение, повтор после сбоя, бюджетный отказ, внешний callback, ожидание ответа. Источник: ARCHITECTURE §10.
- [ ] AC-328 · Legacy не удалён и не архивирован этой работой. Источник: план, шаг 6.
- [ ] AC-329 · OPS-10 (если перенос): каждый заявленный ключ доходит до потребителя; значения не печатаются.
  Карточки нет — см. раздел 8.

## 8. Открытые вопросы и пробелы

Перечень, не решения. Закрываются правкой плана или историй.

Истории без карточки или с частичной ([stories/README, «Пробелы плана»](stories/README.md#пробелы-плана)):
- U-12 — карточки нет; рекомендация добавить в P12 и P10/P11. Проверка уже нужна в первом срезе (AC-107).
- U-13, U-15, U-19 (общий механизм), U-20, U-21, U-31 — карточек нет или частично.
- API-04 (операция журнала), API-08…API-15 — нет в спецификации API.
- Единый набор состояний API/Reporting/событий не сведён; «cancel» и «stop» названы по-разному.
- OPS-04 (служебный вид), OPS-07 (отчёт о расходах), OPS-08 (закрепление модели), OPS-10 (перенос) — карточек нет.
- U-30 импорт — карточки нет.

Предпосылки без карточек:
- P-DB в облаке, схема Task Store, контракт «разговор / проект / аудитория» (блок AC-85…AC-88).
- Протокол переноса данных snapshot → run → commit → cleanup (AC-29).

Ловушки:
- Нет минимального набора для I02B и I08 в PROBES.
- Порог N минут в PR-17 не задан.

Пороги без утверждённых значений:
- OPS-08: «не больше одного промаха кэша на разговор», «платных переключений меньше базовой линии» —
  базовая линия не измерена, карточки нет.
- U-02: порог задержки/стоимости — только «записать рядом»; «+20%» — рекомендация, не решение.
- ARCHITECTURE §13: режим бюджета при недоступном учёте (fail-open с потолком) не подтверждён.

Открытые вопросы U-02 ([stories/README](stories/README.md#открытые-вопросы-по-первому-сценарию-u-02)):
1. Что перезапускается между 3-й и 4-й репликой: исполнитель, управляющий слой или оба.
2. Фиксированный текст пяти реплик и способ проверки «контекст сохранён».
3. Пороги задержки и стоимости как гейт перевода пилота.

Расхождения между документами:
- Срок P-DB: ARCHITECTURE 4.5 — «до I01»; SANDBOX-PLAN, блокер 8 — «на I02A»; план — «до реализации control plane».
- Перезапуск в U-02: ARCHITECTURE 5.1 — перезапуск исполнителя;
  PR-01 — управляющий слой, затем исполнитель; stories/README держит это открытым.
