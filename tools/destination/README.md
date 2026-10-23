# Destination vocabulary: how the data was made
1. `parse_ab.py`  reads the A1 / A2 PDFs (uses the PDF's own formatting: bullets, italics, centred bold headings)
2. `parse_b.py`   reads the B1 / B2 PDFs (plain "English - Uzbek" lines, page numbers and adverts removed, glued entries split)
3. `clean.py`     normalises apostrophes, applies the hand repairs (see Destination_what_I_repaired.txt), merges exact duplicates
4. `build_js.py`  writes `js/dest-a1.js` ... `js/dest-b2.js`
To change a translation permanently, edit `clean.py` (patch()) or the generated js file, then redeploy.
