#!/usr/bin/env python3
"""Build the offline Bible text served by the app: data/text/<translation>/<Book>.json

Each file is a JSON array of chapters, each an array of verse strings, indexed to
the verse counts in data/bible.js (KJV numbering). A verse the translation omits
or merges into its neighbour is an empty string, so text[ch-1][v-1] always lines
up with the heat map. Verses numbered past the KJV count (KorRV 3 John 1:15,
Rev 12:18) are appended to the chapter's last verse so no text is lost.

Sources (both public domain), SHA-256 pinned below. Files are looked up in
tools/.sources/ and downloaded there if absent:
  kjv.tsv     King James Version  layeh/kjv (keeps small-caps "LORD"); also in ../offline_bible/data
  KorRV.json  개역한글 (1961)      scrollmapper/bible_databases @ e1b254ce (CrossWire KorRV)

Usage: python3 tools/build_text.py
"""
import hashlib
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / ".sources"
OUT = ROOT / "data" / "text"

SOURCES = {
    "kjv.tsv": (
        "c842aa5a7ce16034c6c60ec5da7f54c7a79c2932e321739f9028122b18c2a1b3",
        ROOT.parent / "offline_bible" / "data" / "kjv.tsv",
    ),
    "KorRV.json": (
        "ffdafc000a0555f87c889c03638b631ff27d033fe9aed0ef89b38d04b576c4bf",
        "https://raw.githubusercontent.com/scrollmapper/bible_databases/"
        "e1b254cef86d0e65b1a5d1a94b8b112d0f296a2c/formats/json/KorRV.json",
    ),
}


def fetch_sources():
    SRC.mkdir(parents=True, exist_ok=True)
    for name, (digest, origin) in SOURCES.items():
        dest = SRC / name
        if not dest.exists():
            if isinstance(origin, Path):
                if not origin.exists():
                    sys.exit(f"{name}: put a copy in {SRC} (expected sha256 {digest})")
                shutil.copy(origin, dest)
            else:
                print(f"downloading {name}")
                urllib.request.urlretrieve(origin, dest)
        actual = hashlib.sha256(dest.read_bytes()).hexdigest()
        if actual != digest:
            sys.exit(f"{name}: checksum mismatch ({actual})")


def verse_counts():
    """{abbr: [verses per chapter]} parsed from data/bible.js, the app's source of truth."""
    js = (ROOT / "data" / "bible.js").read_text(encoding="utf-8")
    books = {}
    for abbr, chapters in re.findall(r'abbr: "([^"]+)".*?chapters: \[([\d,\s]+)\]', js):
        books[abbr] = [int(n) for n in chapters.split(",")]
    assert len(books) == 66, len(books)
    return books


def load_kjv(abbr_order):
    # The TSV's book column is the English name; its row order matches canon order
    verses, names = {}, []
    for line in (SRC / "kjv.tsv").read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) != 6:
            continue
        name, _, _, ch, vs, text = parts
        if name not in names:
            names.append(name)
        verses[(abbr_order[names.index(name)], int(ch), int(vs))] = text.strip()
    assert len(names) == 66, len(names)
    return verses


def load_krv(abbr_order):
    data = json.loads((SRC / "KorRV.json").read_text(encoding="utf-8"))
    assert len(data["books"]) == 66
    verses = {}
    for abbr, book in zip(abbr_order, data["books"]):
        for ch in book["chapters"]:
            for v in ch["verses"]:
                text = " ".join(v["text"].split())
                if text:
                    verses[(abbr, ch["chapter"], v["verse"])] = text
    return verses


def write(translation, verses, books):
    out_dir = OUT / translation
    out_dir.mkdir(parents=True, exist_ok=True)
    missing = extra = 0
    for abbr, counts in books.items():
        chapters = []
        for ch, n in enumerate(counts, 1):
            row = [verses.get((abbr, ch, v), "") for v in range(1, n + 1)]
            v = n + 1
            while (abbr, ch, v) in verses:
                row[-1] += f" ({v}) " + verses[(abbr, ch, v)]
                extra += 1
                v += 1
            missing += row.count("")
            chapters.append(row)
        extra_ch = [k for k in verses if k[0] == abbr and k[1] > len(counts)]
        assert not extra_ch, extra_ch
        (out_dir / f"{abbr}.json").write_text(
            json.dumps(chapters, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = sum(f.stat().st_size for f in out_dir.glob("*.json"))
    print(f"{translation}: {missing} empty verses, {extra} appended past KJV numbering, {size/1e6:.1f} MB")


def main():
    fetch_sources()
    books = verse_counts()
    write("kjv", load_kjv(list(books)), books)
    write("krv", load_krv(list(books)), books)


if __name__ == "__main__":
    main()
