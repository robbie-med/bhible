#!/usr/bin/env python3
"""Build the creeds/confessions/catechisms served by the app: data/creeds/

  index.json          [{id, type, year, title: {en, ko}, langs: [...]}] in display order
  <id>.<lang>.json    the document, in one of three shapes:
    creed       {paragraphs: [text]}
    confession  {chapters: [{n, title, sections: [{n, text, proofs}]}]}
    catechism   {questions: [{n, q, a, proofs, ld?}]}   (ld = Heidelberg Lord's Day)
  The index type "early" (Didache) uses the confession shape; the app groups it as Early Church.

`text`/`a` may contain footnote markers "[k]"; `proofs` maps k -> [OSIS refs] such as
"Rom.11.36", "Ps.19.1-Ps.19.3" or "Gen.1" (book ids match data/bible.js).

English: NonlinearFruit/Creeds.json @ 2ae21a4 (public-domain texts only), except
  - the Apostles' Creed: traditional 1662 Book of Common Prayer wording;
  - the Didache: Roberts-Donaldson translation (Ante-Nicene Fathers vol. VII, 1886) from
    Wikisource, editors' footnotes removed. Downloaded pages are cached with their
    revision ids in tools/.sources/creeds/didache/.
Korean: tools/creeds_ko/<id>.json in the same shape, when present.

Usage: python3 tools/build_creeds.py
"""
import html
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / ".sources" / "creeds"
KO = ROOT / "tools" / "creeds_ko"
OUT = ROOT / "data" / "creeds"
BASE = "https://raw.githubusercontent.com/NonlinearFruit/Creeds.json/2ae21a4c5387ecc91f474c9d3d67c826d2a6b9d5/creeds/"

# id, type, year, source file (None = defined here), English title, Korean title
DOCS = [
    ("apostles", "creed", "c. 700", None, "Apostles' Creed", "사도신경"),
    ("nicene", "creed", "381", "nicene_creed", "Nicene Creed", "니케아 신경"),
    ("athanasian", "creed", "c. 500", "athanasian_creed", "Athanasian Creed", "아타나시우스 신경"),
    ("chalcedon", "creed", "451", "chalcedonian_definition", "Chalcedonian Definition", "칼케돈 신경"),
    ("wcf", "confession", "1646", "westminster_confession_of_faith", "Westminster Confession of Faith", "웨스트민스터 신앙고백"),
    ("wlc", "catechism", "1647", "westminster_larger_catechism", "Westminster Larger Catechism", "웨스트민스터 대요리문답"),
    ("wsc", "catechism", "1647", "westminster_shorter_catechism", "Westminster Shorter Catechism", "웨스트민스터 소요리문답"),
    ("heidelberg", "catechism", "1563", "heidelberg_catechism", "Heidelberg Catechism", "하이델베르크 요리문답"),
    ("lbc1689", "confession", "1689", "london_baptist_1689", "1689 London Baptist Confession", "1689 런던 침례교 신앙고백"),
    ("didache", "early", "c. 100", None, "Didache", "디다케"),
]

DIDACHE_PAGE = ("Ante-Nicene Fathers/Volume VII/The Teaching of the Twelve Apostles/"
                "The Teaching of the Twelve Apostles/Chapter ")
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"]

APOSTLES_EN = [
    "I believe in God the Father Almighty, Maker of heaven and earth:",
    "And in Jesus Christ his only Son our Lord, Who was conceived by the Holy Ghost, "
    "Born of the Virgin Mary, Suffered under Pontius Pilate, Was crucified, dead, and buried: "
    "He descended into hell; The third day he rose again from the dead; He ascended into heaven, "
    "And sitteth on the right hand of God the Father Almighty; "
    "From thence he shall come to judge the quick and the dead.",
    "I believe in the Holy Ghost; The holy Catholick Church; The Communion of Saints; "
    "The Forgiveness of sins; The Resurrection of the body, And the Life everlasting. Amen.",
]

# Heidelberg Catechism: first question of each of the 52 Lord's Days
LORDS_DAY_STARTS = [
    1, 3, 6, 9, 12, 16, 20, 24, 26, 27, 29, 31, 33, 35, 37, 40, 45, 46, 50, 53, 54, 57, 59,
    62, 65, 69, 72, 75, 78, 80, 83, 86, 88, 92, 96, 99, 101, 103, 104, 105, 108, 110, 112,
    113, 116, 120, 122, 123, 124, 125, 126, 127,
]


def fetch(name):
    SRC.mkdir(parents=True, exist_ok=True)
    dest = SRC / f"{name}.json"
    if not dest.exists():
        print(f"downloading {name}")
        urllib.request.urlretrieve(BASE + f"{name}.json", dest)
    return json.loads(dest.read_text(encoding="utf-8"))


def wikitext(title):
    """Wikisource page source, cached with its revision id."""
    dest = SRC / "didache" / (title.rsplit("/", 1)[-1].replace(" ", "_") + ".json")
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {title}")
        query = urllib.parse.urlencode({"action": "parse", "page": title, "prop": "wikitext|revid",
                                        "format": "json", "formatversion": 2})
        # Wikimedia APIs refuse requests without a descriptive User-Agent
        req = urllib.request.Request("https://en.wikisource.org/w/api.php?" + query,
                                     headers={"User-Agent": "bhible-build/1.0 (https://github.com/robbie-med/bhible)"})
        with urllib.request.urlopen(req) as res:
            parsed = json.load(res)["parse"]
        dest.write_text(json.dumps({"revid": parsed["revid"], "wikitext": parsed["wikitext"]}), encoding="utf-8")
    return json.loads(dest.read_text(encoding="utf-8"))["wikitext"]


def clean_wiki(text):
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S)       # editors' footnotes
    text = re.sub(r"\{\{anchor\+\|[^|}]*\|2=([^}]*)\}\}", r"\1", text)
    text = re.sub(r"\{\{(?:small-caps|sc|bbsc)\|([^}]*)\}\}", r"\1", text)
    text = re.sub(r"\{\{[^}]*\}\}", "", text)                         # any other template
    text = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", text)      # [[target|label]] -> label
    text = text.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def didache():
    chapters = []
    for n, roman in enumerate(ROMAN, 1):
        # Footnotes first: chapter IX's heading itself carries a multi-line <ref>
        src = re.sub(r"<ref[^>]*>.*?</ref>", "", wikitext(DIDACHE_PAGE + roman), flags=re.S)
        m = re.search(r"'''\{\{bbsc\|(.*?)\}\}'''", src, flags=re.S)  # the bold "Chapter N.—Title." line
        assert m, f"Didache chapter {n}: heading not found"
        title = clean_wiki(m.group(1))
        text = src[m.end():].split("==Footnotes==")[0]
        title = re.sub(r"^Chapter [IVXL]+\.\s*[—-]\s*", "", title).rstrip(".")
        text = clean_wiki(text)
        # Split on verse numbers "1. ", "2. ", ... taking only the next expected number,
        # so stray numerals in the text can't start a section
        starts, expect = [], 1
        for m in re.finditer(r"(?:(?<=\s)|^)(\d{1,2})\. ", text):
            if int(m.group(1)) == expect:
                starts.append((m.start(), m.end()))
                expect += 1
        assert starts, f"Didache chapter {n}: no numbered verses"
        sections = [{
            "n": i + 1,
            "text": text[body_start:(starts[i + 1][0] if i + 1 < len(starts) else len(text))].strip(),
            "proofs": {},
        } for i, (_, body_start) in enumerate(starts)]
        chapters.append({"n": n, "title": title, "sections": sections})
    return {"chapters": chapters}


def proofs(entry):
    return {p["Id"]: p["References"] for p in entry.get("Proofs", [])}


def convert(doc_type, data):
    if doc_type == "creed":
        return {"paragraphs": [p.strip() for p in data["Content"].split("\n\n") if p.strip()]}
    if doc_type == "confession":
        return {"chapters": [{
            "n": int(ch["Chapter"]),
            "title": ch["Title"],
            "sections": [{
                "n": int(s["Section"]),
                "text": s.get("ContentWithProofs") or s["Content"],
                "proofs": proofs(s),
            } for s in ch["Sections"]],
        } for ch in data]}
    return {"questions": [{
        "n": int(q["Number"]),
        "q": q["Question"],
        "a": q.get("AnswerWithProofs") or q["Answer"],
        "proofs": proofs(q),
    } for q in data]}


def update_sw_precache(index):
    """Rewrite the creeds block of sw.js's ASSETS list to match what was built."""
    sw = ROOT / "sw.js"
    files = ["./data/creeds/index.json"] + [f"./data/creeds/{d['id']}.{lang}.json" for d in index for lang in d["langs"]]
    block = ",\n".join(f"  '{f}'" for f in files)
    text = sw.read_text(encoding="utf-8")
    text, n = re.subn(r"(// creeds:begin[^\n]*\n).*?(\n\s*// creeds:end)", lambda m: m.group(1) + block + m.group(2), text, flags=re.S)
    assert n == 1, "creeds:begin/end markers missing in sw.js"
    sw.write_text(text, encoding="utf-8")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for doc_id, doc_type, year, source, title_en, title_ko in DOCS:
        if source:
            doc = convert(doc_type, fetch(source)["Data"])
        elif doc_id == "didache":
            doc = didache()
        else:
            doc = {"paragraphs": APOSTLES_EN}
        if doc_id == "heidelberg":
            qs = doc["questions"]
            assert [q["n"] for q in qs] == list(range(1, 130)), "unexpected Heidelberg numbering"
            for day, start in enumerate(LORDS_DAY_STARTS, 1):
                qs[start - 1]["ld"] = day
        langs = ["en"]
        (OUT / f"{doc_id}.en.json").write_text(
            json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        ko_src = KO / f"{doc_id}.json"
        if ko_src.exists():
            ko = json.loads(ko_src.read_text(encoding="utf-8"))
            (OUT / f"{doc_id}.ko.json").write_text(
                json.dumps(ko, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            langs.append("ko")
        index.append({"id": doc_id, "type": doc_type, "year": year,
                      "title": {"en": title_en, "ko": title_ko}, "langs": langs})
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    update_sw_precache(index)
    for d in index:
        print(f"{d['id']:12} {d['type']:10} {'+'.join(d['langs'])}")


if __name__ == "__main__":
    main()
