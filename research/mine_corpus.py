import json, glob, os, re, collections, datetime

BASE = "/home/vova/users"
OWNER = {"vova","vovako","vova-codex","vova-recruiter","vova-self-employment","vova-and-egor",
         "kobzevvv","trained-assist-product-owner","__probe__","playbooks-e2e","webqa","web-canary",
         "99999","u1","zemtest","iso-smoke","hh-bg-test-77777","sar-proxy","web-canary","webqa","playbooks-e2e","__probe__","recruiter"}
# domain hints from profile folder names -> cohort label (no real names kept in output)
RECRUIT = {"mbk_luda_recruiter","tes-recruiter","hr-gardeners","vova-recruiter","recruiter","sar-proxy"}
FREEL   = {"flexi-consult","flexi","aleksandrl-iquarus"}

# ---------- redaction ----------
URL   = re.compile(r"https?://\S+|www\.\S+")
MAIL  = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
HAND  = re.compile(r"@\w+")
PHONE = re.compile(r"(?<!\d)(?:\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)")
DIGITS= re.compile(r"\b\d{5,}\b")
DOCID = re.compile(r"\b[0-9A-Za-z_-]{25,}\b")
CAPCY = re.compile(r"\b[А-ЯЁ][а-яё]{2,}\b")   # Cyrillic capitalised word mid-text -> likely a name
CAPLAT= re.compile(r"\b[A-Z][a-z]{2,}\b")

def redact(t):
    t = URL.sub("<URL>", t)
    t = MAIL.sub("<EMAIL>", t)
    t = HAND.sub("<HANDLE>", t)
    t = PHONE.sub("<PHONE>", t)
    t = DOCID.sub("<ID>", t)
    t = DIGITS.sub("<NUM>", t)
    t = CAPCY.sub("<NAME>", t)
    t = CAPLAT.sub("<NAME>", t)
    return t

# ---------- minimal-sufficient-path heuristics (heuristic labels, not ground truth) ----------
def classify(t):
    s = t.strip().lower()
    n = len(t)
    if re.fullmatch(r"(да|нет|ок|окей|ага|угу|хорошо|давай|далее|го|продолжай|а|ну|не|все ок|окей понятно)[\s!.…]*", s):
        return "continue_short_reply"
    if re.search(r"^(статус|status|что делаешь|чем занят|ты тут|ты на месте)\b", s) or s in ("статус?", "статус"):
        return "service_status"
    if re.search(r"\b(что умеешь|что ты умеешь|умеешь|ты умеешь|какие у тебя|возможности|что у тебя есть|как ты умеешь)\b", s) or s.startswith("/help"):
        return "capability_question"
    if re.search(r"\b(подключ|настрой|авторизуй|залогинь|привяжи|интегр)\w*", s) and n < 220:
        return "connect_instruction"
    if re.search(r"\b(статус|готов|пришл|отправил|получил|сделан|работает)\b", s) and n < 160:
        return "progress_check"
    if re.search(r"\b(какое число|какая дата|через \d|сколько дней|до пятницы|дедлайн|назначь|поставь напомин)\b", s):
        return "date_or_schedule"
    if re.search(r"\b(перепиши|сократи|убери|исправь ошибк|переведи|оформи|выдели|структур)\w*", s) and n < 400:
        return "text_transform"
    if re.search(r"^(создай|опубликуй|удали|отправь|заполни|задай|добавь|найди|поищи|установи|найди вакансии)\b", s):
        return "effect_action"
    if len(s) <= 3 and s.isdigit():
        return "menu_choice_number"
    if re.search(r"\b(сделай|собери|подготовь|презентац|резюме|документ|отчёт|отчет|таблиц|слайд|коммерц|письм|прелож|анализ|разбор|тз|бриф)\w*", s):
        return "content_work"
    if re.search(r"^(привет|здравствуй|добрый|хай|спасибо|ок|спс)\b", s) and n < 60:
        return "greeting_or_ack"
    return "other_or_unclear"

def load(profile):
    out = []
    for f in sorted(glob.glob(f"{BASE}/{profile}/sessions/*.json")):
        try: d = json.load(open(f))
        except Exception: continue
        if isinstance(d, list):
            msgs, meta = d, {}
        elif isinstance(d, dict):
            msgs, meta = d.get("messages") or [], d
        else:
            continue
        for m in msgs:
            if isinstance(m, dict) and m.get("role") == "user":
                c = m.get("content")
                if isinstance(c, str) and c.strip():
                    out.append({"session": os.path.basename(f)[:-5], "text": c,
                                "project": meta.get("projectId"), "at": m.get("at")})
    return out

rows, stats = [], collections.Counter()
profiles = sorted(p for p in os.listdir(BASE) if os.path.isdir(f"{BASE}/{p}"))
pidx = {}
for p in profiles:
    if not os.path.exists(f"{BASE}/{p}/sessions.json"): continue
    owner = p in OWNER
    if owner: cohort = "OWN"
    elif p in RECRUIT: cohort = "EXT-REC"
    elif p in FREEL: cohort = "EXT-FREEL"
    else: cohort = "EXT-OTHER"
    if not (owner or cohort.startswith("EXT")): continue
    turns = load(p)
    if not turns: continue
    idx = len([k for k in pidx if pidx[k] == cohort]) + 1
    pid = f"{cohort}-{idx:02d}"
    pidx[cohort] = pid
    for i, t in enumerate(turns):
        raw = t["text"]
        short = raw.strip()[:400]
        if not short or re.match(r"^(newer|old|test)\b", short, re.I): continue
        if len(short) < 2: continue
        cls = classify(short)
        stats[(cohort, cls)] += 1
        stats[(cohort, "__turns")] += 1
        rows.append({"cohort": cohort, "group": pid, "cls": cls, "chars": len(raw),
                     "text": redact(short),
                     "has_media": ("[Файл сохн" in raw or "[Файл" in raw or "transcript-" in raw or "[голосовое" in raw or "[Распознано" in raw),
                     "at": t.get("at")})

# ---------- output ----------
os.makedirs("/tmp/router-corpus", exist_ok=True)
with open("/tmp/router-corpus/anonymized-turns.jsonl", "w") as fh:
    for r in rows:
        r["sampleId"] = f"R-{r['cohort']}-{abs(hash(r['text'])) % 10**7:07d}"
        del r["at"]
        fh.write(json.dumps(r, ensure_ascii=False) + "\n")

print("=== cohort totals ===")
coh = collections.Counter()
for (c, cls), n in stats.items():
    if cls != "__turns": coh[c] += n
for c, n in sorted(coh.items()): print(f"{c:10} turns={n}")
print()
print("=== class x cohort ===")
classes = sorted({cls for (_, cls) in stats if cls != "__turns"})
cohorts = sorted(coh)
print(f"{'class':22}" + "".join(f"{c:>12}" for c in cohorts) + f"{'ALL':>10}")
tot = collections.Counter()
for (c, cls), n in stats.items():
    if cls != "__turns": tot[cls] += n
for cls in classes:
    row = [stats.get((c, cls), 0) for c in cohorts]
    print(f"{cls:22}" + "".join(f"{v:>12}" for v in row) + f"{tot[cls]:>10}")
print(f"{'TOTAL':22}" + "".join(f"{coh[c]:>12}" for c in cohorts) + f"{sum(coh.values()):>10}")

# media / short-turn profile for external users
ext = [r for r in rows if r["cohort"].startswith("EXT")]
own = [r for r in rows if r["cohort"] == "OWN"]
def prof(name, rs):
    if not rs: return
    le = sum(1 for r in rs if r["chars"] <= 40)
    med = sorted(r["chars"] for r in rs)[len(rs)//2]
    print(f"{name}: n={len(rs)} short<=40chars={le} ({le*100//len(rs)}%) median_chars={med} with_media={sum(1 for r in rs if r['has_media'])}")
print()
prof("external", ext); prof("owner", own)
print()
print("=== fast-path-looking short turns (external), up to 40 samples ===")
seen = set(); shown = 0
for r in ext:
    if r["chars"] > 90: continue
    k = (r["group"], r["cls"], r["text"][:40])
    if k in seen: continue
    seen.add(k); shown += 1
    if shown > 40: break
    print(f"  [{r['cls']:20}] {r['text'][:88]!r}")