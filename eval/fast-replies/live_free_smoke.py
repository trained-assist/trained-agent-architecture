#!/usr/bin/env python3
"""Live free smoke на бесплатной модели — ОТДЕЛЬНО от детерминированных проверок.

     python3 eval/fast-replies/live_free_smoke.py --yes-live --cases FR-050,FR-052,FR-054

Зачем: детерминированный стенд (`run_eval.py`) проверяет оркестрацию и технические
исходы, но не поведение живой модели. Этот скрипт — единственное место, где
реальный вызов модели влияет на результат, поэтому он:

  - не запускается без явного `--yes-live` и не входит в CI;
  - работает только с free-only профилем, автоматический paid fallback выключен;
  - не пишет измеренные решения в корпус и не считает их ground truth;
  - не логирует ключ, промпт и сырой ответ целиком;
  - ограничен числом кейсов и суммарным числом вызовов.

Переменные окружения (только из окружения, никогда из репозитория):
    FASTPATH_LIVE_BASE_URL, FASTPATH_LIVE_API_KEY, FASTPATH_LIVE_MODEL
"""
import argparse, json, os, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import harness  # noqa: E402

MAX_CASES = 12
MAX_CALLS = 20
TIMEOUT_S = 30

FIDELITY = """## Fidelity declaration (AC-06)

- Проверяется выбор маршрута живой бесплатной моделью на заданном срезе корпуса.
- Внешние эффекты отсутствуют: модель получает только текст реплики и контекст кейса,
  инструментов и сети у неё нет. Это НЕ проверка облачной эксплуатации.
- Результат НЕ является ground truth и не публикуется в корпус: один прогон модели
  не доказывает стабильность выбора.
- Локальный/офлайн PASS этим скриптом не называется проверкой прода.
"""


def call_model(base_url, key, model, prompt, timeout):
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}],
                       "temperature": 0, "max_tokens": 256}).encode()
    req = urllib.request.Request(base_url.rstrip("/") + "/chat/completions", data=body, method="POST",
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def build_prompt(dialog):
    turns = "\n".join(f"{t['role']}: {t.get('text', '[вложение]')}" for t in dialog["turns"])
    ctx = json.dumps({k: v for k, v in dialog.get("context", {}).items() if k != "clock"},
                     ensure_ascii=False)
    return (
        "Ты — роутер быстрых ответов. Выбери ровно один маршрут из: "
        "template, deterministic, llm, clarify, required_input, agent.\n"
        "Правило: быстрый ответ никогда не выдумывает данные. Нет данных в реплике или "
        "в системе — это agent, clarify или required_input, а не ответ из памяти модели.\n"
        f"Контекст системы: {ctx}\nДиалог:\n{turns}\n\n"
        "Ответь одним JSON-объектом без пояснений: "
        '{"route": "...", "reasonCode": "...", "needsExecutor": true|false}'
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes-live", action="store_true", help="явное подтверждение живого прогона")
    ap.add_argument("--cases", default="FR-050,FR-052,FR-054", help="срез корпуса через запятую")
    ap.add_argument("--out", default=os.path.join(HERE, "..", "..", "_scratch", "live-smoke.jsonl"),
                    help="куда писать измеренные решения (вне корпуса)")
    args = ap.parse_args()

    if not args.yes_live:
        print("СТОП: живой прогон требует явного --yes-live. Детерминированные проверки: "
              "python3 eval/fast-replies/selfcheck.py", file=sys.stderr)
        return 2

    base = os.environ.get("FASTPATH_LIVE_BASE_URL")
    key = os.environ.get("FASTPATH_LIVE_API_KEY")
    model = os.environ.get("FASTPATH_LIVE_MODEL")
    if not (base and key and model):
        print("СТОП: нужны FASTPATH_LIVE_BASE_URL, FASTPATH_LIVE_API_KEY и FASTPATH_LIVE_MODEL "
              "в окружении. Значения не читаются из репозитория и не пишутся в логи.", file=sys.stderr)
        return 2

    dialogs = {d["id"]: d for d in harness.load_corpus()}
    ids = [c for c in args.cases.split(",") if c]
    unknown = [c for c in ids if c not in dialogs]
    if unknown:
        print(f"СТОП: нет кейсов в корпусе: {', '.join(unknown)}", file=sys.stderr)
        return 2
    if len(ids) > MAX_CASES:
        print(f"СТОП: больше {MAX_CASES} кейсов за прогон (free-only профиль, AC-12)", file=sys.stderr)
        return 2

    print(FIDELITY)
    print(f"кейсов: {len(ids)} · модель: {model} · лимит вызовов: {MAX_CALLS} · таймаут: {TIMEOUT_S} с")
    print()

    out_rows, calls = [], 0
    for cid in ids:
        d = dialogs[cid]
        prompt = build_prompt(d)
        t0 = time.monotonic()
        try:
            resp = call_model(base, key, model, prompt, TIMEOUT_S)
            latency = round((time.monotonic() - t0) * 1000)
            calls += 1
            content = resp["choices"][0]["message"]["content"]
            parsed = json.loads(content[content.find("{"):content.rfind("}") + 1])
            row = {"case": cid, "expected": d["route"], "split": d["split"],
                   "route": parsed.get("route"), "reasonCode": parsed.get("reasonCode"),
                   "needsExecutor": parsed.get("needsExecutor"),
                   "modelCalls": 1, "latencyMs": latency, "usageSource": "measured",
                   "evidenceKind": "live-run", "uncertain": False}
        except (urllib.error.URLError, ValueError, KeyError, json.JSONDecodeError) as exc:
            row = {"case": cid, "expected": d["route"], "split": d["split"],
                   "route": None, "reasonCode": "LIVE_CALL_FAILED", "needsExecutor": None,
                   "modelCalls": 1 if calls < MAX_CALLS else 0, "latencyMs": None,
                   "usageSource": "not_recorded", "evidenceKind": "live-run", "uncertain": True,
                   "errorType": type(exc).__name__}
        row["match"] = row["route"] == d["route"]
        out_rows.append(row)
        print(f"  {cid}: expected={d['expected'] if 'expected' in d else d['route']} "
              f"got={row['route']} match={row['match']} {row['latencyMs']} мс")
        if calls >= MAX_CALLS:
            print(f"достигнут лимит {MAX_CALLS} вызовов, остальные кейсы не запускались")
            break

    m = harness.score([{"case": r["case"], "expected": r["expected"], "split": r["split"],
                        "class": dialogs[r["case"]]["class"], "decision": r} for r in out_rows])
    print()
    print(f"верных маршрутов: {m['route_matches']}/{m['cases']} = {m['route_accuracy']}")
    print(f"false-fast: {m['false_fast']} · unnecessary-agent: {m['unnecessary_agent']}")
    print(f"задержка p50/p95: {m['latency_p50_ms']}/{m['latency_p95_ms']} мс · "
          f"вызовов модели: {m['model_calls_total']}")
    print()
    print("Это измерение одного прогона на бесплатной модели. Оно не публикуется в корпус, "
          "не является ground truth и не доказывает стабильность выбора.")

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        for r in out_rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"измеренные решения (вне корпуса): {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
