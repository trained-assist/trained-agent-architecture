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
 4. любой латинский токен длиной >=4 должен быть в ALLOW (публичные интеграции).
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
LATIN = re.compile(r"[A-Za-z][A-Za-z0-9_-]{3,}")


def main() -> int:
    if not os.path.exists(FILE):
        print(f"нет файла: {FILE}")
        return 1
    rows = [json.loads(l) for l in open(FILE, encoding="utf-8")]
    errors, seen = [], set()
    for n, r in enumerate(rows, 1):
        i = r.get("sampleId", f"строка {n}")
        t = " ".join(r.get("text", "").split())
        if not r.get("group", "").startswith("EXT"):
            errors.append(f"{i}: не внешняя когорта ({r.get('group')})")
        if IDENTITY.search(t):
            errors.append(f"{i}: маркер идентичности (путь/@/URL/e-mail)")
        if BLOCKLIST.search(t):
            errors.append(f"{i}: персональные данные или бренд из blocklist")
        for tok in LATIN.findall(t):
            if tok.lower() not in ALLOW:
                errors.append(f"{i}: латинский токен вне ALLOW: {tok}")
        if not 8 <= len(t) <= 200:
            errors.append(f"{i}: длина {len(t)} вне 8..200")
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