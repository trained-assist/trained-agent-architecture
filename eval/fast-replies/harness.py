#!/usr/bin/env python3
"""Baseline eval harness для маршрутизации быстрых ответов (карточка P18).

Задача стенда: прогнать один и тот же версионированный корпус через несколько
источников решений и посчитать метрики из TASK-ROUTER-AND-MCP.md §11.9 —
false-fast, unnecessary-agent, задержка и вызовы модели. Стенд ничего не знает
про внутренности роутера: источник решения отдаёт те же поля, что и живой
RoutingDecision event, поэтому P16/P17 подключается подменой источника.

Запуск (детерминированно, без сети и без зависимостей):
    python3 eval/fast-replies/run_eval.py --sources legacy-shadow-baseline

Намеренно НЕ сравнивает источник с самим собой: ожидаемое поведение берётся из
корпуса (`route`), а для сбоев — из внешней матрицы `fault-scenarios.v1.json`.
"""
import json, os, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))

ROUTES = ("template", "deterministic", "llm", "clarify", "required_input", "agent")
AGENT_FREE = ("template", "deterministic", "llm", "clarify", "required_input")
FAST_REPLY_ROUTES = ("template", "deterministic")
# Классы, где «не запустить агента» стоит пользователю данных, а не удобства.
LIVE_CLASSES = ("live_data", "own_data", "effect", "multi_step")
TECHNICAL_OUTCOMES = ("technical_error", "blocked")
# Порог приёмки false-fast назначен ДО holdout (§11.9). Ноль — обязателен:
# выдуманное число о живых данных ломает главное правило fast path.
FALSE_FAST_BUDGET = 0

REQUIRED_EVENT_KEYS = (
    "event", "decisionId", "corpusCase", "corpusVersion", "source", "policyVersion",
    "route", "mode", "reasonCode", "needsExecutor", "schemaOutcome", "semanticOutcome",
    "coverage", "modelCalls", "latencyMs", "usageSource", "escalationAttempt",
    "firstUsefulReplyMs", "outcome", "continuationRef", "jobRef", "runRef",
)


# --- загрузка корпуса -------------------------------------------------------

def read_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except ValueError as exc:
                raise SystemExit(f"{path}:{n}: не JSON ({exc})")
    return rows


def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_manifest():
    return read_json(os.path.join(HERE, "corpus.manifest.json"))


def load_corpus():
    return read_jsonl(os.path.join(HERE, "dialogs.v1.jsonl"))


def load_review_ledger():
    return read_jsonl(os.path.join(HERE, "anchor-review.v1.jsonl"))


# --- источники решений ------------------------------------------------------

class ScriptedSource:
    """Решения, записанные заранее (dev/holdout replay, офлайн-стенд §11.7.5).

    Файл решений — артефакт версии: он проверяем, а не переписываем под результат.
    Отсутствующий кейс — ошибка стенда, а не «агент по умолчанию».
    """

    def __init__(self, name, path):
        self.name = name
        self.decisions = {r["case"]: r for r in read_jsonl(path)}
        self.missing = []

    def decide(self, dialog):
        d = self.decisions.get(dialog["id"])
        if d is None:
            self.missing.append(dialog["id"])
            return {
                "route": None, "mode": None, "reasonCode": "NO_DECISION_RECORDED",
                "needsExecutor": None, "schemaOutcome": "not_run", "semanticOutcome": "not_run",
                "coverage": "missing_snapshot", "modelCalls": 0, "latencyMs": None,
                "usageSource": "not_recorded", "escalationAttempt": False,
                "firstUsefulReplyMs": None, "outcome": "technical_error",
                "continuationRef": None, "jobRef": None, "runRef": None,
                "technicalCode": "NO_DECISION_RECORDED",
            }
        out = dict(d)
        out.setdefault("mode", d["route"])
        out.setdefault("needsExecutor", d["route"] == "agent")
        out.setdefault("schemaOutcome", "valid")
        out.setdefault("semanticOutcome", "valid")
        out.setdefault("coverage", "full")
        out.setdefault("modelCalls", 0)
        out.setdefault("latencyMs", None)
        out.setdefault("usageSource", "not_recorded" if d.get("latencyMs") is None else "measured")
        out.setdefault("escalationAttempt", False)
        out.setdefault("firstUsefulReplyMs", None)
        out.setdefault("outcome", "reply")
        out.setdefault("continuationRef", None)
        out.setdefault("jobRef", None)
        out.setdefault("runRef", None)
        return out


class FaultStub:
    """Управляемый сбой model gateway: таймаут, невалидный/обрезанный JSON, отказ,
    нулевой бюджет, пустой каталог кандидатов, устаревший снимок контекста.

    Сбой — единственный способ проверить, что fast path не «чинит» техническую
    ошибку запуском агента: §11.3 запрещает незаметно включать дорогого исполнителя
    по техническому исходу. Ожидания внешние (fault-scenarios.v1.json), поэтому
    проверка не сравнивает стаб с самим собой.
    """

    # Сколько вызовов модели стоит каждый вид сбоя и что он возвращает.
    # repair — один ограниченный повтор по JSON, дальше типизированная ошибка.
    # missing_required_arg — не сбой, а host-валидация: правильный исход здесь
    # уточнение, и поэтому он не смешивается с technical_error.
    PROFILES = {
        "model_timeout":         dict(modelCalls=1, repair=0, outcome="technical_error", code="MODEL_TIMEOUT",            schema="timeout"),
        "invalid_json":          dict(modelCalls=1, repair=1, outcome="technical_error", code="SCHEMA_INVALID",          schema="invalid"),
        "truncated_json":        dict(modelCalls=1, repair=1, outcome="technical_error", code="SCHEMA_TRUNCATED",        schema="truncated"),
        "model_refusal":         dict(modelCalls=1, repair=0, outcome="technical_error", code="MODEL_REFUSED",           schema="refused"),
        "budget_denied":         dict(modelCalls=0, repair=0, outcome="blocked",         code="BUDGET_EXHAUSTED",        schema="budget_denied"),
        "no_enabled_candidates": dict(modelCalls=0, repair=0, outcome="technical_error", code="NO_ENABLED_CANDIDATES",  schema="not_run"),
        "stale_context_snapshot": dict(modelCalls=0, repair=0, outcome="technical_error", code="STALE_CONTEXT",         schema="not_run"),
        "missing_required_arg":  dict(modelCalls=0, repair=0, outcome="clarify",         code="MISSING_REQUIRED_ARG",   schema="valid",      semantic="invalid_missing_arg"),
    }

    def __init__(self, matrix_path):
        self.name = "fault-stub"
        self.matrix = read_json(matrix_path)

    def decide(self, dialog):
        prof = self.PROFILES[dialog["fault"]]
        return {
            "route": None, "mode": None,
            "reasonCode": prof["code"], "needsExecutor": False,
            "schemaOutcome": prof["schema"],
            "semanticOutcome": prof.get("semantic", "not_evaluated"),
            "coverage": "stale" if prof["code"] == "STALE_CONTEXT" else "missing_snapshot",
            "modelCalls": prof["modelCalls"] + prof["repair"], "latencyMs": None,
            "usageSource": "not_recorded", "escalationAttempt": False,
            "firstUsefulReplyMs": None, "outcome": prof["outcome"],
            "continuationRef": None, "jobRef": None, "runRef": None,
            "repairAttempts": prof["repair"],
            "technicalCode": prof["code"],
        }


# --- прогон -----------------------------------------------------------------

def percentile(values, p):
    """Ближайший ранг: детерминированно и без интерполяции."""
    if not values:
        return None
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, int(round((p / 100.0) * len(ordered) + 0.5)) - 1))
    return ordered[idx]


def run(dialogs, source, corpus_version, policy_version):
    """Прогоняет корпус через источник решений, возвращает строки и события."""
    rows, events = [], []
    for dialog in dialogs:
        d = source.decide(dialog)
        event = {
            "event": "routing.decision",
            "decisionId": f"{corpus_version}:{source.name}:{dialog['id']}",
            "corpusCase": dialog["id"],
            "corpusVersion": corpus_version,
            "source": source.name,
            "policyVersion": policy_version,
            "route": d["route"],
            "mode": d["mode"],
            "reasonCode": d["reasonCode"],
            "needsExecutor": d["needsExecutor"],
            "schemaOutcome": d["schemaOutcome"],
            "semanticOutcome": d["semanticOutcome"],
            "coverage": d["coverage"],
            "modelCalls": d["modelCalls"],
            "latencyMs": d["latencyMs"],
            "usageSource": d["usageSource"],
            "escalationAttempt": d["escalationAttempt"],
            "firstUsefulReplyMs": d["firstUsefulReplyMs"],
            "outcome": d["outcome"],
            "continuationRef": d["continuationRef"],
            "jobRef": d["jobRef"],
            "runRef": d["runRef"],
        }
        for k in ("repairAttempts", "technicalCode"):
            if k in d:
                event[k] = d[k]
        if d["outcome"] in TECHNICAL_OUTCOMES:
            events.append({
                "event": "technical_error",
                "decisionId": event["decisionId"],
                "corpusCase": dialog["id"],
                "code": d.get("technicalCode", d["reasonCode"]),
                "outcome": d["outcome"],
                "escalationAttempt": d["escalationAttempt"],
            })
        events.append(event)
        rows.append({"case": dialog["id"], "expected": dialog["route"], "split": dialog["split"],
                     "class": dialog["class"], "decision": d, "event": event})
    return rows, events


def score(rows):
    """Метрики §11.9. Ничего не «додумывается»: отсутствующее измерение = None.

    `modelCalls: null` означает «в этом источнике вызовы не измерены», а не ноль:
    иначе baseline честно превратился бы в выдуманный бесплатный агент.
    """
    n = len(rows)
    if not n:
        return {}
    matched = [r for r in rows if r["decision"]["route"] == r["expected"]]
    false_fast = [r for r in rows if r["decision"]["route"] in FAST_REPLY_ROUTES and r["expected"] == "agent"]
    ff_live = [r for r in false_fast if r["class"] in LIVE_CLASSES]
    unnecessary = [r for r in rows if r["decision"]["route"] == "agent" and r["expected"] in AGENT_FREE]
    agent_started = [r for r in rows if r["decision"]["route"] == "agent"]
    certain = [r for r in rows if not r["decision"].get("uncertain")]
    lat = [r["decision"]["latencyMs"] for r in rows if r["decision"]["latencyMs"] is not None]
    calls = [r["decision"]["modelCalls"] for r in rows if r["decision"]["modelCalls"] is not None]
    tech = [r for r in rows if r["decision"]["outcome"] in TECHNICAL_OUTCOMES]
    return {
        "cases": n,
        "route_accuracy": round(len(matched) / n, 4),
        "route_matches": len(matched),
        "certain_cases": len(certain),
        "route_accuracy_certain": (round(sum(1 for r in certain if r["decision"]["route"] == r["expected"]) / len(certain), 4)
                                   if certain else None),
        "false_fast": len(false_fast),
        "false_fast_live_data": len(ff_live),
        "unnecessary_agent": len(unnecessary),
        "unnecessary_agent_rate": round(len(unnecessary) / n, 4),
        "agent_started": len(agent_started),
        "technical_error_or_blocked": len(tech),
        "escalation_attempts": sum(1 for r in rows if r["decision"]["escalationAttempt"]),
        "model_calls_recorded": len(calls),
        "model_calls_total": sum(calls) if calls else None,
        "model_calls_mean": round(statistics.fmean(calls), 3) if calls else None,
        "latency_samples": len(lat),
        "latency_p50_ms": percentile(lat, 50),
        "latency_p95_ms": percentile(lat, 95),
        "latency_measured": len(lat) > 0,
        "false_fast_budget": FALSE_FAST_BUDGET,
        "false_fast_within_budget": len(false_fast) <= FALSE_FAST_BUDGET,
        "evidence_kinds": {k: sum(1 for r in rows if r["decision"].get("evidenceKind") == k)
                           for k in ("documented", "declared")},
    }


def by_class(rows):
    out = {}
    for r in rows:
        b = out.setdefault(r["class"], {"cases": 0, "matched": 0})
        b["cases"] += 1
        b["matched"] += 1 if r["decision"]["route"] == r["expected"] else 0
    return {k: dict(v, accuracy=round(v["matched"] / v["cases"], 4)) for k, v in sorted(out.items())}


def by_split(rows):
    out = {}
    for r in rows:
        b = out.setdefault(r["split"], {"cases": 0, "matched": 0, "false_fast": 0})
        b["cases"] += 1
        b["matched"] += 1 if r["decision"]["route"] == r["expected"] else 0
        b["false_fast"] += 1 if (r["decision"]["route"] in FAST_REPLY_ROUTES and r["expected"] == "agent") else 0
    return {k: dict(v, accuracy=round(v["matched"] / v["cases"], 4)) for k, v in sorted(out.items())}


# --- управляемые сбои --------------------------------------------------------

def run_faults(matrix, corpus_version, policy_version):
    """Прогоняет матрицу сбоев через стаб и отдаёт строки и события.

    Отдельный путь, а не флаг у run(): у сбоя нет «ожидаемого маршрута» — проверяется
    технический исход, и проверить его тем же счётчиком маршрутов было бы ложью.
    """
    source = FaultStub(os.path.join(HERE, "fault-scenarios.v1.json"))
    rows, events = [], []
    for sc in matrix["scenarios"]:
        d = source.decide(sc)
        event = {
            "event": "routing.decision",
            "decisionId": f"{corpus_version}:{source.name}:{sc['id']}",
            "corpusCase": sc["id"],
            "corpusVersion": corpus_version,
            "source": source.name,
            "policyVersion": policy_version,
            "route": d["route"], "mode": d["mode"], "reasonCode": d["reasonCode"],
            "needsExecutor": d["needsExecutor"], "schemaOutcome": d["schemaOutcome"],
            "semanticOutcome": d["semanticOutcome"], "coverage": d["coverage"],
            "modelCalls": d["modelCalls"], "latencyMs": d["latencyMs"],
            "usageSource": d["usageSource"], "escalationAttempt": d["escalationAttempt"],
            "firstUsefulReplyMs": d["firstUsefulReplyMs"], "outcome": d["outcome"],
            "continuationRef": None, "jobRef": None, "runRef": None,
            "fault": sc["fault"], "repairAttempts": d["repairAttempts"],
            "technicalCode": d["technicalCode"],
        }
        events.append(event)
        events.append({
            "event": "technical_error",
            "decisionId": event["decisionId"],
            "corpusCase": sc["id"],
            "code": d["technicalCode"],
            "outcome": d["outcome"],
            "escalationAttempt": d["escalationAttempt"],
        })
        rows.append({"case": sc["id"], "fault": sc["fault"], "expected": None,
                     "split": "fault", "class": "fault", "decision": d, "event": event})
    return rows, events


def fault_violations(matrix, rows):
    """Сверяет стаб с внешней матрицей ожиданий.

    Ожидания лежат в данных (`fault-scenarios.v1.json`), а не в коде стаба, иначе
    проверка сравнивала бы функцию с собой (AC-19).
    """
    by = {r["case"]: r for r in rows}
    violations = []
    for sc in matrix["scenarios"]:
        row = by.get(sc["id"])
        if row is None:
            violations.append(f"{sc['id']}: стаб не выдал решение")
            continue
        d = row["decision"]
        for key in ("outcome", "technicalCode", "modelCalls", "repairAttempts",
                    "escalationAttempt", "needsExecutor", "schemaOutcome", "route"):
            if key in sc["expect"] and d.get(key) != sc["expect"][key]:
                violations.append(
                    f"{sc['id']}: {key}={d.get(key)!r}, ожидалось {sc['expect'][key]!r}")
        if d["escalationAttempt"] or d["needsExecutor"] or d["route"] == "agent":
            violations.append(f"{sc['id']}: технический сбой дошёл до исполнителя")
    return violations


def load_fault_matrix():
    return read_json(os.path.join(HERE, "fault-scenarios.v1.json"))


def review_gate(ledger, anchors):
    """Сколько строк живых логов доведено до разметки (AC-132).

    Только `human_reviewed` — истина. `model_reviewed` — кандидат на подтверждение,
    `unreviewed` — сырьё. Ни один из них не повышает уверенность метрик.
    """
    counts = {}
    for row in ledger:
        counts[row["review"]] = counts.get(row["review"], 0) + 1
    anchors_ids = {a["sampleId"] for a in anchors}
    missing = anchors_ids - {r["sampleId"] for r in ledger}
    return {
        "anchors": len(anchors),
        "ledger_rows": len(ledger),
        "unreviewed": counts.get("unreviewed", 0),
        "model_reviewed": counts.get("model_reviewed", 0),
        "human_reviewed": counts.get("human_reviewed", 0),
        "rejected": counts.get("rejected", 0),
        "anchors_without_ledger_row": len(missing),
        "ground_truth_available": counts.get("human_reviewed", 0) > 0,
        "route_accuracy_from_anchors": None,
        "note": "метрики по anchors.external считаются только по human_reviewed; сейчас таких строк нет",
    }


def default_sources():
    out = []
    legacy = os.path.join(HERE, "decisions", "legacy-shadow-baseline.v1.jsonl")
    if os.path.exists(legacy):
        out.append(ScriptedSource("legacy-shadow-baseline", legacy))
    return out


def main(argv):
    if len(argv) != 1:
        print("использование: run_eval.py [--sources name1,name2 ...]", file=sys.stderr)
        return 2
    manifest = load_manifest()
    dialogs = load_corpus()
    sources = default_sources()
    if not sources:
        print("нет источников решений в decisions/", file=sys.stderr)
        return 1
    report = {
        "corpus": manifest["corpus"],
        "corpusVersion": manifest["version"],
        "policyVersion": manifest["policyVersion"],
        "cases": len(dialogs),
        "sources": {},
    }
    for src in sources:
        rows, events = run(dialogs, src, manifest["version"], manifest["policyVersion"])
        if getattr(src, "missing", None):
            print(f"СТОП: {src.name}: нет записанного решения для {', '.join(src.missing)}", file=sys.stderr)
            return 1
        report["sources"][src.name] = {
            "metrics": score(rows),
            "byClass": by_class(rows),
            "bySplit": by_split(rows),
            "falseFastCases": [r["case"] for r in rows
                              if r["decision"]["route"] in FAST_REPLY_ROUTES and r["expected"] == "agent"],
            "unnecessaryAgentCases": [r["case"] for r in rows
                                      if r["decision"]["route"] == "agent" and r["expected"] in AGENT_FREE],
            "events": events,
            "missed": [r["case"] for r in rows if r["decision"]["route"] != r["expected"]],
        }
    ledger = load_review_ledger()
    anchors = read_jsonl(os.path.join(HERE, "anchors.external.v1.jsonl"))
    report["reviewGate"] = review_gate(ledger, anchors)
    print(json.dumps(report, ensure_ascii=False, indent=1, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))