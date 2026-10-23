import json, re, collections
APOS = re.compile(r"[‘’ʻʼ`´′]")
def norm_uz(s):
    s = APOS.sub("'", s); s = s.replace("ó", "o'").replace("ò", "o'").replace("ǵ", "g'").replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s).strip(); s = re.sub(r"\*+", "", s).strip(); s = re.sub(r"\s+([,.;:!?)])", r"\1", s)
    return s
def norm_en(s):
    s = APOS.sub("'", s); s = re.sub(r"\s+", " ", s).strip(); s = re.sub(r"\*+$", "", s).strip(); return s
SEC = {  # canonical labels
 "Nouns": "Nouns", "Noun": "Nouns", "Verbs": "Verbs", "Verbs and phrasal verbs": "Verbs & phrasal verbs", "Phrasal verbs": "Phrasal verbs",
 "Adjectives": "Adjectives & adverbs", "Adjectives and adverbs": "Adjectives & adverbs", "Phrases": "Phrases", "Word formation": "Word formation",
 "Topic vocabulary": "Topic vocabulary", "Prepositional phrases": "Prepositional phrases", "Phrases and collocations": "Phrases & collocations",
 "Word_Patterns": "Word patterns", "Word_Formation": "Word formation", "Word patterns": "Word patterns"}
def canon(sec):
    if not sec: return "Other"
    base = sec.split(":")[0].strip()
    if base == "Word patterns": return "Word patterns"
    if base == "Prepositional phrases": return "Prepositional phrases"
    low = {k.lower(): v for k, v in SEC.items()}
    return low.get(base.lower(), low.get(sec.lower(), base))
# ---- hand fixes (each one explained) ----
def patch(book, units):
    def find(u, en):
        for i in u["items"]:
            if i["en"] == en: return i
    for u in units:
        n = u["n"]
        if book == "B1" and n == 36:
            i = find(u, "Enthusiastic about"); i["uz"] = re.sub(r"\s*Enthusiastic \[.*$", "", i["uz"])               # stray pronunciation line
        if book == "B2":
            if n == 16:
                i = find(u, "Special occasion"); i["uz"] = "maxsus voqea, bayram, tug'ilgan kun"
            if n == 22:
                i = find(u, "Come into"); i["uz"] = "meros olmoq"; u["items"].insert(u["items"].index(i) + 1, {"en": "Do without sth", "uz": "...siz yashamoq", "sec": i["sec"]})
            if n == 24:
                for i in u["items"]:
                    if i["en"] == "Entertain" and "Entertaining" in i["uz"]:
                        i["uz"] = "ko'ngilxushlik qilmoq"; u["items"].insert(u["items"].index(i) + 1, {"en": "Entertaining", "uz": "ko'ngilxushlik qilish", "sec": i["sec"]}); break
            if n == 28:
                i = find(u, "Agreement"); i["uz"] = "kelishuv"; u["items"].insert(u["items"].index(i) + 1, {"en": "Come to/reach (an) agreement (on/about sth)", "uz": "(...haqida/yuzasidan) kelishib olmoq, kelishmoq", "sec": i["sec"]})
                i = find(u, "Arrangement"); i["uz"] = "uchrashuv"; u["items"].insert(u["items"].index(i) + 1, {"en": "Make an arrangement (with/for sb) (to do)", "uz": "(...bilan/...uchun) (...bajarish uchun) uchrashuv belgilamoq", "sec": i["sec"]})
                i = find(u, "Good for sb (to do sth)"); i["uz"] = "kimgadir nimadir qilish yaxshi bo'lmoq"; u["items"].insert(u["items"].index(i) + 1, {"en": "Good at sth/doing", "uz": "...da yaxshi, qobilyatli bo'lmoq", "sec": i["sec"]})
                i = find(u, "Applied"); k = u["items"].index(i); i["uz"] = "amaliy"
                bad = u["items"][k + 1]                                  # 'ariza Applicant' mis-split
                if bad["en"].startswith("ariza Applicant"): u["items"][k + 1:k + 2] = [{"en": "Application", "uz": "ariza", "sec": i["sec"]}, {"en": "Applicant", "uz": bad["uz"], "sec": i["sec"]}]
                i = find(u, "Works"); i["uz"] = "asarlar"                 # remove the advert sentence glued to the end of the book
        if book == "A1" and n == 9:
            i = find(u, "History")
            if i and not i.get("ex"):
                m = re.search(r"\s([A-Z][a-z].*)$", i["uz"])
                if m:
                    i["uz"] = i["uz"][:m.start()].strip(); ex = m.group(1); mm = re.search(r"\s[–—-]\s*", ex)
                    i["ex"], i["exuz"] = (ex[:mm.start()], ex[mm.end():]) if mm else (ex, "")
    def ins(u, after, new):
        u["items"].insert(u["items"].index(after) + 1, new)
    for u in units:
        n = u["n"]; items = u["items"]
        if book == "B1":
            if n == 3:
                i = find(u, "organize")
                if i and "pleasure" in i["uz"]: i["uz"] = "tashkillashtirmoq"; ins(u, i, {"en": "pleasure", "uz": "rohat", "sec": i["sec"]})
            for i in items:
                i["en"] = i["en"].replace("Confuse smt with", "Confuse sth with").replace("Argue with sb sbout", "Argue with sb about").replace("Combine wth with", "Combine sth with")
        if book == "B2":
            if n == 2:
                a = find(u, "Area"); t = find(u, "hududi) Territory")
                if a and t: a["uz"] = "hudud (biror bino hududi)"; t["en"] = "Territory"
            if n == 4:
                i = find(u, "Track")
                if i and " court - " in i["uz"]:
                    a, b = i["uz"].split(" court - ", 1); i["uz"] = a.strip(); ins(u, i, {"en": "court", "uz": b.strip(), "sec": i["sec"]})
            if n == 10:
                i = find(u, "Make/become/be")
                if i and i["uz"].startswith("friends"): i["en"] = "Make/become/be friends (with sb)"; i["uz"] = re.sub(r"^friends \(with sb\)\s*-\s*", "", i["uz"])
            if n == 14:
                i = find(u, "Surgeon"); i["uz"] = "jarroh"; j = find(u, "urgical"); j["en"] = "Surgical"
            if n == 16:
                j = find(u, "ooker"); j["en"] = "Cooker"; j["uz"] = "gaz plitasi"
            if n == 24:
                i = find(u, "Join in a queue"); i["uz"] = "navbatga qo'shilmoq"; j = find(u, "n a queue"); j["en"] = "In a queue"
                i = find(u, "Variable"); i["uz"] = "o'zgaruvchan"; j = find(u, "nvariable"); j["en"] = "Invariable"
                i = find(u, "Invariably"); i["uz"] = re.sub(r"\s*V$", "", i["uz"]).replace("tarda", "tarzda"); j = find(u, "arying"); j["en"] = "Varying"
            for i in items:
                for a, b in (("Bussiness", "Business"), ("Collegue", "Colleague"), ("Congrutulate", "Congratulate"), ("Photagrapher", "Photographer"), ("Photagraph", "Photograph"), ("Unvelievably", "Unbelievably"), ("Prrformance", "Performance"), ("Unprapared", "Unprepared"), ("Medalion", "Medallion"), ("leasure", "leisure"), ("Enterence", "Entrance"), ("Humourous", "Humorous"), ("Write sht down", "Write sth down")):
                    i["en"] = i["en"].replace(a, b)
    return units
def build(book):
    d = json.load(open(f"raw_{book.lower()}.json")); units = patch(book, d["units"]); out = []; dropped = []
    for u in units:
        seen = set(); items = []
        for i in u["items"]:
            en, uz = norm_en(i["en"]), norm_uz(i["uz"]); en = en[:1].upper() + en[1:]
            if not en or not uz: dropped.append((book, u["n"], en, "no translation in the source")); continue
            key = (en.lower(), uz.lower())
            if key in seen: dropped.append((book, u["n"], en, "exact duplicate in the same unit")); continue
            seen.add(key); it = {"en": en, "uz": uz, "sec": canon(i.get("sec"))}
            if i.get("ex"): it["ex"] = norm_en(i["ex"]); it["exuz"] = norm_uz(i.get("exuz", ""))
            items.append(it)
        out.append({"n": u["n"], "title": re.sub(r"\s+", " ", u["title"]).strip(), "items": items})
    return out, dropped
if __name__ == "__main__":
    allw = {}; tot = 0
    for b in ("A1", "A2", "B1", "B2"):
        units, dropped = build(b); allw[b] = units; c = sum(len(u["items"]) for u in units); tot += c
        print(f"{b}: {len(units)} units, {c} cards, dropped {len(dropped)}")
        for x in dropped: 
            if x[3].startswith("no trans"): print("    dropped:", x)
    json.dump(allw, open("clean.json", "w"), ensure_ascii=False)
    print("TOTAL cards:", tot)
