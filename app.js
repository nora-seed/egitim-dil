/* ================= Diller PWA ================= */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const DAY = 86400000;
const LS_KEY = "dillerApp.v1";
const NEW_PER_DAY = 10;
const SRS_DAYS = [1, 2, 3, 5, 7, 14, 30];

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
}

/* ---------------- durum ---------------- */
const DEFAULT_STATE = {
  course: "ru",
  vocabCursor: { ru: 0, fr: 0 },
  srs: { ru: {}, fr: {} },
  progress: { ru: {}, fr: {} },
  eks: { ru: {}, fr: {} },
  quizHistory: [],
  streak: { last: "", count: 0 },
  daily: { date: "", newByLang: { ru: 0, fr: 0 }, reviewed: 0 },
  activity: {}
};
let state = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s) return Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), s);
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
})();
function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}

function rollDaily() {
  const t = todayStr();
  if (state.daily.date !== t) {
    state.daily = { date: t, newByLang: { ru: 0, fr: 0 }, reviewed: 0 };
    saveState();
  }
}
function markActivity() {
  const t = todayStr();
  state.activity[t] = true;
  if (state.streak.last !== t) {
    const y = new Date(Date.now() - DAY);
    const ys = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
    state.streak.count = state.streak.last === ys ? state.streak.count + 1 : 1;
    state.streak.last = t;
  }
  saveState();
}

/* ---------------- veri ---------------- */
const COURSES = {
  ru: { name: "Rusça", flag: "🇷🇺", levels: [[0, 12, "A1 Başlangıç"], [12, 24, "A2 Orta"], [24, 36, "B1 İleri"]] },
  fr: { name: "Fransızca", flag: "🇫🇷", levels: [[0, 12, "A1 Başlangıç"], [12, 24, "A2 Orta"], [24, 36, "B1 İleri"]] }
};
const DATA = { manifest: null, ru: null, fr: null };
async function getManifest() {
  if (!DATA.manifest) {
    if (window.DILLER_DATA) DATA.manifest = window.DILLER_DATA.manifest;
    else DATA.manifest = await (await fetch("data/manifest.json")).json();
  }
  return DATA.manifest;
}
async function getVocab(c) {
  if (!DATA[c]) {
    if (window.DILLER_DATA) DATA[c] = window.DILLER_DATA.vocab[c];
    else DATA[c] = await (await fetch("data/" + c + "-vocab.json")).json();
  }
  return DATA[c];
}
async function getModuleText(c, kind, n) {
  const k = c + "/" + kind + n;
  if (window.DILLER_DATA && window.DILLER_DATA.txt[k]) return window.DILLER_DATA.txt[k];
  if (!DATA.txt) DATA.txt = {};
  if (!DATA.txt[k]) {
    const res = await fetch("data/" + k + ".txt");
    if (!res.ok) throw new Error("Modül dosyası yüklenemedi");
    DATA.txt[k] = await res.text();
  }
  return DATA.txt[k];
}

/* ---------------- tema ---------------- */
function prefDark() {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { return false; }
}
function applyTheme() {
  let t = state.theme || (prefDark() ? "dark" : "light");
  document.documentElement.dataset.theme = t;
}
try {
  const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  if (mq && mq.addEventListener) mq.addEventListener("change", () => {
    if (!state.theme) applyTheme();
  });
} catch (e) {}

/* ---------------- günlük kelime & SRS ---------------- */
function cardId(e) { return "m" + e.m + ":" + e.w; }

async function srsCounters(c) {
  const vocab = await getVocab(c);
  const deck = state.srs[c];
  let due = 0;
  for (const id in deck) if (deck[id].due <= Date.now()) due++;
  let remaining = NEW_PER_DAY - (state.daily.newByLang[c] || 0);
  if (remaining < 0) remaining = 0;
  return { due, remaining, total: vocab.length, known: Object.keys(deck).length };
}

async function addNewWords(c) {
  const vocab = await getVocab(c);
  const deck = state.srs[c];
  let curs = state.vocabCursor[c] || 0;
  const cap = Math.max(0, NEW_PER_DAY - (state.daily.newByLang[c] || 0));
  let added = 0;
  const t = todayStr();
  while (curs < vocab.length && added < cap) {
    const e = vocab[curs];
    const id = cardId(e);
    if (!deck[id]) {
      deck[id] = { m: e.m, w: e.w, p: (e.p || "").replace(/[\[\]]/g, ""), t: e.t, lvl: 0, due: Date.now(), added: t };
      added++;
    }
    curs++;
  }
  state.vocabCursor[c] = curs;
  state.daily.newByLang[c] = (state.daily.newByLang[c] || 0) + added;
  if (added > 0) markActivity();
  saveState();
  return added;
}

function reviewCard(c, id, ok) {
  const d = state.srs[c][id];
  if (!d) return;
  d.lvl = ok ? Math.min(d.lvl + 1, SRS_DAYS.length) : 0;
  d.due = Date.now() + SRS_DAYS[d.lvl] * DAY;
  state.daily.reviewed++;
  markActivity();
  saveState();
}

/* ---------------- pratik bilgiler ---------------- */
const TIPS = [
  "Aralıklı tekrar: bir kelimeyi öğrendiğin gün, ertesi gün, 3., 7. ve 14. günlerde yokla; unutulanı yarına geri al.",
  "Gölgeleme: 3-8 saniyelik bir ses kaydını dinle ve hemen ardından aynı ritimle üstüne tekrar et.",
  "Önce anlamı kavra, sonra duyduğunu tekrar et, en sonunda bakmadan söyle.",
  "Tek tek harf yerine hece ve sık söz öbeklerini bir bütün olarak çalış.",
  "Yazı sesin yerini geçmez: her çalışmanın bir bölümü mutlaka sesli olsun.",
  "Kartı üçüncü tekrarında önce hedef dilin yazısına bak, fonetik yardımı okumayı bırak.",
  "Konuşma pratiği toztu: her gün 30 saniye kendi kendine tanıtma yapıp kaydet.",
  "Vurgu yeri anlamı değiştirebilir: kelimeyi vurgulu hecesiyle birlikte ezberle.",
  "Günlük: tarih, dakika, öğrendiğin 5 söz, 1 telaffuz zorluğu ve yarınki tek adım.",
  "Kaydını dinle: kendi sesin, en dürüst öğretmenin.",
  "Haftada 6 gün 30 dakika hedefle; kaçırılan günü telafi uğraşıyla üst üste günleri kaybetme.",
  "Aynı tanışmayı iki kez kaydet: bir arkadaşla samimi, bir görevliyle resmî hitapla.",
  "Günde 10 yeni kelime: az ama her gün, çok ama aralılı migliore.",
  "Kalıpları bütün olarak ezberle: cümle kurmada en hızlı araç hazır kalıplardır.",
  "Dinleme için PDF seslendirmesi yok: metni sesli okutuyorsan ekrandan gizleyip dinle.",
  "Haftasonu: diyalog oyna, haftanın kelimelerini topla, testi kapalı kitapla yaz.",
  "Telefonuna kendi sesinden 10 cümle kaydet, yolda tekrar dinle.",
  "Hafta sonu yanlış analizı: her yanlışın tek kaynağını sor (bilgi mi, hız mı, yazımdan mı).",
  "Rusça: apostrof, önceki ünsüzün yumuşaklığını gösterir — okurken sesi yumuşat.",
  "Fransızca: liaison her yerde otomatik yapılmaz; kalıbı bütün olarak öğrenmek en güvenlisidir.",
  "İlk gün ve 30. gün aynı metni sesle kaydet: gelişimi duyulur şekilde ölç.",
  "Rusça Kiril yazıyı elle/havada yazmak, harflere ait yazı hafızasını güçlendirir.",
  "Fransızca nazal sesleri (an/en/in/on) görünce işaretle — konuşma akışında kilit noktalardır.",
  "Önce kısa cümlelerde akıcılık kazan, sonra cümleleri uzatmayı dene."
];
function todayTip() {
  const idx = Math.floor(Date.now() / DAY) % TIPS.length;
  return TIPS[idx];
}

/* ---------------- sınav ayrıştırıcı ---------------- */
const KEY_START_RE = /^(Modül \d+\s*cevap anahtarı|Cevap anahtar|Test cevap anahtarı|Ara sınav cevap anahtarı|Yanıt anahtarı)/i;
const TEST_START_RE = /^(Modül testi|Genel Tekrar|\d{1,3}\s*soruluk\s*(seviye\s*)?sınav|Seviye sınavı|Deneme \d)/i;

function optionsFromText(t) {
  const ai = t.search(/\sA(?=[)\.:]\s|\s+\[)/);
  if (ai < 0) return null;
  const stem = t.slice(0, ai).trim();
  const body = t.slice(ai + 1 + 1); // "A" harfini geç
  const pieces = body.split(/\s+(?=[B-E](?=[)\.:]\s|\s+\[))/);
  if (pieces.length < 3) return null;
  return { stem, opts: pieces.map((x) => x.trim().replace(/[\s.]+$/, "")) };
}

function splitInlineQuestions(p) {
  // paragraf içindeki "N. " işaretlerinden parçala
  const re = /(?:^|\s)(\d{1,2})\.\s+/g;
  const marks = [];
  let m;
  while ((m = re.exec(p))) marks.push({ idx: m.index, n: +m[1], len: m[0].length });
  if (!marks.length) return [];
  const intro = marks[0].idx > 0 ? p.slice(0, marks[0].idx).trim() : "";
  const qs = [];
  for (let k = 0; k < marks.length; k++) {
    const from = marks[k].idx + marks[k].len;
    const to = k + 1 < marks.length ? marks[k + 1].idx : p.length;
    const text = p.slice(from, to).trim();
    if (text) qs.push({ n: marks[k].n, text });
    else qs.push({ n: marks[k].n, text });
  }
  qs._intro = intro;
  return qs;
}

function parseQuiz(text) {
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  const i0 = lines.findIndex((l) => TEST_START_RE.test(l.trim()));
  if (i0 < 0) return null;
  // anahtar bölgesinin başlangıcı
  let keyAt = -1;
  for (let i = i0 + 1; i < lines.length; i++) {
    if (KEY_START_RE.test(lines[i].trim())) { keyAt = i; break; }
  }
  const endAt = keyAt >= 0 ? keyAt : lines.length;
  // gövdeyi paragraflara toplu yap (örnek tanım başı sonrası tüm satırlar)
  let i = i0 + 1, intro = "";
  const paras = [];
  let buf = [];
  while (i < endAt) {
    const s = lines[i].trim();
    if (!s) { if (buf.length) { paras.push(buf.join(" ")); buf = []; } i++; continue; }
    if (/^(RUSÇA|FRANSIZCA) ÖĞRENİM KİTABI/.test(s)) { if (buf.length) { paras.push(buf.join(" ")); buf = []; } i++; continue; }
    if (/^(Dinleme metni|Konuşma pratiği|Kendini değerlendirme|Devam etmek|Rol [AB]|PROJE)/i.test(s)) {
      if (buf.length) { paras.push(buf.join(" ")); buf = []; }
      break;
    }
    if (/^\d{1,2}$/.test(s)) { i++; continue; }
    buf.push(s);
    i++;
  }
  if (buf.length) paras.push(buf.join(" "));

  const questions = [];
  // hesap 1: paragraf başlığını atla, soru paragrafları numaralı
  let tookIntro = false;
  for (const p of paras) {
    const qs = splitInlineQuestions(p);
    if (qs.length) {
      if (!tookIntro && qs._intro && !intro) intro = qs._intro;
      for (const q of qs) questions.push(q);
      tookIntro = true;
    } else if (!tookIntro) {
      intro = (intro ? intro + " " : "") + p;
    }
    // numarasız paragraf = tanıtım metni; devam cümleleri soru 1'e eklenmez
    // (ör. sonraki bölgesel başlıklar). Soru metinleri numaralı parçalara dahildir.
  }
  if (!questions.length) return null;
  questions.sort((a, b) => a.n - b.n);

  // ---- anahtar metni ----
  let key = keyAt >= 0 ? "" : "";
  if (keyAt >= 0) key = lines.slice(keyAt).join("\n");
  // Fallback: ANAHTAR bölgesi yoksa gövdede inline "Test: 1 B, 2 A..." bak (FR m1: "Yanıt anahtarı:")
  if (!key) {
    const inline = (intro + "\n" + paras.join("\n")).match(/(?:^|\n)((?:Test|Yanıt anahtarı)[^\n]*)/);
    if (inline) key = inline[1];
  }
  const mc = {}, openAnswers = {};
  // FR satır biçimi: "1. A — Bonjour... / 6. bien, — Très bien, merci..."
  const keyLines = key.split("\n");
  const openSourceLines = [];
  for (const s of keyLines) {
    const s0 = s.trim();
    if (/^(?:Test|Yanıt anahtarı)[:.]?\s*/.test(s0)) {
      const rest = s0.replace(/^(?:Test|Yanıt anahtarı)[:.]?\s*/, "");
      const re = /(?:^|[;,\n]\s*)(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?\s*[:.)]?\s*/g;
      const marks = [];
      let m;
      while ((m = re.exec(rest))) marks.push(m);
      for (let k = 0; k < marks.length; k++) {
        const start = marks[k].index + marks[k][0].length;
        const end = k + 1 < marks.length ? marks[k + 1].index : rest.length;
        let body = rest.slice(start, end).trim();
        if (!body) continue;
        const a = +marks[k][1], b = marks[k][2] ? +marks[k][2] : a;
        const L = body.match(/^([A-D])(?=[,;\s:.]|$)/);
        if (L && a === b) {
          mc[a] = L[1];
          body = body.slice(L[0].length).trim();
        }
        if (body) for (let kk = a; kk <= b; kk++) openSourceLines.push(kk + "\t" + body);
      }
      continue;
    }
    if (/^Test cevap anahtarı/i.test(s0)) continue;
    const lm = s0.match(/^(\d{1,2})\.\s*(.*)$/);
    if (lm) {
      const n = +lm[1], after = lm[2].trim();
      const lm2 = after.match(/^([A-D])\s*[:—-]\s*(.*)$/);
      if (lm2) { mc[n] = lm2[1]; if (lm2[2]) openSourceLines.push(n + "\t" + lm2[2]); }
      else openSourceLines.push(n + "\t" + after);
      continue;
    }
  }
  for (const line of openSourceLines) {
    const [nS, body] = line.split("\t");
    const st = body.trim();
    if (!st) continue;
    const n = +nS;
    if (!(n in openAnswers) && !(n in mc)) openAnswers[n] = st;
  }
  questions.forEach((q) => {
    const parsed = optionsFromText(q.text);
    if (mc[q.n] && parsed) q.args = { stem: parsed.stem, opts: parsed.opts, ans: mc[q.n] };
  });
  return { intro, questions, mc, openAnswers };
}

/* ---------------- okuyucu ---------------- */
const BIGHDR = /^(BÖLÜM|KONU \d|Modül testi|Dinleme metni|Konuşma pratiği|Kendini değerlendirme|Cevap anahtarı|Tematik söz|Seviye sınavı|Deneme sınavı)/;
const HDR_RE = /^(BÖLÜM|KONU \d|Bölüm 0|Konu \d|Modül testi|Dinleme metni|Dinleme soruları|Konuşma pratiği|Kendini değerlendirme|Cevap anahtarı|Tematik söz|Yeni sözcükler|Yeni öğe|On örnek|Yaygın hatalar|Formül\s*\/\s*kural|Tablo|Ayrıntılı konu anlatımı|Ezber tekniği|Öğrenme tavsiyeleri|Telaffuz durağı|Konunun mantığı|Kalıp düzeltmesi|Önceki modülden tekrar|Bu modülün|Mini alıştırma|Alıştırmalar|Seslendirme|Rol [AB]|PROJE [AB]|Hitap ve işlev|Türkçe ile karşılaştırma|Günlük bakış|Hafıza|Grameri|Kelime grubu|Gün planı|Seviye sınavı|Deneme \d)/;

function renderReaderText(raw, stopAtTest) {
  const lines = raw.split("\n");
  const out = [];
  const buf = [];
  const flush = () => { if (buf.length) { out.push("<p>" + esc(buf.join(" ")) + "</p>"); buf.length = 0; } };
  for (let l of lines) {
    const s = l.trim();
    if (stopAtTest && /^Modül testi/.test(s)) { flush(); break; }
    if (!s) { flush(); continue; }
    if (/^(RUSÇA|FRANSIZCA) ÖĞRENİM KİTABI/.test(s) || /^\d{1,2}$/.test(s)) { flush(); continue; }
    if (HDR_RE.test(s)) {
      flush();
      out.push(BIGHDR.test(s) ? "<h2>" + esc(s) + "</h2>" : "<h3>" + esc(s) + "</h3>");
      continue;
    }
    buf.push(s);
  }
  flush();
  return out.join("\n");
}

/* ---------------- router ---------------- */
function go(h) { location.hash = h; }
function html(view) { $("#view").innerHTML = view; window.scrollTo(0, 0); }
function showBack(on) { $("#backBtn").classList.toggle("hidden", !on); }
function setLangTabs() { $$(".lang-tab").forEach((b) => b.classList.toggle("active", b.dataset.course === state.course)); }

const routes = {
  async home() {
    const c = state.course;
    let sc = { due: 0, remaining: NEW_PER_DAY, total: 0, known: 0 };
    try { sc = await srsCounters(c); } catch (e) {}
    let nextMod = null, doneCount = 0;
    try {
      await getManifest();
      const prog = state.progress[c];
      doneCount = Object.values(prog).filter((m) => m.done).length;
      let nextN = 36;
      for (let k = 1; k <= 36; k++) { if (!prog[k] || !prog[k].done) { nextN = k; break; } }
      nextMod = DATA.manifest[c].modules.find((m) => m.n === nextN);
    } catch (e) {}
    const donePct = Math.round(doneCount / 36 * 100);
    html(`
    <div class="card">
      <h2>Merhaba! 👋</h2>
      <div class="grid2">
        <div class="stat"><b>${state.streak.count} 🔥</b><span>günlük seri</span></div>
        <div class="stat"><b>${sc.known}</b><span>${COURSES[c].name} kelime kartında</span></div>
      </div>
    </div>
    <div class="card">
      <h2>🃏 Bugün: ${sc.remaining} yeni kelime · ${sc.due} tekrar</h2>
      <div class="progressbar"><div style="width:${Math.min(100, ((NEW_PER_DAY - sc.remaining) / NEW_PER_DAY) * 100)}%"></div></div>
      <button class="btn" data-act="flash">${sc.known > 0 ? "Kartlara devam et" : "Günlük 10 kelimeni al"}</button>
    </div>
    <div class="card">
      <h2>📚 Devam et${nextMod ? `: Modül ${nextMod.n} — ${esc(nextMod.title)}` : ""}</h2>
      <p class="muted">${COURSES[c].name} · ${doneCount}/36 modül tamamlandı (%${donePct})</p>
      <div class="progressbar"><div style="width:${donePct}%"></div></div>
      <button class="btn secondary" data-act="nextmod">Modülü aç</button>
    </div>
    <div class="card">
      <h2>💡 Pratik bilgi</h2>
      <p>${esc(todayTip())}</p>
      <p class="muted small"><a href="#/tips">Tüm ipuçları →</a></p>
    </div>`);
  },

  async dersler() {
    const c = state.course;
    const man = (await getManifest())[c];
    const prog = state.progress[c];
    let modHtml = "";
    for (const [a, b, label] of COURSES[c].levels) {
      modHtml += `<div class="level-head">${label}</div>`;
      for (const m of man.modules.slice(a, b)) {
        const p = prog[m.n];
        const cls = p && p.done ? "done" : p && p.score ? "partial" : "";
        const lvl = a === 0 ? "A1" : a === 12 ? "A2" : "B1";
        const meta = p && p.done ? (p.score ? "Bitirildi · Sınav: " + p.score : "okundu · tamamlandı") : lvl + " · Modül " + m.n;
        modHtml += `<div class="mod-item ${cls}" data-mod="${m.n}">
          <div class="mod-num">${m.n}</div>
          <div><div class="mod-title">${esc(m.title)}</div><div class="mod-meta">${meta}</div></div>
        </div>`;
      }
    }
    let ekHtml = "";
    for (const e of man.eks) {
      const done = state.eks[c][e.n] ? " (✓)" : "";
      ekHtml += `<div class="mod-item" data-ek="${e.n}">
        <div class="mod-num" style="background:var(--accent-2);color:#fff">EK</div>
        <div><div class="mod-title">Ek ${e.n} — ${esc(e.title)}</div><div class="mod-meta">Kaynak doküman${done}</div></div>
      </div>`;
    }
    html(`<div class="card"><h2>📚 ${COURSES[c].name}</h2>
      <p class="muted">36 modül (1-12 A1, 13-24 A2, 25-36 B1) + 8 ek kaynak</p></div>${modHtml}
      <div class="level-head">Ek Kaynaklar</div>${ekHtml}`);
    $$("[data-mod]").forEach((el) => (el.onclick = () => go("#/modul/" + c + "/" + el.dataset.mod)));
    $$("[data-ek]").forEach((el) => (el.onclick = () => go("#/ek/" + c + "/" + el.dataset.ek)));
  },

  async kelimeler() {
    const c = state.course;
    const sc = await srsCounters(c);
    const SRS_TXT = SRS_DAYS.join(", ");
    html(`
    <div class="card">
      <h2>🃏 ${COURSES[c].name} · Günlük Kelimeler</h2>
      <div class="grid2">
        <div class="stat"><b>${sc.due}</b><span>tekrara hazır</span></div>
        <div class="stat"><b>${sc.remaining}</b><span>bugün yeni eklenecek</span></div>
      </div>
      <p class="muted">Deck: ${sc.known} kart · Kaynak: modül tematik sözlükleri (${sc.total} kelime) · Aralık günleri: ${SRS_TXT}</p>
      <button class="btn" data-act="flash">Çalışmaya başla</button>
    </div>
    <div class="card">
      <h2>Nasıl çalışır?</h2>
      <p class="muted">Her gün yeni 10 kelime modül sırasına göre eşilir, önceki timestek tekrarların üstüne eklenir ve bir sonraki uygular.</p>
      <p class="small">"Biliyorum" kartı bir sonraki aralığa taşır; "Tekrar lazım" kartı ertesi güne geri döndürür.</p>
    </div>`);
  },

  async sinavlar() {
    const c = state.course;
    const man = (await getManifest())[c];
    const byMod = {};
    for (const q of state.quizHistory.filter((q) => q.c === c)) {
      if (!byMod[q.n]) byMod[q.n] = q;
      else if (q.pct > byMod[q.n].pct) byMod[q.n] = q;
    }
    let rows = "";
    for (const m of man.modules) {
      const r = byMod[m.n] ? (state.progress[c][m.n] && state.progress[c][m.n].score) || byMod[m.n].score : null;
      const bg = byMod[m.n] ? (byMod[m.n].pct >= 70 ? "var(--ok)" : "var(--accent-2)") : "";
      rows += `<div class="mod-item" data-mod="${m.n}">
        <div class="mod-num" style="${bg ? "background:" + bg + ";color:#fff" : ""}">${m.n}</div>
        <div><div class="mod-title">${esc(m.title)}</div>
        <div class="mod-meta">${r ? "En iyi: " + r : "Sınav yok"}</div></div>
        <div class="mod-meta">📝</div>
      </div>`;
    }
    html(`<div class="card"><h2>📝 ${COURSES[c].name} Modül Sınavları</h2>
      <p class="muted">Her modülün sonunda 15 soruluk modül testi var. Hedef ölçü: 12/15.</p></div>${rows}`);
    $$("[data-mod]").forEach((el) => (el.onclick = () => go("#/modul/" + c + "/" + el.dataset.mod)));
  },

  async ilerleme() {
    const c = state.course;
    await getManifest();
    const prog = state.progress[c];
    const done = Object.values(prog).filter((m) => m.done).length;
    let totalScore = 0, cnt = 0;
    for (const q of state.quizHistory.filter((q) => q.c === c)) { totalScore += q.pct; cnt++; }
    const avg = cnt ? Math.round(totalScore / cnt) : 0;
    let deck = 0;
    for (const k of ["ru", "fr"]) deck += Object.keys(state.srs[k]).length;
    let grid = "";
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      const ks = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      grid += `<div class="streak-cell ${state.activity[ks] ? "on" : ""} ${i === 0 ? "today" : ""}" title="${ks}"></div>`;
    }
    const recent = state.quizHistory.slice(-8).reverse().map((q) => {
      const man = DATA.manifest && DATA.manifest[q.c];
      const title = man ? ((man.modules.find((m) => m.n === q.n) || {}).title || "") : "";
      return `<p class="small">${q.date} · ${COURSES[q.c].name} Modül ${q.n} — <b>${esc(q.score)}</b> ${esc(title ? "· " + title : "")}</p>`;
    }).join("");
    html(`
    <div class="card"><h2>📈 İlerleme · ${COURSES[c].name}</h2>
      <div class="grid2">
        <div class="stat"><b>${done}/36</b><span>modül</span></div>
        <div class="stat"><b>${cnt}</b><span>sınav</span></div>
        <div class="stat"><b>%${avg}</b><span>ortalama puan</span></div>
        <div class="stat"><b>${deck}</b><span>kelime kartı (iki dil)</span></div>
      </div>
    </div>
    <div class="card"><h2>🔥 ${state.streak.count} gün üst üste</h2>
      <p class="muted small">Son 30 gün aktivite</p>
      <div class="streak-grid">${grid}</div>
    </div>
    <div class="card"><h2>🗒️ Son sınavlar</h2>
      ${recent || '<p class="muted">Henüz sınav yok.</p>'}
    </div>
    <div class="card"><h2>⚙️ Veri</h2>
      <p class="muted">İlerleme cihazında (localStorage) saklanır; hiçbir yere gönderilmez.</p>
      <button class="btn secondary" data-act="export">İlerlemeyi dışarı aktar (JSON)</button>
      <button class="btn ghost" data-act="reset">Tüm ilerlemeyi sil</button>
    </div>`);
  },

  async tips() {
    html(`<div class="card"><h2>💡 Pratik Bilgiler</h2>
      ${TIPS.map((t, i) => `<p>${i + 1}. ${esc(t)}</p>`).join("")}
      <p class="muted small">Kaynak: OKU_BENI ve modül yöntem bölümleri.</p></div>`);
  },

  async study() {
    const c = state.course;
    flashFront = true;
    const now = Date.now();
    flashQ = Object.entries(state.srs[c])
      .filter(([, d]) => d.due <= now)
      .sort((a, b) => a[1].due - b[1].due)
      .map(([id]) => id);
    if (!flashQ.length) {
      const sc = await srsCounters(c);
      showBack(true);
      html(`<div class="card" style="text-align:center">
        <h2>🪺 Kuyruk boş</h2>
        <p class="muted">${sc.remaining > 0 ? "Yeni kelimelerin sıradaki tekrar zamanı ertesi gün. Yeni eklemek için Anasayfadaki \"Günlük 10 kelimeni al\"ı kullan — bugünkü sayı doldu." : "Bugün kart kalmadı. Tekrarlar yarın, 3., 7., 14. günde gelir."}</p>
        <button class="btn secondary" data-nav-link="kelimeler">Kelimeler sayfası</button>
      </div>`);
      return;
    }
    showBack(true);
    renderCard();
  },

  /* -------- modül -------- */
  async modul(c, n) {
    const man = (await getManifest())[c];
    const m = man.modules.find((x) => x.n === +n);
    if (!m || +n > 36 || +n < 1) throw new Error("Modül bulunamadı");
    const t = await getModuleText(c, "m", n);
    const prog = state.progress[c][n] || {};
    showBack(true);
    const testIdx = t.split("\n").findIndex((l) => /^Modül testi/.test(l));
    const readPart = testIdx >= 0 ? t.split("\n").slice(0, testIdx).join("\n") : t;
    const keyPart = testIdx >= 0 ? t.split("\n").slice(testIdx).join("\n") : "";
    const quiz = parseQuiz(t);
    _curModule = c + ":" + n;
    html(`
    <div class="card reader">
      <h2>Modül ${m.n} — ${esc(m.title)}</h2>
      ${renderReaderText(readPart)}
      ${testIdx >= 0 ? `<details class="anskey"><summary>Cevap anahtarı ve açıklamalar</summary><div class="reader">${renderReaderText(keyPart)}</div></details>` : ""}
    </div>
    <div class="card" id="quizMount">
      <h2>📝 Modül ${m.n} Sınavı</h2>
      <p class="muted">${quiz ? esc(quiz.intro || ("Modül testi: soruları çöz, bitince puanın kayda geçer.")) : ""}</p>
      <div id="quizBody"></div>
    </div>
    <button class="btn" data-act="markdone">${prog.done ? "✓ Tamamlandı" : "Modülü tamamla"}</button>`);
    if (quiz) renderQuiz(quiz);
    else html2(`<p class="muted">Bu modülde ayrıştırılabilir test bulunamadı.</p>`);
  },

  /* -------- ek -------- */
  async ek(c, n) {
    const man = (await getManifest())[c];
    const e = man.eks.find((x) => x.n === +n);
    if (!e) throw new Error("Ek bulunamadı");
    const t = await getModuleText(c, "ek", n);
    showBack(true);
    html(`<div class="card reader"><h2>Ek ${e.n} — ${esc(e.title)}</h2>${renderReaderText(t)}</div>
    <button class="btn" data-act="markek">${state.eks[c][e.n] ? "✓ Bitirildi" : "Bitirildi işaretle"}</button>`);
  }
};

function html2(x) { $("#quizBody").innerHTML = x; }

let _curModule = null;
let flashQ = [];
let flashFront = true;

/* ---------------- sınav UI ---------------- */
function renderQuiz(quiz) {
  let qHtml = "";
  const openCount = quiz.questions.filter((q) => !q.args).length;
  let mcCount = 0;
  quiz.questions.forEach((q) => {
    if (q.args) {
      mcCount++;
      qHtml += `<div class="quiz-q" data-typ="${q.n}">
        <b>${q.n}. ${esc(q.args.stem)}</b>
        ${q.args.opts.map((o, oi) => {
          const L = "ABC"[oi];
          return `<button class="opt" data-typ="mc" data-n="${q.n}" data-l="${L}">${L}) ${esc(o)}</button>`;
        }).join("")}
      </div>`;
    } else {
      const ans = quiz.openAnswers[q.n];
      qHtml += `<div class="quiz-q" data-typ="open" data-n="${q.n}">
        <b>${q.n}. ${esc(q.text || "—")}</b>
        ${ans ? `<button class="btn mini ghost revealBtn" data-n="${q.n}">Cevabı göster</button>` : ""}
        <div class="ans-reveal hidden" data-ans="${q.n}">${ans ? esc(ans) : "Cevap anahtarında kayıtlı değil — yazını kendin kontrol et."}</div>
        <div class="selfmark ${ans ? "" : "hidden"}">
          <p class="muted small">Cevabın doğru mu?</p>
          <div style="display:flex;gap:8px">
            <button class="btn mini" style="background:var(--ok);width:auto" data-self="${q.n}" data-v="ok">Doğru ✓</button>
            <button class="btn mini" style="background:var(--bad);width:auto" data-self="${q.n}" data-v="no">Yanlış ✗</button>
          </div>
        </div>
      </div>`;
    }
  });
  if (!mcCount && !openCount) { html2(""); return; }
  html2(qHtml + `<div id="scoreMount"></div>`);

  const answered = {};
  let mcCorrect = 0, selfOk = 0, selfDone = 0;
  let scored = false;

  $$("#quizBody .opt").forEach((b) => {
    b.onclick = () => {
      const n = b.dataset.n;
      if (answered[n]) return;           // mc answer + feedback
      answered[n] = true;
      const L = b.dataset.l;
      const q = quiz.questions.find((x) => x.n === +n);
      const right = q.args.ans === L;
      if (right) { mcCorrect++; toast("Doğru ✓"); }
      const box = b.closest(".quiz-q");
      const optBtns = [...box.querySelectorAll(".opt")];
      const rightBtn = optBtns["ABC".indexOf(q.args.ans)];
      if (rightBtn) rightBtn.classList.add("correct");
      if (!right) b.classList.add("wrong");
      optBtns.forEach((x) => (x.disabled = true));
      finish();
    };
  });
  $$("#quizBody .revealBtn").forEach((b) => {
    b.onclick = () => {
      const n = b.dataset.n;
      b.classList.add("hidden");
      const box = b.closest(".quiz-q");
      box.querySelector('[data-ans="' + n + '"]').classList.remove("hidden");
      box.querySelector(".selfmark").classList.remove("hidden");
    };
  });
  $$("#quizBody [data-self]").forEach((b) => {
    b.onclick = () => {
      const n = b.dataset.n;
      if (answered["o" + n]) return;
      answered["o" + n] = true;
      selfDone++;
      if (b.dataset.v === "ok") { selfOk++; toast("Doğru ✓"); }
      const box = b.closest(".quiz-q");
      if (box) box.querySelectorAll("button").forEach((x) => (x.disabled = true));
      finish();
    };
  });

  function finish() {
    if (scored) return;
    const mcKeys = quiz.questions.filter((q) => q.args).length;
    const openKeys = quiz.questions.length - mcKeys;
    let mcDone = 0;
    for (const q of quiz.questions) if (q.args && answered[q.n]) mcDone++;
    if (mcDone === mcKeys && selfDone === openKeys) {
      scored = true;
      const total = mcKeys + openKeys;
      const score = mcCorrect + selfOk;
      const pct = Math.round((score / total) * 100);
      $("#scoreMount").innerHTML = `
        <div class="scorebox">
          <div class="big" style="color:${pct >= 70 ? "var(--ok)" : "var(--accent-2)"}">${score}/${total} (${pct}%)</div>
          <p class="muted">${pct >= 80 ? "Harika! 12/15 hedefini geçtin 🎉" : pct >= 60 ? "İyi! Biraz tekrarla yeniden dene." : "Hedef 12/15 — modülü tekrar okuyup yeniden dene."}</p>
          <button class="btn secondary" data-nav-link="ilerleme">İlerleme sayfasına git</button>
        </div>`;
      progState(+_curModule.split(":")[1], _curModule.split(":")[0], score + "/" + total, pct);
    }
  }
}

/* ---------------- kart UI ---------------- */
function renderCard() {
  const c = state.course;
  const id = flashQ[0];
  const d = state.srs[c][id];
  if (!d) {
    flashQ.shift();
    if (!flashQ.length) return routes.study();
    return renderCard();
  }
  showBack(true);
  html(`
  <div class="flash-wrap">
    <p class="muted small">${flashQ.length} kart kaldı · ${COURSES[c].name} Modül ${d.m}</p>
    <div class="flash ${flashFront ? "" : "flipped"}" id="flash" tabindex="0">
      <div class="word">${esc(d.w)}</div>
      ${d.p ? `<div class="pron">[${esc(d.p)}]</div>` : ""}
      <div class="mean">${esc(d.t)}</div>
      <div class="hint">${flashFront ? "Çevirmek için dokun" : "Cevabı değerlendir"}</div>
    </div>
    ${flashFront ? "" : `
    <div class="flash-actions">
      <button class="btn" style="background:var(--bad);width:50%" data-rev="no">Tekrar lazım</button>
      <button class="btn" style="background:var(--ok);width:50%" data-rev="ok">Biliyorum ✓</button>
    </div>`}
  </div>`);
  const f = $("#flash");
  f.onclick = () => { flashFront = false; renderCard(); };
  $$("[data-rev]").forEach((b) =>
    (b.onclick = () => {
      reviewCard(c, id, b.dataset.rev === "ok");
      toast(b.dataset.rev === "ok" ? "Kart ilerlendi ✓" : "Ertesi gün geri dönecek");
      flashQ.shift();
      flashFront = true;
      if (!flashQ.length) {
        html(`<div class="card" style="text-align:center"><h2>✅ Günün kartları bitti</h2>
          <p class="muted">Bugün toplam ${state.daily.reviewed} tekrar tamamlandı. Sıradaki tekrarlar takvimde.</p>
          <button class="btn" data-nav-link="home">Anasayfa</button>
        </div>`);
        return;
      }
      renderCard();
    }));
}

/* ---------------- kayıt ---------------- */
function progState(n, c, score, pct) {
  const p = state.progress[c] || (state.progress[c] = {});
  p[n] = p[n] || {};
  p[n].done = true;
  p[n].date = todayStr();
  if (score) p[n].score = score;
  if (score && pct != null) {
    if (!state.quizHistory.some((q) => q.c === c && q.n === n && q.date === todayStr())) {
      state.quizHistory.push({ c, n, score, pct, date: todayStr() });
    }
  }
  markActivity();
  saveState();
  if (score) toast("Sınav sonucu kaydedildi ✓");
  else {
    toast("Modül tamamlandı ✓");
    const btn = $('[data-act="markdone"]');
    if (btn) btn.textContent = "✓ Tamamlandı";
  }
}

/* ---------------- eylemler ---------------- */
document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-act], [data-nav-link]");
  if (!btn) return;
  const nav = btn.dataset.navLink;
  if (nav) { go(nav === "home" ? "#/" : "#/" + nav); return; }
  const act = btn.dataset.act;
  const c = state.course;
  if (act === "flash") {
    const added = await addNewWords(c);
    if (added > 0) toast(added + " yeni kelime eklendi 🎯");
    go("#/study");
  } else if (act === "nextmod") {
    const prog = state.progress[c];
    let n = 36;
    for (let k = 1; k <= 36; k++) { if (!prog[k] || !prog[k].done) { n = k; break; } }
    go("#/modul/" + c + "/" + n);
  } else if (act === "markdone") {
    if (!_curModule) return;
    const [cc, nn] = _curModule.split(":");
    progState(+nn, cc, null, null);
  } else if (act === "markek") {
    const nn = location.hash.split("/").pop();
    state.eks[c][nn] = true;
    markActivity();
    saveState();
    toast("Ek tamamlandı ✓");
    btn.textContent = "✓ Bitirildi";
  } else if (act === "export") {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "diller-ilerleme-" + todayStr() + ".json";
    a.click();
  } else if (act === "reset") {
    if (confirm("Tüm ilerleme silinsin mi?")) {
      localStorage.removeItem(LS_KEY);
      location.reload();
    }
  }
});

/* ---------------- init ---------------- */
$("#backBtn").onclick = () => { showBack(false); go("#/"); };
$("#themeBtn").onclick = () => {
  const cur = document.documentElement.dataset.theme;
  state.theme = cur === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
};
$$(".lang-tab").forEach((b) => (b.onclick = () => {
  state.course = b.dataset.course;
  saveState();
  route();
}));
$$(".tabbar button").forEach((b) => (b.onclick = () => {
  go(b.dataset.nav === "home" ? "#/" : "#/" + b.dataset.nav);
}));

async function route() {
  const h = location.hash || "#/";
  const seg = h.replace(/^#\//, "").split("/");
  const [page = "home", a = "", b = ""] = seg;
  rollDaily();
  setLangTabs();
  flashFront = true;
  $$(".tabbar button").forEach((btn) => btn.classList.toggle("active", btn.dataset.nav === page));
  showBack(true);
  try {
    const handler = routes[page] || routes.home;
    if (page === "home") showBack(false);
    if (a !== "" && (page === "modul" || page === "ek")) await handler(a, b);
    else await handler();
  } catch (e) {
    showBack(true);
    const isFile = location.protocol === "file:";
    const msg = isFile
      ? "Uygulama doğrudan dosyadan (file://) açıldı; veri dosyaları bu biçimde yüklenmiyor.<br><br>Çözüm: <b>index.html</b>'i bir sunucudan aç —<br>1) Termux'ta: <code>python -m http.server 8080</code> → tarayıcıda <code>http://localhost:8080</code><br>2) Ya da GitHub Pages'e yükle (README'deki adımlar)."
      : (e.message || String(e));
    html(`<div class="card"><h2>😅 İçerik yüklenemedi</h2><p class="muted">${msg}</p>
    <button class="btn" data-nav-link="home">Anasayfayı yeniden dene</button></div>`);
  }
}
window.addEventListener("hashchange", route);
applyTheme();
rollDaily();
route();
