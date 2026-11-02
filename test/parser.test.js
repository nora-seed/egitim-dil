// app.js'deki parse + reader fonksiyonlarını stub DOM ile yükle, gerçek txt ile test et
const fs = require("fs"), path = require("path");

const els = new Map();
function elStub(key) {
  if (!els.has(key)) els.set(key, { innerHTML: "", textContent: "", dataset: {}, classList: { toggle() {}, add() {}, remove() {} } });
  return els.get(key);
}
global.document = {
  querySelector: (s) => elStub(s),
  querySelectorAll: () => [],
  addEventListener: () => {},
  documentElement: { dataset: {} }
};
global.window = { addEventListener: () => {}, scrollTo: () => {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.matchMedia = () => ({ matches: false, addEventListener: () => {} });
global.location = { hash: "", protocol: "file:", hostname: "" };
global.navigator = {};
global.confirm = () => false;
global.alert = () => {};

const src = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
let fixed = src.replace('window.addEventListener("hashchange", route);', "");
fixed = fixed.replace(/applyTheme\(\);\s*rollDaily\(\);\s*route\(\);[\s\S]*$/, "global.PF = { parseQuiz, renderReaderText };");
(0, eval)(fixed);
const { parseQuiz: PF_parseQuiz, renderReaderText: PF_render } = global.PF;
const parseQuiz = PF_parseQuiz;
const renderReaderText = PF_render;

(async () => {
  const dataDir = "/data/data/com.termux/files/home/diller-pwa/data";
  const mcHave = { mc: 0, open: 0, both: 0, none: 0 };
  let worst = [];
  let pass = 0, fail = 0;
  for (const lang of ["ru", "fr"]) {
    for (let n = 1; n <= 36; n++) {
      const t = fs.readFileSync(`${dataDir}/${lang}/m${n}.txt`, "utf8");
      const quiz = parseQuiz(t);
      if (!quiz) { worst.push(`${lang} m${n}: QUIZ YOK`); continue; }
      const mcQ = quiz.questions.filter((q) => q.args).length;
      const openQ = quiz.questions.length - mcQ;
      if (mcQ > 0 && openQ > 0) mcHave.both++;
      else if (mcQ > 0) mcHave.mc++;
      else if (openQ > 0) mcHave.open++;
      else mcHave.none++;
      if (mcQ >= 3 && openQ >= 5) pass++;
      else fail++;
      if (mcQ < 3 || openQ < 5) worst.push(`${lang} m${n}: MC=${mcQ} açık=${openQ} toplam=${quiz.questions.length}`);
    }
  }
  console.log("QUIZ sonuç: iyi=%d zayıf=%d ayrıntı:", pass, fail);
  console.log(worst.join("\n"));
  console.log("dağılım:", JSON.stringify(mcHave));
  // cevap anahtarları doğru mu: ru m2 kontrol
  const q2 = parseQuiz(fs.readFileSync(`${dataDir}/ru/m2.txt`, "utf8"));
  const mc2 = {};
  q2.questions.forEach(q => { if (q.args) mc2[q.n] = q.args.ans; });
  console.log("RU m2 MC cevapları:", JSON.stringify(mc2));
  const fr2 = parseQuiz(fs.readFileSync(`${dataDir}/fr/m2.txt`, "utf8"));
  console.log("FR m2 soru sayısı:", fr2.questions.length, "MC:", fr2.questions.filter(q => q.args).length);
  // reader kırpma
  const r = renderReaderText(fs.readFileSync(`${dataDir}/ru/m2.txt`, "utf8"), true);
  console.log("reader html uzunluk:", r.length, "h2/h3 adet:", (r.match(/<h[23]>/g) || []).length);
  // vocab json boyut kontrol
  for (const l of ["ru", "fr"]) {
    const v = JSON.parse(fs.readFileSync(`${dataDir}/${l}-vocab.json`, "utf8"));
    console.log(l, "vocab:", v.length);
  }
  console.log("---- TEST TAMAM ----");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

