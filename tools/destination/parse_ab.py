# Parses the Destination A1 / A2 PDFs (Zoir Akramov layout) using the PDF's own formatting:
# headword line = bullet at left margin; example sentence = italic; section heading = bold + centred; unit heading = "UNIT n. TITLE".
import pdfplumber, re, json, sys, collections
def lines_of(page):
    words = page.extract_words(extra_attrs=["fontname", "size"], keep_blank_chars=True, use_text_flow=False)
    rows = collections.OrderedDict()
    for w in words: rows.setdefault(round(w["top"] / 2), []).append(w)   # group by baseline (2pt tolerance)
    out = []
    for k in sorted(rows):
        ws = sorted(rows[k], key=lambda w: w["x0"]); fonts = [w["fontname"].split("+")[-1] for w in ws]
        text = " ".join(w["text"] for w in ws)
        out.append({"x0": ws[0]["x0"], "top": ws[0]["top"], "text": text, "fonts": set(fonts), "size": ws[0]["size"],
                    "italic": any(("Italic" in f and "Bold" not in f) for f in fonts), "bold": all("Bold" in f for f in fonts), "bullet": any("OpenSymbol" in f for f in fonts)})
    return out
def parse(pdf_path, book):
    units, cur_unit, cur_sec, cur = [], None, None, None
    skipped = []
    def close():
        nonlocal cur
        if cur and cur_unit is not None:
            cur["en"] = re.sub(r"\s+", " ", cur["en"]).strip(); cur["uz"] = re.sub(r"\s+", " ", cur["uz"]).strip()
            ex = re.sub(r"\s+", " ", cur.pop("ex_raw", "")).strip()
            if ex:
                m = re.search(r"\s[–—-]\s*", ex)       # first dash that has a space before it = sentence separator
                if m: cur["ex"], cur["exuz"] = ex[:m.start()].strip(), ex[m.end():].strip()
                else: cur["ex"], cur["exuz"] = ex, ""
            cur_unit["items"].append(cur)
        cur = None
    with pdfplumber.open(pdf_path) as pdf:
        for pi, page in enumerate(pdf.pages):
            for ln in lines_of(page):
                t = ln["text"].strip()
                if not t or re.fullmatch(r"\d+", t) or "@destination_vocabulary" in t: continue
                m = re.match(r"^UNIT\s+(\d+)\.?\s*(.*)$", t, re.I) if ln["bold"] and not ln["bullet"] else None
                if m and "......" not in t:
                    close(); cur_unit = {"n": int(m.group(1)), "title": m.group(2).strip().title(), "items": []}; units.append(cur_unit); cur_sec = None; continue
                if cur_unit is None: continue
                if ln["bold"] and not ln["bullet"] and ln["x0"] > 150 and " - " not in t:   # centred bold = section heading
                    close(); cur_sec = t.rstrip(":"); continue
                if ln["bullet"] or (ln["x0"] < 100 and not ln["italic"] and re.search(r"\s[-–—]\s", t) and cur is None):
                    close(); body = re.sub(r"^[\s\uf000-\uf8ff•]+", "", t).strip()
                    m2 = re.match(r"^(.+?)\s+[-–—](?:\s+(.*))?$", body)
                    if not m2: skipped.append((pi + 1, t)); cur = None; continue
                    cur = {"en": m2.group(1), "uz": m2.group(2) or "", "sec": cur_sec, "ex_raw": ""}; continue
                if cur is None: skipped.append((pi + 1, t)); continue
                if ln["italic"]: cur["ex_raw"] += " " + t
                else:
                    if cur["ex_raw"].strip(): cur["ex_raw"] += " " + t     # rare: stray non-italic text inside an example
                    else: cur["uz"] += " " + t                             # wrapped definition
        close()
    return units, skipped
if __name__ == "__main__":
    for book, f in (("A1", "/mnt/user-data/uploads/Destination_A1_tarjimalari_1.pdf"), ("A2", "/mnt/user-data/uploads/Destination_A2_tarjimalari_1.pdf")):
        units, skipped = parse(f, book)
        json.dump({"book": book, "units": units}, open(f"raw_{book.lower()}.json", "w"), ensure_ascii=False, indent=0)
        tot = sum(len(u["items"]) for u in units); noex = sum(1 for u in units for i in u["items"] if not i.get("ex"))
        print(f"{book}: {len(units)} units, {tot} entries, {noex} without example, {len(skipped)} lines skipped")
        for u in units: print(f"   unit {u['n']:>2} {u['title'][:40]:<40} {len(u['items']):>4}  sections: {sorted(set(i['sec'] or '-' for i in u['items']))}")
        for s in skipped[:12]: print("   SKIPPED p%d: %s" % s)
