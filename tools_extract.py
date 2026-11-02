import os, re, subprocess, json, glob

SRC = "/data/data/com.termux/files/usr/tmp/opencode/diller"
OUT = os.path.expanduser("~/diller-pwa/data")

def pdftotext(path):
    r = subprocess.run(["pdftotext", path, "-"], capture_output=True, text=True)
    return r.stdout.replace("\x0c", "")

def norm_name(fn):
    m = re.search(r"Modul[_]?(\d+)", fn, re.I)
    if m: return ("m", int(m.group(1)))
    m = re.search(r"Ek[_]?(\d+)", fn, re.I)
    if m: return ("ek", int(m.group(1)))
    return (None, None)

SECTION_RE = re.compile(
    r"^(On örnek|Yaygın hatalar|Alıştırmalar|Mini alıştırma|Mini alanştırma|"
    r"Modül testi|Dinleme metni|Konuşma pratiği|Kendini değerlendirme|Seslendirme|"
    r"KONU \d|Konu \d|Bölüm 0|BÖLÜM|Rol [AB]|PROJE [AB]|Cevap anahtarı|Ezber tekniği|"
    r"Öğrenme tavsiyeleri|Telaffuz durağı|Devam etmek)", re.I)

SKIP_EXACT = re.compile(r"^(Fransızca \[IPA\]|Türkçe|RUSÇA|FRANSIZCA|\d+)$")

SKIP_RU = re.compile(r"^(No|Rusça \[yaklaşık okunuş\] — Türkçe|Kelime grubu \d+|\d+|"
                     r"(RUSÇA|FRANSIZCA) ÖĞRENİM KİTABI.*|Selam ve nezaket|Hâl hatır.*|Tanışma.*|"
                     r"Sayılar.*|Zaman.*|Yaygın konuşma kelime grubu \d+)$")

def vocab_ru(lines, start):
    out = []
    in_topic = False
    pending = None
    for s in (l.strip() for l in lines):
        if not in_topic and re.search(r"Tematik sözlük", s):
            in_topic = True; continue
        if not in_topic: continue
        if SECTION_RE.match(s):
            in_topic = False; continue
        if not s or SKIP_RU.match(s): continue
        mm = re.match(r"^(?:\d+\.\s*)?(.+?)\s+\[([^\]]+)\]\s*(?:—\s*(.+))?$", s)
        if mm:
            if pending is not None:
                out.append(pending)  # önceki girişin anlamı yarımda kalmışsa ikisi birden
            pending = {"w": mm.group(1), "p": mm.group(2), "t": (mm.group(3) or "").strip()}
            if pending["t"]:
                out.append(pending); pending = None
        elif pending is not None:
            extra = s.strip(" .").lstrip("—-").strip()
            if extra:
                pending["t"] = (pending["t"] + " " + extra).strip()
                out.append(pending); pending = None
    if pending is not None:
        out.append(pending)
    return out

def vocab_fr(lines, start=0):
    out = []
    in_topic = False
    pending = None
    for s in (l.strip() for l in lines):
        if not in_topic and re.search(r"Yeni sözcükler", s):
            in_topic = True; pending = None; continue
        if not in_topic: continue
        if SECTION_RE.match(s) and "[" not in s:
            in_topic = False; continue
        if not s or SKIP_EXACT.match(s): continue
        if re.match(r"^(RUSÇA|FRANSIZCA)", s): continue
        if pending is None:
            if re.search(r"\[[^\]]*\]", s):
                pending = s
            # otherwise: a wrap line of a translation we already stored; ignore
        else:
            t = pending
            mm = re.match(r"^(.+?)\s*(\[[^\]]*\])?$", t)
            word, ipa = (mm.group(1) or t).strip(), (mm.group(2) or "").strip() if mm else ""
            out.append((word, ipa, s))
            pending = None
    return out

tid_fr = re.compile(r"^Modül (\d+) — (.+)$")
ek_line = re.compile(r"^EK (\d+)\s*[·:]?\s*(.*)$")

manifest = {"ru": {"modules": [], "eks": []}, "fr": {"modules": [], "eks": []}}

for lang, pat in (("ru", os.path.join(SRC, "Rusca", "*.pdf")),
                  ("fr", os.path.join(SRC, "Fransizca", "*.pdf"))):
    vocab = []
    seen = set()
    for pdf in sorted(glob.glob(pat)):
        base = os.path.basename(pdf)
        kind, n = norm_name(base)
        if kind is None: continue
        first = pdftotext(base)
        txt = pdftotext(pdf)
        txt = txt.replace("Frans-ıızca", "Fransızca").replace("\x0c", "\n")
        lines = txt.splitlines()
        title = ""
        if lang == "fr":
            if kind == "m":
                mm = tid_fr.match(lines[0].strip() if lines else "")
                title = mm.group(2) if mm else (lines[0].strip() if lines else "")
            else:
                mm = ek_line.match(lines[0].strip() if lines else "")
                title = mm.group(2) if mm else ""
        else:
            if kind == "m":
                tl = [l.strip() for l in lines[:6] if l.strip()]
                idx = next((i for i, l in enumerate(tl) if re.search(r"MODÜL \d+", l)), None)
                title = tl[idx + 1] if idx is not None and idx + 1 < len(tl) else ""
            else:
                mm = ek_line.match(lines[0].strip() if lines else "")
                title = mm.group(2) if mm else ""
        title = title or ("Modül %d" % n if kind == "m" else "Ek %d" % n)
        with open(os.path.join(OUT, lang, "%s%d.txt" % (kind, n)), "w", encoding="utf-8") as f:
            f.write(txt)
        manifest[lang]["modules" if kind == "m" else "eks"].append(
            {"n": n, "title": title})
        if kind == "m":
            v = vocab_ru(lines, n) if lang == "ru" else vocab_fr(lines, n)
            for e in v:
                if isinstance(e, dict):
                    e["m"] = n; vocab.append(e)
                else:
                    w, p, t = e
                    vocab.append({"m": n, "w": w, "p": p, "t": t})
        seen.add((kind, n))
    with open(os.path.join(OUT, "%s-vocab.json" % lang), "w", encoding="utf-8") as f:
        json.dump(vocab, f, ensure_ascii=False)
    for m in manifest[lang]["modules"]:
        if m["n"] == 1: m["title"] = "Giriş ve Modül 1"
    manifest[lang]["modules"].sort(key=lambda x: x["n"])
    manifest[lang]["eks"].sort(key=lambda x: x["n"])
    assert len(manifest[lang]["modules"]) == 36 and len(manifest[lang]["eks"]) == 8, (lang,)
    print(lang, "| modüller: 36 | ek: 8 | vocab:", len(vocab), "| ilk başlık:", manifest[lang]["modules"][0]["title"], "| m2:", manifest[lang]["modules"][1]["title"])

with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False)
print("manifest yazıldı")
