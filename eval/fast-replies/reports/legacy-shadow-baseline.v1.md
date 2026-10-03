# Baseline eval: `legacy-shadow-baseline`

Корпус `fast-replies` v1 · policy `fast-path-v1-draft-2026-10-02` · диалогов 35 (dev 30, holdout 5)

## Что проверено, а что нет (AC-06)

- **Проверено здесь:** сам стенд — загрузка версионированного корпуса, подсчёт метрик,
  события `routing.decision` с ключами причины перехода, управляемые сбои model gateway,
  гейт разметки живых логов. Всё это детерминировано и воспроизводимо.
- **Не проверено и не утверждается:** поведение живой системы. Baseline-решения — это
  *записанная модель текущего поведения*, собранная из задокументированных сценариев
  (`scenarios/sources/.../CURRENT-STATE.md`) и из отсутствия задокументированного
  быстрого пути. Это не трассы реальных запросов: журнал запусков не содержит полей
  маршрута/решения, а `engine/mode` заполнен только в 30 записях из 945
  (research/FAST-PATH-RESEARCH-2026-10-02.md §1, §5.5).
- **Не измерено:** задержка и число вызовов модели на baseline (`usageSource=not_recorded`).
  Публичные прокси из исследования (медианный агентный прогон 4.3 мин, 8.8 вызова модели —
  TraceLab) — чужие цифры и наши выводы не опираются.
- **Не проверено:** качество ответа живой модели. Стенд проверяет маршрут и технические
  исходы, а не смысл ответа; смысл проверяет судья с выборочной проверкой человеком.

## Метрики

| Метрика | Значение |
|---|---|
| верных маршрутов | 5/35 = 0.1429 |
| верных маршрутов, только достоверные решения | 0.1333 |
| **false-fast** (ответ вместо агента) | **0** |
| false-fast о живых данных | 0 |
| бюджет false-fast | 0 → в пределах |
| unnecessary-agent | 30 (0.8571) |
| запусков агента | 34 |
| технических ошибок/блокировок | 1 |
| попыток эскалации | 1 |
| вызовы модели, измеренные строки | 2 из 35 |
| вызовы модели, сумма по измеренным | 0 |
| задержка p50 / p95 | — / — мс |
| решения с evidence | documented 30, declared 5 |

Задержка и вызовы модели на этом источнике не измерены: latency_samples=0, model_calls_recorded=2.

## По сплитам

| split | случаев | верно | false-fast |
|---|---|---|---|
| dev | 30 | 0.1667 | 0 |
| holdout | 5 | 0.0 | 0 |

## По классам

| класс | случаев | верно |
|---|---|---|
| budget | 1 | 0.0 |
| capabilities | 3 | 0.0 |
| clarify | 2 | 0.0 |
| closing | 2 | 0.0 |
| constraint_middle | 1 | 0.0 |
| date_math | 1 | 0.0 |
| dialog_followup | 2 | 0.0 |
| draft_given | 1 | 0.0 |
| effect | 1 | 1.0 |
| explain | 1 | 0.0 |
| injection | 1 | 0.0 |
| late_attachment | 1 | 0.0 |
| live_data | 2 | 1.0 |
| model_failure | 1 | 0.0 |
| multi_step | 1 | 1.0 |
| own_data | 2 | 0.0 |
| quoted_url | 1 | 0.0 |
| reasoning_given | 1 | 0.0 |
| required_input | 1 | 0.0 |
| service | 5 | 0.2 |
| summarize_given | 1 | 0.0 |
| text_transform | 3 | 0.0 |

## Управляемые сбои (AC-02)

Сценариев: 8. Нарушений внешних ожиданий: **0**.

| сценарий | сбой | исход | код | вызовов | repair | эскалация |
|---|---|---|---|---|---|---|
| FS-01 | model_timeout | technical_error | MODEL_TIMEOUT | 1 | 0 | False |
| FS-02 | invalid_json | technical_error | SCHEMA_INVALID | 2 | 1 | False |
| FS-03 | truncated_json | technical_error | SCHEMA_TRUNCATED | 2 | 1 | False |
| FS-04 | model_refusal | technical_error | MODEL_REFUSED | 1 | 0 | False |
| FS-05 | budget_denied | blocked | BUDGET_EXHAUSTED | 0 | 0 | False |
| FS-06 | no_enabled_candidates | technical_error | NO_ENABLED_CANDIDATES | 0 | 0 | False |
| FS-07 | stale_context_snapshot | technical_error | STALE_CONTEXT | 0 | 0 | False |
| FS-08 | missing_required_arg | clarify | MISSING_REQUIRED_ARG | 0 | 0 | False |

## Гейт разметки живых логов (AC-132)

Якорей в сырье: 344. Строк реестра: 344.

| уровень | строк |
|---|---|
| unreviewed | 344 |
| model_reviewed | 0 |
| human_reviewed | 0 |
| rejected | 0 |

**Ground truth по живым логам НЕ доступен: human_reviewed=0 из 344.** Метрики маршрутизации по `anchors.external.v1.jsonl` не считаются: собранные логи без ревью истиной не являются. Нужно от владельца: выборочное ревью якорей до `human_reviewed` (см. `anchor-review.v1.jsonl`).

## Чего этот прогон не доказывает

- Что живая система ведёт себя как baseline: решения записаны по документации, не по трассам.
- Что задержка и стоимость улучшатся: на baseline они не измерены.
- Что ответ хорошего качества: стенд проверяет маршрут, а не смысл.
- Нулевую ошибку в проде: синтетический корпус нулевых ошибок не доказывает (§11.9).

