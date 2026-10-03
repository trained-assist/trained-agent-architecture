#!/usr/bin/env python3
"""Проверка корпуса быстрых ответов: схема, уникальность ID, ссылки на истории и файлы,
версия корпуса (хэши манифеста) и гейт разметки живых логов (AC-132).

Запуск:
    python3 eval/fast-replies/check.py              # проверка
    python3 eval/fast-replies/check.py --manifest   # пересобрать хэши и счётчики

Без зависимостей."""
import hashlib, json, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ROUTES = {"template", "deterministic", "llm", "agent", "clarify", "required_input"}
SPLITS = {"dev", "holdout"}
REVIEW_TIERS = {"unreviewed", "model_reviewed", "human_reviewed", "rejected"}
# Профильные данные: e-mail, телефон, абсолютный путь, имена профилей владельца.
# В корпусе их быть не должно — это проверяемый пункт AC-132, а не обещание.
# Зарезервированные домены RFC 2606 исключены: они легитимны в синтетических фикстурах.
PROFILE_MARKERS = [
    re.compile(r"[\w.+-]+@(?!(?:example\.(?:com|org|net|io|ru)|localhost)\b)[\w-]+\.[\w.]+"),
    re.compile(r"(?<!\d)(?:\+7|8)\d{10}(?!\d)"),
    re.compile(r"/home/|/Users/"),
    re.compile(r"trained-assist-product-owner|vladimir|kobzev", re.I),
]
stories = set(re.findall(r"^### ((?:U|API|OPS|DEV)-\d+)", "".join(
    open(os.path.join(ROOT, "stories", f)).read() for f in os.listdir(os.path.join(ROOT, "stories")) if f.endswith(".md")), re.M))


def refs(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, str) and (k == "ref" or k.endswith("_ref")): yield v
            else: yield from refs(v)
    elif isinstance(o, list):
        for v in o: yield from refs(v)


def read_jsonl(path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""): h.update(chunk)
    return h.hexdigest()


def _run():
    errors, seen = [], set()

    # --- 1. корпус ---------------------------------------------------------
    dialogs = read_jsonl(os.path.join(HERE, "dialogs.v1.jsonl"))
    for n, r in enumerate(dialogs, 1):
        i = r.get("id", f"строка {n}")
        for k in ("id", "class", "route", "split", "story", "turns", "expect"):
            if k not in r: errors.append(f"{i}: нет поля {k}")
        if i in seen: errors.append(f"{i}: дубль ID")
        seen.add(i)
        if r.get("route") not in ROUTES: errors.append(f"{i}: неизвестный route {r.get('route')}")
        if r.get("split") not in SPLITS: errors.append(f"{i}: неизвестный split {r.get('split')}")
        if not r.get("turns"): errors.append(f"{i}: пустые turns")
        ex = r.get("expect", {})
        if not ex.get("must") or not ex.get("must_not"): errors.append(f"{i}: expect без must/must_not")
        if r.get("route") in {"template", "deterministic"} and ex.get("max_model_calls", 0) > 1:
            errors.append(f"{i}: {r['route']} не может требовать больше одного вызова модели")
        for s in r.get("story", []):
            if s not in stories: errors.append(f"{i}: нет истории {s} в stories/")
    for p in refs(r):
        if not os.path.exists(os.path.join(HERE, p)): errors.append(f"{i}: нет файла {p}")

    # Профильные данные в корпусе не публикуются (AC-132). Проверяемо, а не обещано:
    # e-mail, телефон, абсолютный путь и имена профилей владельца в текстах запрещены.
    blob = json.dumps(r, ensure_ascii=False)
    for marker in PROFILE_MARKERS:
        if marker.search(blob):
            errors.append(f"{i}: профильные данные в корпусе: {marker.pattern}")

    # --- 2. версия корпуса -------------------------------------------------
    manifest_path = os.path.join(HERE, "corpus.manifest.json")
    if not os.path.exists(manifest_path):
        errors.append("нет corpus.manifest.json: корпус не версионирован")
        manifest = {}
    else:
        manifest = json.load(open(manifest_path, encoding="utf-8"))
        for rel, spec in manifest.get("files", {}).items():
            p = os.path.join(HERE, rel)
            if not os.path.exists(p):
                errors.append(f"манифест: нет файла {rel}")
                continue
            if "sha256" in spec and sha256(p) != spec["sha256"]:
                errors.append(f"манифест: {rel} изменён, хэш не совпал — пересобери манифест и подними версию при смене формата")
            if "records" in spec and rel.endswith(".jsonl") and len(read_jsonl(p)) != spec["records"]:
                errors.append(f"манифест: в {rel} {len(read_jsonl(p))} строк, в манифесте {spec['records']}")
        if manifest.get("files", {}).get("dialogs.v1.jsonl", {}).get("records") != len(dialogs):
            errors.append("манифест: число диалогов разошлось с корпусом")

    # --- 3. гейт разметки живых логов (AC-132) -----------------------------
    anchors = read_jsonl(os.path.join(HERE, "anchors.external.v1.jsonl"))
    ledger = read_jsonl(os.path.join(HERE, "anchor-review.v1.jsonl"))
    by_id = {}
    for n, r in enumerate(ledger, 1):
        i = r.get("sampleId", f"строка {n}")
        if i in by_id: errors.append(f"реестр разметки: дубль sampleId {i}")
        by_id[i] = r
        if r.get("review") not in REVIEW_TIERS:
            errors.append(f"реестр разметки {i}: неизвестный уровень {r.get('review')}")
        if r.get("review") == "human_reviewed":
            for k in ("reviewer", "reviewedAt", "labelRoute"):
                if not r.get(k):
                    errors.append(f"реестр разметки {i}: human_reviewed без {k}")
        if r.get("review") in {"unreviewed", "rejected"} and r.get("labelRoute"):
            errors.append(f"реестр разметки {i}: уровень {r['review']} не может нести labelRoute")
    anchor_ids = {a["sampleId"] for a in anchors}
    missing = anchor_ids - set(by_id)
    if missing:
        errors.append(f"реестр разметки: {len(missing)} якорей без строки реестра (первый: {sorted(missing)[0]})")
    extra = set(by_id) - anchor_ids
    if extra:
        errors.append(f"реестр разметки: {len(extra)} строк без якоря (первый: {sorted(extra)[0]})")
    counts = collections.Counter(r.get("review") for r in ledger)
    declared = manifest.get("reviewLedger", {}).get("counts", {})
    for tier, n in counts.items():
        if declared.get(tier) != n:
            errors.append(f"манифест: в реестре {tier}={n}, в манифесте {declared.get(tier)}")

    # --- 4. baseline-решения -----------------------------------------------
    decisions = read_jsonl(os.path.join(HERE, "decisions", "legacy-shadow-baseline.v1.jsonl"))
    if {d["case"] for d in decisions} != {d["id"] for d in dialogs}:
        errors.append("baseline-решения: набор кейсов не совпадает с корпусом")
    for d in decisions:
        if d.get("route") not in ROUTES:
            errors.append(f"baseline {d['case']}: неизвестный route {d.get('route')}")
        if not d.get("evidence"):
            errors.append(f"baseline {d['case']}: нет evidence — решение не аудируемо")

    # --- 5. матрица сбоев --------------------------------------------------
    matrix = json.load(open(os.path.join(HERE, "fault-scenarios.v1.json"), encoding="utf-8"))
    for sc in matrix.get("scenarios", []):
        for k in ("id", "fault", "expect"):
            if k not in sc: errors.append(f"матрица сбоев: сценарий без {k}")
        if not sc.get("expect", {}).get("must") or not sc.get("expect", {}).get("must_not"):
            errors.append(f"матрица сбоев {sc.get('id')}: expect без must/must_not")

    if errors:
        print("\n".join(errors))
        return 1
    print(f"ok: {len(seen)} диалогов, корпус v{manifest.get('version')}, "
          f"якорей {len(anchors)} (human_reviewed={counts.get('human_reviewed', 0)}), "
          f"baseline-решений {len(decisions)}, сценариев сбоя {len(matrix.get('scenarios', []))}")
    return 0


def rebuild_manifest():
    """Пересобирает хэши и счётчики манифеста. Запуск: check.py --manifest."""
    path = os.path.join(HERE, "corpus.manifest.json")
    m = json.load(open(path, encoding="utf-8"))
    counts = {"unreviewed": 0, "model_reviewed": 0, "human_reviewed": 0, "rejected": 0}
    for r in read_jsonl(os.path.join(HERE, "anchor-review.v1.jsonl")):
        counts[r["review"]] = counts.get(r["review"], 0) + 1
    for rel, spec in m.get("files", {}).items():
        p = os.path.join(HERE, rel)
        if not os.path.exists(p):
            print(f"нет файла {rel}", file=sys.stderr)
            return 1
        spec["sha256"] = sha256(p)
        if rel.endswith(".jsonl"):
            spec["records"] = len(read_jsonl(p))
        elif rel.endswith(".json"):
            doc = json.load(open(p, encoding="utf-8"))
            if isinstance(doc, dict):
                spec["scenarios"] = len(doc.get("scenarios", []))
    m["reviewLedger"]["counts"] = counts
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(m, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"манифест пересобран: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(rebuild_manifest() if "--manifest" in sys.argv else _run())
