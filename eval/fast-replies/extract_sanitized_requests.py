#!/usr/bin/env python3
"""Read-only извлечение обезличенных реплик из сырого выгрузочного файла (P18).

Назначение: превратить приватную выгрузку живых сессий в публикуемое сырьё для
разметки (`anchors.external.v1.jsonl`). Источник только читается; ничего не
дописывается в него и не копируется в репозиторий без проверки фильтров.

Фильтры — те же, что у verify_anchors.py, и применяются fail closed: строка с
любым нарушением отбрасывается целиком, а не «чинится». Отсюда следует, что
нулевой выход — нормальный результат, а не ошибка.

Запуск:
    python3 eval/fast-replies/extract_sanitized_requests.py --in raw.jsonl --out anchors.new.jsonl
    python3 eval/fast-replies/extract_sanitized_requests.py --in raw.jsonl --check   # только отчёт
    python3 eval/fast-replies/extract_sanitized_requests.py --in raw.jsonl --stats   # распределение классов

Класс каждой реплики определяется эвристикой и публикуется как `cls` — это
гипотеза разметки, а не разметка (research §6). Истина появляется только после
human_reviewed в anchor-review.v1.jsonl.
"""
import argparse, collections, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify_anchors as va  # noqa: E402  — единый набор фильтров, не копия

# Эвристика класса. Намеренно консервативна: не распознано -> other_or_unclear.
# Спорные случаи обязаны попасть в ручное ревью, а не в уверенную метку.
CLASS_RULES = [
    ("capability_question", re.compile(r"\b(умеешь|можешь|что ты умеешь|help|помощь)\b", re.I)),
    ("progress_check", re.compile(r"\b(что там|готов|статус|как дела|сколько осталось|где мы)\b", re.I)),
    ("text_transform", re.compile(r"\b(перепиши|сократи|короче|оформи|переведи|таблицей)\b", re.I)),
    ("connect_instruction", re.compile(r"\b(подключи|настрой|интеграц|авториз|логин|токен)\b", re.I)),
    ("effect_action", re.compile(r"\b(создай|опубликуй|отправь|найди|запусти|сгенери)\b", re.I)),
    ("continue_short_reply", re.compile(r"^(да|давай|ок|ага|продолжай|го|yes|ok)[.! ]*$", re.I)),
    ("greeting_or_ack", re.compile(r"^(привет|здравствуй|спасибо|благодарю|добрый)\b", re.I)),
]


def classify(text):
    for cls, rx in CLASS_RULES:
        if rx.search(text):
            return cls
    return "other_or_unclear"


def read_rows(path):
    with open(path, encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield n, json.loads(line)
            except ValueError as exc:
                yield n, {"__error__": str(exc)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True, help="сырая выгрузка JSONL (только чтение)")
    ap.add_argument("--out", dest="dst", help="куда писать обезличенные строки")
    ap.add_argument("--check", action="store_true", help="только отчёт, без записи")
    ap.add_argument("--stats", action="store_true", help="распределение классов после фильтров")
    args = ap.parse_args()

    if not os.path.exists(args.src):
        print(f"нет файла: {args.src}", file=sys.stderr)
        return 2
    if args.dst and os.path.abspath(args.dst) == os.path.abspath(args.src):
        print("СТОП: --out совпадает с --in, источник только читается", file=sys.stderr)
        return 2

    kept, dropped, seen, classes = [], collections.Counter(), set(), collections.Counter()
    for n, row in read_rows(args.src):
        if "__error__" in row:
            dropped[f"строка {n}: не JSON"] += 1
            continue
        text = " ".join(str(row.get("text", "")).split())
        group = str(row.get("group", ""))
        problems = va.violations(text, group)
        if problems:
            dropped["; ".join(sorted(set(problems)))] += 1
            continue
        key = re.sub(r"\s+", " ", text.lower())
        if key in seen:
            dropped["дубль текста"] += 1
            continue
        seen.add(key)
        cls = classify(text)
        classes[cls] += 1
        kept.append({
            "cohort": row.get("cohort", "EXT-OTHER"),
            "group": group,
            "cls": cls,
            "chars": len(text),
            "text": text,
            "has_media": bool(row.get("has_media")),
            "sampleId": row.get("sampleId") or f"R-{group}-{n:06d}",
        })

    print(f"на входе строк: {sum(dropped.values()) + len(kept)}")
    print(f"прошло фильтров: {len(kept)}")
    print(f"отброшено: {sum(dropped.values())}")
    for reason, n in dropped.most_common():
        print(f"  - {n:4d}  {reason}")
    if args.stats or not args.check:
        print("классы (эвристика, не разметка):", dict(classes.most_common()))

    if args.dst and not args.check:
        d = os.path.dirname(os.path.abspath(args.dst))
        if d and not os.path.isdir(d):
            os.makedirs(d, exist_ok=True)
        with open(args.dst, "w", encoding="utf-8") as fh:
            for r in kept:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"записано: {args.dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
