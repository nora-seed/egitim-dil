import os, json

ROOT = os.path.expanduser("~/diller-pwa")
DATA = os.path.join(ROOT, "data")

manifest = json.load(open(os.path.join(DATA, "manifest.json"), encoding="utf-8"))
vocab = {}
txtmap = {}
for lang in ("ru", "fr"):
    vocab[lang] = json.load(open(os.path.join(DATA, "%s-vocab.json" % lang), encoding="utf-8"))
    d = os.path.join(DATA, lang)
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".txt"): continue
        key = "%s/%s" % (lang, fn[:-4])
        txtmap[key] = open(os.path.join(d, fn), encoding="utf-8").read()

with open(os.path.join(DATA, "data.js"), "w", encoding="utf-8") as f:
    f.write("/* Diller PWA — veri paketi (otomatik üretildi: tools_bundle.py) */\n")
    f.write("window.DILLER_DATA = {\n")
    f.write("  manifest: %s,\n" % json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
    f.write("  vocab: %s,\n" % json.dumps(vocab, ensure_ascii=False, separators=(",", ":")))
    f.write("  txt: %s\n" % json.dumps(txtmap, ensure_ascii=False, separators=(",", ":")))
    f.write("};\n")

print("data.js yazıldı: %.2f MB" % (os.path.getsize(os.path.join(DATA, "data.js")) / 1048576))
