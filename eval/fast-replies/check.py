#!/usr/bin/env python3
"""Проверка корпуса быстрых ответов: схема, уникальность ID, ссылки на истории и файлы.
Запуск: python3 eval/fast-replies/check.py (без зависимостей)."""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ROUTES = {"template", "deterministic", "llm", "agent", "clarify", "required_input"}
SPLITS = {"dev", "holdout"}
stories = set(re.findall(r"^### ((?:U|API|OPS|DEV)-\d+)", "".join(
    open(os.path.join(ROOT, "stories", f)).read() for f in os.listdir(os.path.join(ROOT, "stories")) if f.endswith(".md")), re.M))
errors, seen = [], set()
def refs(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, str) and (k == "ref" or k.endswith("_ref")): yield v
            else: yield from refs(v)
    elif isinstance(o, list):
        for v in o: yield from refs(v)
for n, line in enumerate(open(os.path.join(HERE, "dialogs.v1.jsonl")), 1):
    try: r = json.loads(line)
    except ValueError as e: errors.append(f"строка {n}: не JSON ({e})"); continue
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
if errors:
    print("\n".join(errors)); sys.exit(1)
print(f"ok: {len(seen)} диалогов")
