# Parses Destination B1 (Telegram-style list, 12 pages) and B2 (97 pages): "English - Uzbek" lines with wraps, page numbers and ad lines.
import pdfplumber, re, json, collections
SEP = r"\s[-–—]\s"
def page_lines(page):
    words = page.extract_words(keep_blank_chars=True, use_text_flow=False)
    rows = collections.OrderedDict()
    for w in words: rows.setdefault(round(w["top"] / 3), []).append(w)
    H = page.height; out = []
    for k in sorted(rows):
        ws = sorted(rows[k], key=lambda w: w["x0"]); t = " ".join(w["text"] for w in ws).strip()
        if not t: continue
        if re.fullmatch(r"\d{1,3}", t) and ws[0]["top"] > H * 0.85: continue          # page number
        out.append(t)
    return out
AD = re.compile(r"(boost your vocabulary|@destina?t?ion_b1_b2_c1|t\.me/destination|tarjima qilingan|^note:|vocabulary units with translations)", re.I)
def clean_line(t): return re.sub(r"\s+", " ", t.replace("\u00a0", " ")).strip()
SPLIT_MERGED = re.compile(r"(?:(?<=[a-z0-9'’ʻ`\)\.\*\]])|(?<=\s))\s*([A-Z][A-Za-z()/'’ʻ,\[\]\-]{1,40}(?: [A-Za-z()/'’\[\]\-]{1,20}){0,4}?)\s?[-–—]\s?(?=[\w(\.…\"“'ʻ’-])")
def split_merged(en, uz):
    """'Builder - quruvchiBuilding - bino' -> two entries. Only splits where an English-looking Capitalised phrase + ' - ' is glued inside the translation."""
    out = []
    while True:
        m = SPLIT_MERGED.search(uz)
        if not m or re.search(r"[ʻ‘’']\s*[og]\b|[ʻ‘’'][og]", m.group(1)) : break
        out.append((en, uz[:m.start()].strip())); en = m.group(1).strip(); uz = uz[m.end():].strip()
    out.append((en, uz)); return out
def parse_b1(path):
    units, unit, sec, sub, cur = [], None, None, None, None
    def close():
        nonlocal cur
        if cur and unit is not None:
            for en, uz in split_merged(cur["en"], cur["uz"]): unit["items"].append({"en": en, "uz": uz, "sec": cur["sec"]})
        cur = None
    SECS = {"TOPIC VOCABULARY": "Topic vocabulary", "PHRASAL VERBS": "Phrasal verbs", "PREPOSITIONAL PHRASES": "Prepositional phrases", "WORD FORMATION": "Word formation", "WORD PATTERNS": "Word patterns"}
    import subprocess
    txt = subprocess.run(["pdftotext", path, "-"], capture_output=True, text=True).stdout
    raw = [clean_line(l) for l in txt.replace("\f", "\n").split("\n") if clean_line(l)]
    i = 0
    while i < len(raw):
        t = raw[i]; i += 1
        m = re.match(r"^VOCABULARY FROM (\d+) UNIT$", t, re.I)
        if m:
            close(); title = raw[i].title() if i < len(raw) else ""; i += 1
            unit = {"n": int(m.group(1)), "title": title, "items": []}; units.append(unit); sec = None; sub = None; continue
        if unit is None or AD.search(t): continue
        if t.upper() in SECS: close(); sec = SECS[t.upper()]; sub = None; continue
        if re.fullmatch(r"(Adjectives?|Verbs?|Nouns?):", t): close(); sub = t.rstrip(":"); continue
        if re.search(SEP, t) or re.match(r"^\S.*\s[-–—]$", t):
            close(); m2 = re.match(r"^(.+?)\s[-–—](?:\s+(.*))?$", t); cur = {"en": m2.group(1).strip(), "uz": (m2.group(2) or "").strip(), "sec": sec if not sub else f"{sec}: {sub}"}
        elif cur is not None: cur["uz"] = (cur["uz"] + " " + t).strip()
    close(); return units
SEC2 = [("topic", "Topic vocabulary"), ("phrasal", "Phrasal verbs"), ("word_formation", "Word formation"), ("word_pattern", "Word patterns"), ("phrases", "Phrases and collocations"), ("pahrases", "Phrases and collocations"), ("prepositional", "Prepositional phrases")]
def parse_b2(path):
    units, unit, sec, cur = [], None, None, None
    def close():
        nonlocal cur
        if cur and unit is not None:
            for en, uz in split_merged(cur["en"], cur["uz"]): unit["items"].append({"en": en, "uz": uz, "sec": cur["sec"]})
        cur = None
    with pdfplumber.open(path) as pdf:
        raw = [clean_line(l) for p in pdf.pages[3:] for l in page_lines(p)]    # skip cover + table of contents
    i = 0
    while i < len(raw):
        t = raw[i]; i += 1
        m = re.match(r"^Unit (\d+)\.?$", t)
        if m and i < len(raw):
            close(); tt = raw[i]; i += 1; m2 = re.match(r"^(.+?)\s[-–—]\s(.+)$", tt)
            unit = {"n": int(m.group(1)), "title": (m2.group(1) if m2 else tt).strip(), "title_uz": (m2.group(2) if m2 else "").strip(), "items": []}; units.append(unit); sec = None; continue
        if unit is None or AD.search(t): continue
        if t.startswith("#"):
            close(); low = t.lower().replace(" ", "").replace("#", "")
            sec = next((lab for key, lab in SEC2 if low.startswith(key.replace("_", ""))), t.lstrip("# ").title())
            if t.rstrip().endswith("and") and i < len(raw) and not re.search(SEP, raw[i]): i += 1   # heading wrapped onto the next line ("#Phrases and" / "Collocations")
            continue
        if re.search(SEP, t) or re.match(r"^\S.*\s[-–—]$", t):
            close(); m2 = re.match(r"^(.+?)\s[-–—](?:\s+(.*))?$", t); cur = {"en": m2.group(1).strip(), "uz": (m2.group(2) or "").strip(), "sec": sec}
        elif cur is not None: cur["uz"] = (cur["uz"] + " " + t).strip()
    close(); return units
if __name__ == "__main__":
    for book, f, fn in (("B1", "/mnt/user-data/uploads/Destination_B1_özbekcha_tarjimasi_bilan__destination_b1_b2_c1.pdf", parse_b1), ("B2", "/mnt/user-data/uploads/Destination_B2_o_zbekcha_tarjimasi_bilan__destination_b1_b2_c1_1.pdf", parse_b2)):
        units = fn(f); json.dump({"book": book, "units": units}, open(f"raw_{book.lower()}.json", "w"), ensure_ascii=False, indent=0)
        print(f"{book}: {len(units)} units, {sum(len(u['items']) for u in units)} entries")
        for u in units: print(f"   unit {u['n']:>2} {u['title'][:34]:<34} {len(u['items']):>4}  {dict(collections.Counter(i['sec'] for i in u['items']))}")
