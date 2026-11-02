# 🌐 Diller PWA

Sıfırdan **Fransızca** ve **Rusça** kendi kendine öğrenme kitaplarının (72 PDF) PWA uygulamasına
dönüştürülmüş hâli. GitHub Pages üzerinde hiçbir ek kurulum olmadan çalışır, kurulumdan sonra
internet kesilse bile çalışmaya devam eder (offline PWA).

## Özellikler

- **🇷🇺 + 🇫🇷 İki ders**: her biri 36 modül (1–12 A1, 13–24 A2, 25–36 B1) + 8 Ek kaynak doküman
- **📖 Modül okuma**: birebir kitap içeriği, bölüm başlıklarıyla biçimlendirilmiş
- **📝 Modül sınavı**: her modülün sonundaki "Modül testi · 15 soru" (A1-A2-B1 ekleri: seviye sınavları da)
  — çoktan seçmeli sorular otomatik puanlanır, boşluk doldurma/çeviri/düzeltme soruları cevap
  gösterimi + kendini değerlendirme ile çözülür; puan kayda geçer
- **🃏 Günlük 10 yeni kelime**: modül tematik sözlüklerinden eşlenen kelime desteleri; her dilin
  kendi destesi var (Ru ~1660, Fr ~1980 sözcük & kalıp)
- **⏱️ SRS tekrar (Leitner)**: biliyorum → 1, 2, 3, 5, 7, 14, 30 gün; tekrarsa → ertesi gün geri döner
- **📈 İlerleme takibi**: okunan/tamamlanan modüller, sınav geçmişi ve ortalaması, kelime istatistikleri,
  30 günlük aktivite ızgarası ve 🔥 gün serisi — hepsi **localStorage**'da, sunucuya hiçbir veri gitmez
- **💡 Pratik bilgi**: her gün değişen, kitap yöntem bölümlerinden derlenen ipucu
- **🌗 Tema**: açık/koyu; sistem temasını otomatik izler
- **📱 PWA**: manifest + service worker; "Ana ekrana ekle" ile uygulama gibi çalışır

## GitHub Pages'e yükleme

Bu klasörün içeriğini GitHub'da bir repoya (ör. `diller-app`) pushlayın:

```bash
cd diller-pwa
git init
git add -A
git commit -m "Diller PWA"
git remote add origin https://github.com/<KULLANICI>/<REPO>.git
git push -u origin main
```

Sonra repo ayarlarından: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root)**.

Uygulama `https://<KULLANICI>.github.io/<REPO>/` adresinde açılır; ilk açılıştan sonra tarayıcı
menu kapağından/komutundan "Ana ekrana ekle" seçilince tam ekran uygulama olur.

## Dosya yapısı

```
index.html  — yer zarfı (tabbar, üstbar, router hedefi)
style.css   — tema, kart, kartlar, sınav, flashkart stilleri
app.js      — router, ilerleme/SRS durumu, sınav ayrıştırıcı, okuyucu
manifest.json / sw.js / icons/ — PWA bileşenleri
data/
  data.js            — TÜM içerik tek dosyada (app.js '<script>' ile yükler; file:// da çalışır)
  manifest.json      — modül başlıkları (fetch yedek kaynağı)
  {ru,fr}-vocab.json — tematik sözlük derinliği (SRS desteleri, fetch yedek)
  {ru,fr}/m*.txt     — her modülün (1..36) tam metni (pdftotext)
  {ru,fr}/ek*.txt    — Ek 1..8 tam metinleri
```

## file:// ile açma

Tarayıcının dosya yöneticisinden `index.html`'i doğrudan da açabilirsin: tüm veri
`data/data.js` içinde toplandığı için içerik yüklenir. (Fakat en iyi deneyim için
GitHub Pages veya bir yerel sunucu önerilir.)

## Bakım

- İçeriği güncellemek için: `tools_extract.py` (PDF → txt/vocab), `tools_icon.py` (ikonlar).
- `sw.js` ilk satırındaki `diller-v1` sürümünü artırırsınız → cache temizlenir.
- İlerlemenin yedeği: İlerleme sekmesi → "İlerlemeyi dışarı aktar (JSON)".
