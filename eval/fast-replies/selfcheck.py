#!/usr/bin/env python3
"""Детерминированные проверки стенда P18: корпус, гейт разметки, управляемые сбои,
санитизация и воспроизводимость отчёта.

     python3 eval/fast-replies/selfcheck.py

Это не тест «функция против себя»: ожидания сбоев лежат в fault-scenarios.v1.json,
ожидания маршрутов — в корпусе, а проверка санитизации — на файле с намеренно
посаженными секретами и личными данными. Смысл ответа живой модели здесь не
проверяется и не должен проверяться.
"""
import json, os, subprocess, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PY = sys.executable
failures = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'ПРОВАЛ'}  {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def sh(*args):
    return subprocess.run([PY, *args], capture_output=True, text=True, cwd=ROOT)


def main():
    print("1. корпус и манифест")
    r = sh("eval/fast-replies/check.py")
    check("check.py зелёный", r.returncode == 0, r.stdout + r.stderr)
    manifest = harness.load_manifest()
    dialogs = harness.load_corpus()
    check("корпус версионирован", bool(manifest.get("version")) and bool(manifest["files"]["dialogs.v1.jsonl"]["sha256"]))
    check("holdout не пуст", any(d["split"] == "holdout" for d in dialogs))
    check("классы ловушек присутствуют",
          {"live_data", "quoted_url", "constraint_middle", "model_failure", "budget", "late_attachment"}
          <= {d["class"] for d in dialogs})

    print("2. baseline-прогон")
    r = sh("eval/fast-replies/run_eval.py", "--write")
    check("run_eval.py зелёный", r.returncode == 0, r.stdout + r.stderr)
    report = open(os.path.join(HERE, "reports", "legacy-shadow-baseline.v1.md"), encoding="utf-8").read()
    check("отчёт содержит декларацию fidelity", "Что проверено, а что нет" in report)
    check("отчёт не выдаёт baseline за измерение", "не трассы реальных запросов" in report)
    check("отчёт не выдаёт неизмеренное за измеренное", "latency_samples=0" in report)
    check("отчёт явно говорит про отсутствие ground truth", "Ground truth по живым логам НЕ доступен" in report)

    print("3. управляемые сбои (AC-02)")
    matrix = harness.load_fault_matrix()
    rows, events = harness.run_faults(matrix, manifest["version"], manifest["policyVersion"])
    violations = harness.fault_violations(matrix, rows)
    check("все сценарии сбоя прошли внешние ожидания", not violations, "; ".join(violations))
    check("ни один сбой не дошёл до исполнителя",
          not any(r["decision"]["escalationAttempt"] or r["decision"]["needsExecutor"] for r in rows))
    check("repair ограничен одним повтором",
          all(r["decision"]["repairAttempts"] <= 1 for r in rows))
    check("бюджет проверяется до вызова модели",
          next(r for r in rows if r["fault"] == "budget_denied")["decision"]["modelCalls"] == 0)
    check("отказ модели не записан как успех",
          next(r for r in rows if r["fault"] == "model_refusal")["decision"]["outcome"] == "technical_error")
    check("недостающий аргумент — вопрос, а не сбой",
          next(r for r in rows if r["fault"] == "missing_required_arg")["decision"]["outcome"] == "clarify")
    keys = set(events[0])
    check("событие несёт ключи причины перехода",
          {"reasonCode", "mode", "needsExecutor", "schemaOutcome", "coverage",
           "modelCalls", "escalationAttempt", "outcome"} <= keys)
    check("технический сбой порождает отдельное событие technical_error",
          any(e["event"] == "technical_error" for e in events))
    check("секретов и путей в событиях нет",
          not any("/home/" in json.dumps(e) or "sk-" in json.dumps(e) for e in events))

    print("4. гейт разметки живых логов (AC-132)")
    ledger = harness.load_review_ledger()
    anchors = harness.read_jsonl(os.path.join(HERE, "anchors.external.v1.jsonl"))
    gate = harness.review_gate(ledger, anchors)
    check("каждый якорь имеет строку реестра", gate["anchors_without_ledger_row"] == 0)
    check("ground truth недоступен, пока нет human_reviewed", gate["ground_truth_available"] is False)
    check("метрика по якорям не считается", gate["route_accuracy_from_anchors"] is None)
    # Механизм проверяется на временном реестре: human_reviewed обязан включать счётчик.
    with tempfile.TemporaryDirectory() as td:
        tmp = os.path.join(td, "anchor-review.v1.jsonl")
        with open(tmp, "w", encoding="utf-8") as fh:
            for a in anchors[:3]:
                fh.write(json.dumps({"sampleId": a["sampleId"], "review": "human_reviewed",
                                     "labelClass": a["cls"], "labelRoute": "llm",
                                     "reviewer": "test", "reviewedAt": "2026-10-03"}, ensure_ascii=False) + "\n")
            for a in anchors[3:]:
                fh.write(json.dumps({"sampleId": a["sampleId"], "review": "unreviewed",
                                     "labelClass": a["cls"], "labelRoute": None,
                                     "reviewer": None, "reviewedAt": None}, ensure_ascii=False) + "\n")
        g2 = harness.review_gate(harness.read_jsonl(tmp), anchors)
        check("human_reviewed включается в ground truth", g2["ground_truth_available"] is True and g2["human_reviewed"] == 3)
        check("unreviewed не даёт ground truth",
              harness.review_gate([{"sampleId": a["sampleId"], "review": "unreviewed",
                                    "labelClass": a["cls"], "labelRoute": None,
                                    "reviewer": None, "reviewedAt": None} for a in anchors],
                                  anchors)["ground_truth_available"] is False)

    print("5. read-only извлечение и санитизация")
    raw = os.path.join(HERE, "fixtures", "raw-export.planted-pii.sample.jsonl")
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, "anchors.new.jsonl")
        r = sh("eval/fast-replies/extract_sanitized_requests.py", "--in", raw, "--out", out)
        check("экстрактор отработал", r.returncode == 0, r.stdout + r.stderr)
        text = open(out, encoding="utf-8").read()
        check("секрет не прошёл фильтр", "sk-abcdefghij" not in text)
        check("телефон не прошёл фильтр", "+79161234567" not in text)
        check("путь не прошёл фильтр", "/home/vova" not in text)
        check("e-mail не прошёл фильтр", "ivan@example.com" not in text)
        check("чужая когорта не прошла фильтр", "OWNER-01" not in text)
        check("дубль не прошёл фильтр", text.count("перепиши этот абзац короче") == 1)
        check("короткая реплика не прошла фильтр", '"ok"' not in text)
        check("валидные реплики сохранены", "перепиши этот абзац короче" in text)
        r2 = sh("eval/fast-replies/extract_sanitized_requests.py", "--in", raw, "--out", raw)
        check("источник не перезаписывается", r2.returncode == 2 and "только читается" in r2.stderr)
        r3 = sh("eval/fast-replies/verify_anchors.py")
        check("verify_anchors.py зелёный на опубликованном файле", r3.returncode == 0, r3.stdout + r3.stderr)

    print("6. воспроизводимость")
    a = sh("eval/fast-replies/run_eval.py").stdout
    b = sh("eval/fast-replies/run_eval.py").stdout
    check("отчёт побайтово одинаков при повторе", a == b)
    check("в отчёте нет стенных часов и даты прогона",
          "generatedAt" not in a and "generated_at" not in a
          and not any(s in a for s in (__import__("datetime").date.today().isoformat(),)))

    print()
    if failures:
        print(f"ПРОВАЛО: {len(failures)} — {', '.join(failures)}")
        return 1
    print("все проверки прошли")
    return 0


if __name__ == "__main__":
    sys.exit(main())
