# Translation corrections approved by the teacher. Each line: (book, unit, English, expected OLD Uzbek, NEW Uzbek).
# The build refuses to continue if the old text is not exactly what is expected (so nothing changes by accident).
FIXES = [
 ("B1", 3,  "Defeat",       "g'alaba (qozonmoq)",                  "mag'lub etmoq; mag'lubiyat"),
 ("B1", 9,  "Ferry",        "yassi kema(yuk kemasi)",              "parom"),
 ("B1", 21, "Click",        "kattalashtirmoq, oydinlashtirmoq",    "bosmoq (sichqoncha tugmasini); chertmoq"),
 ("B1", 21, "Swear",        "haqoratlamoq",                        "so'kinmoq; qasam ichmoq"),
 ("B1", 33, "Maintain",     "ta'mirlamoq",                         "yaxshi holatda saqlamoq; parvarish qilmoq"),
 ("B2", 4,  "Maintain",     "ta'mirlamoq",                         "yaxshi holatda saqlamoq; parvarish qilmoq"),
 ("B1", 36, "Heatwave",     "issiq shamol",                        "jazirama issiq davri"),
 ("B1", 39, "Bad-tempered", "xafa",                                "jahldor, serjahl"),
 ("B1", 18, "Pull off",     "yulib olmoq",                         "uddalamoq, eplamoq"),
 ("B1", 18, "Hardware",     "ehtiyot qism",                        "kompyuterning jismoniy qismlari (apparat ta'minoti)"),
 ("B1", 39, "Stress",       "tushkunlik",                          "stress, asabiy zo'riqish"),
 ("B1", 42, "Claim",        "tasdiqlamoq",                         "da'vo qilmoq; ta'kidlamoq"),
 ("B1", 42, "Deny",         "tan olmaslik",                        "inkor qilmoq, rad etmoq"),
 ("B1", 15, "Fee",          "haq, maosh",                          "to'lov, haq (xizmat uchun)"),
 ("B1", 30, "Sensible",     "aqlli",                               "oqilona, mulohazali"),
 ("B2", 10, "Sensible",     "aqlli, ma'noli, bamani",              "oqilona, mulohazali"),
 ("B1", 3,  "Sailing",      "dengiz safari",                       "yelkanli qayiqda suzish"),
 ("B2", 2,  "In a way",     "yo'lda",                              "qaysidir ma'noda"),
 ("B2", 8,  "Press",        "nashriyot",                           "matbuot, bosma nashrlar"),
 ("B2", 28, "Applicant",    "da'vogar",                            "nomzod; ariza beruvchi"),
 ("B2", 2,  "Photography",  "rasmchilik",                          "fotografiya, suratga olish san'ati"),
 ("B2", 28, "Arrangement",  "uchrashuv",                           "kelishuv; rejalashtirish, tartib"),
 ("B2", 24, "Entertaining", "ko'ngilxushlik qilish",               "ko'ngilochar, qiziqarli"),
 ("B2", 2,  "Native",       "bir hududda yashovchi",               "mahalliy; o'sha yerda tug'ilgan"),
]
def apply(book, units):
    done = 0
    for (b, n, en, old, new) in FIXES:
        if b != book: continue
        hits = [i for u in units if u["n"] == n for i in u["items"] if i["en"] == en and i["uz"] == old]
        if len(hits) != 1: raise SystemExit(f"FIX REFUSED: {b} unit {n} '{en}': expected exactly one card with the old text {old!r}, found {len(hits)}")
        hits[0]["uz"] = new; done += 1
    return done
