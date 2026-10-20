# SC-INTAKE-READY-01 — Проверить готовый быстрый ответ перед запуском агента

**Статус:** target · scenario change · 20.10.2026  
**История:** [U-07](../../stories/USER.md#u-07-несколько-сообщений--одна-задача)  
**Architecture issue:** [trained-agent-architecture#293](https://github.com/trained-assist/trained-agent-architecture/issues/293) · **Scenario PR:** #294 (draft)  
**Пользователь:** человек в Telegram  
**Цель:** отправить мысль несколькими сообщениями и не выбирать режим агента, если система может безопасно ответить сразу.

## Владельцы и границы

- Telegram gateway: сбор и показ snapshot, кнопка «Готово», доставка выбранного действия.
- Control Plane / быстрый intent path: классификация принятого полного snapshot; первичная маршрутизация не запускает Agent Run, а готовый быстрый ответ сохраняется как результат задачи.
- Agent Runner: только явно выбранный fallback с одной из трёх стратегий агента.
- Existing integration work: [architecture #144](https://github.com/trained-assist/trained-agent-architecture/issues/144) (durable batch + explicit launch); fast-path: [#155](https://github.com/trained-assist/trained-agent-architecture/issues/155); current behavior audit: [#225](https://github.com/trained-assist/trained-agent-architecture/issues/225); gateway implementation [#783](https://github.com/trained-assist/trained-assist-tg-bot/issues/783), [draft PR #784](https://github.com/trained-assist/trained-assist-tg-bot/pull/784); CP continuation strategy [#365](https://github.com/trained-assist/trained-assist-control-plane/issues/365), [draft PR #366](https://github.com/trained-assist/trained-assist-control-plane/pull/366).
- Production promotion: owning repository и только его проверенный защищённый путь. Этот сценарий не разрешает прямое изменение production.

Изменение затрагивает наблюдаемое поведение запуска; одной правки legacy runtime без этого scenario и связанных implementation PR недостаточно для принятия.

## Основной сценарий

1. Пользователь отправляет несколько сообщений; бот обновляет одну квитанцию и показывает общее число принятых элементов и «Готово».
2. До нажатия «Готово» бот только сохраняет ввод: быстрый intent не исполняется, агент не запускается.
3. Пользователь нажимает «Готово». Gateway фиксирует неизменяемый упорядоченный snapshot всей накопленной пачки, durably принимает его и запрашивает CP route без разрешения continuation.
4. Если intent path возвращает валидный готовый быстрый ответ, бот показывает его в том же чате. Варианты запуска агента не показываются; Agent Run не создаётся.
5. Если классификация говорит, что нужен агент, бот показывает:
   - «Изучи и задай вопросы»;
   - «Дай полный ответ»;
   - «На твоё усмотрение»;
   - «Очистить весь ввод».
6. Пользователь выбирает одну из трёх стратегий агента. Gateway передаёт выбор для того же принятого task; CP запрашивает continuation только явно, ровно один раз и применяет выбранную стратегию. «Очистить весь ввод» очищает ещё не исполнявшийся snapshot без запуска Agent Run.

## Альтернативные исходы и сохранение состояния

- При `clarify`/недостающих данных система просит один конкретный факт; ничего не исполняет до ответа. Ответ добавляется к накопленному вводу и повторно классифицируется как новый snapshot.
- При `required_input` бот явно запрашивает недостающее обязательное значение; быстрый ответ и Agent Run не симулируются.
- Timeout, provider failure, malformed result или техническая деградация не считаются `quick` и не запускают Agent Run. Бот сообщает, что проверка не завершилась, и оставляет ввод доступным для повторного действия/ручного выбора.
- Повторный тап, повтор webhook или устаревшая кнопка не создают второй быстрый ответ/Run и не очищают более новый ввод.
- Новое сообщение, пришедшее во время классификации, не может быть поглощено старым snapshot: старый результат не запускает и не очищает новую генерацию буфера.
- Если выбран fallback, но Agent Run отклонён или не принят, пользователь видит отказ и получает возможность повторить запуск; успешный быстрый ответ не показывается.

## Component probes

1. Пачка из трёх сообщений: до «Готово» 0 вызовов классификатора и 0 Agent Runs; после — classifier input содержит все три элемента в порядке приёма.
2. Fixture `quick`: один быстрый результат в чате, 0 Agent Runs и без кнопок эскалации.
3. Fixture `agent`: отображаются все четыре действия; каждая стратегия отправляет точный snapshot один раз; очистка отправляет 0 Runs.
4. Fixtures `clarify`, `required_input`, timeout, malformed и provider failure: нет ложного quick result и нет скрытого Run; состояние ввода сохраняется.
5. Дубли callback/webhook и гонка «новое сообщение во время классификации»: максимум один эффект на revision, новый ввод не теряется.

## Сквозная приёмка

Порядок для реализации: **implementation PR → sandbox E2E по SHA PR head → разбор run evidence и подтверждение cleanup → merge/promotion gates**. Sandbox — штатная проверка PR до merge; ожидать merge в `main` для первого E2E не нужно. Красные CI/scenario checks при незавершённой разработке не запрещают sandbox-прогон, но должны быть исправлены до promotion. Для internal TG PR workflow `Sandbox3 Telegram worker E2E` запускает `ready-agent` автоматически; `ready-quick` доступен ручным запуском по тому же PR ref.

Провести через заявленный sandbox/staging Environment Contract обоих runtime owners с одинаковым sanitized transcript и pinned revisions:

- быстрый ответ: transcript, callback, classification receipt, gateway output; доказать отсутствие Agent Run;
- fallback: transcript, выбранная стратегия, принятие единственного Run и доставка результата;
- controlled classifier failure, повторное нажатие и конкурентное новое сообщение; доказать сохранение snapshot и отсутствие двойного эффекта.

Записать target environment, Environment Contract, component probe commands/results, E2E run URL, revisions каждого implementation PR и ссылки на соответствующие logs/state. Local tests не обозначать staging E2E. Gate 1 semantic review должен быть `PASS`; все применимые component и E2E gates — `PASS`. Пока implementation и evidence отсутствуют, сценарий остаётся открытым и не считается поставленным в production.

## Реализация и evidence

- Architecture issue/PR: [#293](https://github.com/trained-assist/trained-agent-architecture/issues/293) / draft [#294](https://github.com/trained-assist/trained-agent-architecture/pull/294).
- Telegram gateway and sandbox E2E: [trained-assist-tg-bot#783](https://github.com/trained-assist/trained-assist-tg-bot/issues/783); draft [PR #784](https://github.com/trained-assist/trained-assist-tg-bot/pull/784), tested revision `cb65bc9`. The PR-triggered [ready-agent run](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/39449231286) passed on 20.10.2026: «Готово» showed the fallback explanation, explicit style selection continued the same task through Runner, state cleanup and normal delivery-policy restoration passed. A [ready-quick run](https://github.com/trained-assist/trained-assist-tg-bot/actions/runs/39450203115) was dispatched on the same PR branch and SHA: the quick answer completed without style selection or Runner execution, Telegram delivery evidence passed, and cleanup/restoration passed. An earlier quick run exposed an evidence-key mismatch (`quick:` vs `terminal:`); fixed in `cb65bc9` and rechecked successfully.
- Control Plane continuation strategy: [trained-assist-control-plane#365](https://github.com/trained-assist/trained-assist-control-plane/issues/365); draft [PR #366](https://github.com/trained-assist/trained-assist-control-plane/pull/366). Классификатор использует уже существующий CP `/route`; PR передаёт выбранный fallback-стиль в continuation.
- Local component evidence: TG `tests/control-plane-execution.test.js`, `tests/intake-buffer.test.js`, and `tests/intake-buffer-control-plane.test.js` (251 tests), `npm run check`, `git diff --check` passed on 20.10.2026. This is not staging E2E evidence.
- Environment Contracts: проверить актуальные sandbox/staging endpoints, fixtures, logs/state и promotion paths у обоих owners.
- Feature Promotion Gate A: PASS locally on 20.10.2026 (`GITHUB_REPOSITORY=trained-assist/trained-agent-architecture node tools/feature-promotion/gate-a.mjs --base origin/main --head HEAD`).
- Sandbox E2E is wired in TG PR #784: `ready-quick` verifies immediate quick-answer routing with no style selection; `ready-agent` verifies that «Готово» shows the fallback explanation and requires an explicit style before continuing the same task. The sandbox3 workflow runs against the PR head before merge; same-repository PRs receive the sandbox secrets, while fork PRs are skipped. Both paths passed on `cb65bc9`; cleanup, empty final state and normal delivery-policy restoration passed in both runs.
- Gate 1 / target component probes / semantic review: ожидают review; sandbox E2E: PASS on `cb65bc9` (ready-agent and ready-quick, see runs above); production release не выполнен.
