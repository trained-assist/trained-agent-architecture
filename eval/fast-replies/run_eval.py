#!/usr/bin/env python3
"""Детерминированный baseline-прогон корпуса (P18).

     python3 eval/fast-replies/run_eval.py [--source legacy-shadow-baseline] [--write]

Без сети, без зависимостей, без часов: отчёт обязан быть побайтово одинаковым
при повторном запуске — это проверяется selfcheck.py. Живой прогон на бесплатной
модели — отдельный скрипт live_free_smoke.py и в CI не запускается.
"""
import argparse, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPORTS = os.path.join(HERE, "reports")

FIDELITY = """## Что проверено, а что нет (AC-06)

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
"""


def fmt(v):
    return "—" if v is None else str(v)


def render(source_name, metrics, by_class, by_split, faults, fault_rows, review, manifest):
    L = []
    L.append(f"# Baseline eval: `{source_name}`")
    L.append("")
    L.append(f"Корпус `{manifest['corpus']}` v{manifest['version']} · policy `{manifest['policyVersion']}` · "
             f"диалогов {metrics['cases']} (dev {by_split.get('dev', {}).get('cases', 0)}, "
             f"holdout {by_split.get('holdout', {}).get('cases', 0)})")
    L.append("")
    L.append(FIDELITY)
    L.append("## Метрики")
    L.append("")
    L.append("| Метрика | Значение |")
    L.append("|---|---|")
    L.append(f"| верных маршрутов | {metrics['route_matches']}/{metrics['cases']} = {metrics['route_accuracy']} |")
    L.append(f"| верных маршрутов, только достоверные решения | {fmt(metrics['route_accuracy_certain'])} |")
    L.append(f"| **false-fast** (ответ вместо агента) | **{metrics['false_fast']}** |")
    L.append(f"| false-fast о живых данных | {metrics['false_fast_live_data']} |")
    L.append(f"| бюджет false-fast | {metrics['false_fast_budget']} → "
             f"{'в пределах' if metrics['false_fast_within_budget'] else 'ПРЕВЫШЕН'} |")
    L.append(f"| unnecessary-agent | {metrics['unnecessary_agent']} ({metrics['unnecessary_agent_rate']}) |")
    L.append(f"| запусков агента | {metrics['agent_started']} |")
    L.append(f"| технических ошибок/блокировок | {metrics['technical_error_or_blocked']} |")
    L.append(f"| попыток эскалации | {metrics['escalation_attempts']} |")
    L.append(f"| вызовы модели, измеренные строки | {metrics['model_calls_recorded']} из {metrics['cases']} |")
    L.append(f"| вызовы модели, сумма по измеренным | {fmt(metrics['model_calls_total'])} |")
    L.append(f"| задержка p50 / p95 | {fmt(metrics['latency_p50_ms'])} / {fmt(metrics['latency_p95_ms'])} мс |")
    L.append(f"| решения с evidence | documented {metrics['evidence_kinds'].get('documented', 0)}, "
             f"declared {metrics['evidence_kinds'].get('declared', 0)} |")
    L.append("")
    L.append("Задержка и вызовы модели на этом источнике не измерены: "
             f"latency_samples={metrics['latency_samples']}, model_calls_recorded={metrics['model_calls_recorded']}.")
    L.append("")
    L.append("## По сплитам")
    L.append("")
    L.append("| split | случаев | верно | false-fast |")
    L.append("|---|---|---|---|")
    for split, b in by_split.items():
        L.append(f"| {split} | {b['cases']} | {b['accuracy']} | {b['false_fast']} |")
    L.append("")
    L.append("## По классам")
    L.append("")
    L.append("| класс | случаев | верно |")
    L.append("|---|---|---|")
    for cls, b in by_class.items():
        L.append(f"| {cls} | {b['cases']} | {b['accuracy']} |")
    L.append("")
    L.append("## Управляемые сбои (AC-02)")
    L.append("")
    L.append(f"Сценариев: {len(fault_rows)}. Нарушений внешних ожиданий: **{len(faults)}**.")
    L.append("")
    L.append("| сценарий | сбой | исход | код | вызовов | repair | эскалация |")
    L.append("|---|---|---|---|---|---|---|")
    for r in fault_rows:
        d = r["decision"]
        L.append(f"| {r['case']} | {r['fault']} | {d['outcome']} | {d['technicalCode']} | "
                 f"{d['modelCalls']} | {d['repairAttempts']} | {d['escalationAttempt']} |")
    L.append("")
    L.append("## Гейт разметки живых логов (AC-132)")
    L.append("")
    L.append(f"Якорей в сырье: {review['anchors']}. Строк реестра: {review['ledger_rows']}.")
    L.append("")
    L.append("| уровень | строк |")
    L.append("|---|---|")
    for tier in ("unreviewed", "model_reviewed", "human_reviewed", "rejected"):
        L.append(f"| {tier} | {review[tier]} |")
    L.append("")
    if review["ground_truth_available"]:
        L.append("Ground truth по живым логам доступен.")
    else:
        L.append(f"**Ground truth по живым логам НЕ доступен: human_reviewed=0 из {review['anchors']}.** "
                 "Метрики маршрутизации по `anchors.external.v1.jsonl` не считаются: собранные логи "
                 "без ревью истиной не являются. Нужно от владельца: выборочное ревью якорей "
                 "до `human_reviewed` (см. `anchor-review.v1.jsonl`).")
    L.append("")
    L.append("## Чего этот прогон не доказывает")
    L.append("")
    L.append("- Что живая система ведёт себя как baseline: решения записаны по документации, не по трассам.")
    L.append("- Что задержка и стоимость улучшатся: на baseline они не измерены.")
    L.append("- Что ответ хорошего качества: стенд проверяет маршрут, а не смысл.")
    L.append("- Нулевую ошибку в проде: синтетический корпус нулевых ошибок не доказывает (§11.9).")
    L.append("")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="legacy-shadow-baseline")
    ap.add_argument("--write", action="store_true", help="записать отчёт в reports/")
    args = ap.parse_args()

    manifest = harness.load_manifest()
    dialogs = harness.load_corpus()
    path = os.path.join(HERE, "decisions", f"{args.source}.v1.jsonl")
    if not os.path.exists(path):
        print(f"нет источника решений: {path}", file=sys.stderr)
        return 2
    source = harness.ScriptedSource(args.source, path)
    rows, events = harness.run(dialogs, source, manifest["version"], manifest["policyVersion"])
    if source.missing:
        print(f"СТОП: {args.source}: нет решения для {', '.join(source.missing)}", file=sys.stderr)
        return 1

    matrix = harness.load_fault_matrix()
    fault_rows, fault_events = harness.run_faults(matrix, manifest["version"], manifest["policyVersion"])
    faults = harness.fault_violations(matrix, fault_rows)

    review = harness.review_gate(harness.load_review_ledger(),
                                 harness.read_jsonl(os.path.join(HERE, "anchors.external.v1.jsonl")))
    metrics = harness.score(rows)
    report = render(args.source, metrics, harness.by_class(rows), harness.by_split(rows),
                    faults, fault_rows, review, manifest)

    if args.write:
        os.makedirs(REPORTS, exist_ok=True)
        out = os.path.join(REPORTS, f"{args.source}.v1.md")
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(report + "\n")
        print(f"отчёт: {out}")
    else:
        print(report)

    ok = not faults and metrics["false_fast_within_budget"]
    if faults:
        print("\nНАРУШЕНИЯ ожиданий по сбоям:", file=sys.stderr)
        for f in faults:
            print("  -", f, file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
