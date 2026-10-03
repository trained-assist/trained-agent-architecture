#!/usr/bin/env python3
"""Проверка обезличенности anchors.external.v1.jsonl.

Файл — сырьё для разметки, собранное из живых сессий внешних пользователей.
Публикуется он только потому, что прошёл эти фильтры; проверка выполняет их повторно,
поэтому анонимность файла проверяема, а не обещана.

Запуск: python3 eval/fast-replies/verify_anchors.py   (зависимостей нет)

Проверяемые фильтры опубликованного набора:
  1. только внешние когорты (EXT-*); сессии владельца не публикуются;
  2. в тексте не должно быть путей, @handle, URL и e-mail;
  3. не должно быть персональных данных и названий чужих брендов из blocklist;
  4. любой латинский токен длиной >=4 должен быть в ALLOW (публичные интеграции);
  5. не должно быть значений секретов и российских телефонных номеров;
  6. длина 8..200 и отсутствие дублей текста.
Нулевой результат проверки не доказывает, что человек не опознан, — это нижняя граница.
"""
import json, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
FILE = os.path.join(HERE, "anchors.external.v1.jsonl")

ALLOW = {
    "github", "gitlab", "tilda", "zoom", "getcourse", "zerocreds", "openai", "anthropic", "claude",
    "codex", "opencode", "gemini", "deepseek", "cursor", "notion", "figma", "google", "telegram",
    "avito", "wildberries", "ozon", "sber", "tbank", "sberbank", "python", "excel", "word", "pdf",
    "pptx", "docx", "csv", "json", "sql", "html", "css", "api", "url", "http", "https", "gmail",
    "mail", "cloudflare", "linear", "supabase", "mcp", "rest", "cron", "webhook", "airtable",
    "hubspot", "amo", "bitrix", "aws", "gcp", "jwt", "oauth", "uuid", "key", "token", "sdk", "pr",
}
IDENTITY = re.compile(r"/home/|@|https?://|[\w.+-]+@[\w-]+\.[\w.]+")
BLOCKLIST = re.compile(
    r"дата рождения|паспорт|номер телефона|фамили[яию]|мо[яё] имя|зовут|"
    r"\bалеси\b|\bалекса\b|\bефи\b|\bкинескоп\b|\bпилингов|\bпедикир|\bгеткурс|\bgetcourse\b|"
    r"\bzoom\b|\bтильд|\btilda\b|zerocreds|зерокредс", re.I)
# Значения секретов: префиксы известных провайдеров и присваивания вида token=… / api_key: ….
# Слово «token» само по себе легально (оно в ALLOW) — ловим только присваивание значения.
SECRET = re.compile(
    r"sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,}|github_pat_|AIza[0-9A-Za-z_-]{20,}|"
    r"xox[baprs]-|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|"
    r"\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+|"
    r"bearer\s+[A-Za-z0-9._~+/=-]{12,}", re.I)
PHONE = re.compile(r"(?<!\d)(?:\+7|8)\d{10}(?!\d)")
LATIN = re.compile(r"[A-Za-z][A-Za-z0-9_-]{3,}")


def violations(text, group="EXT-OTHER-01"):
    """Возвращает список нарушений фильтров для одного текста. Пустая строка — текст прошёл."""
    t = " ".join(text.split())
    out = []
    if not group.startswith("EXT"):
        out.append(f"не внешняя когорта ({group})")
    if IDENTITY.search(t): out.append("маркер идентичности (путь/@/URL/e-mail)")
    if BLOCKLIST.search(t): out.append("персональные данные или бренд из blocklist")
    if SECRET.search(t): out.append("значение секрета")
    if PHONE.search(t): out.append("телефонный номер")
    for tok in LATIN.findall(t):
        if tok.lower() not in ALLOW: out.append(f"латинский токен вне ALLOW: {tok}")
    if not 8 <= len(t) <= 200: out.append(f"длина {len(t)} вне 8..200")
    return out


def main() -> int:
    if not os.path.exists(FILE):
        print(f"нет файла: {FILE}")
        return 1
    rows = [json.loads(l) for l in open(FILE, encoding="utf-8")]
    errors, seen = [], set()
    for n, r in enumerate(rows, 1):
        i = r.get("sampleId", f"строка {n}")
        t = " ".join(r.get("text", "").split())
        for v in violations(t, r.get("group", "")):
            errors.append(f"{i}: {v}")
        key = re.sub(r"\s+", " ", t.lower())
        if key in seen:
            errors.append(f"{i}: дубль текста")
        seen.add(key)
    print(f"строк: {len(rows)}")
    print("группы:", dict(collections.Counter(r.get("group") for r in rows)))
    print("классы:", dict(collections.Counter(r.get("cls") for r in rows)))
    if errors:
        print(f"\nНАРУШЕНИЙ: {len(errors)}")
        for e in errors[:40]:
            print("  -", e)
        return 1
    print("\nнарушений не найдено")
    return 0


if __name__ == "__main__":
    sys.exit(main())