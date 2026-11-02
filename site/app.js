// 英文文法校稿台 — runs Harper (https://writewithharper.com) entirely in the browser.
// The GitHub Actions workflow copies harper.js into ./vendor/harper/ so the site has
// no third-party runtime dependency. If that copy is missing (e.g. opening the file
// locally), we fall back to the same pinned version on unpkg.

import { checkCustom } from "./rules.js";

const HARPER_VERSION = "2.13.0";
const SOURCES = [
  "./vendor/harper/",
  `https://unpkg.com/harper.js@${HARPER_VERSION}/dist/`,
];

const EXAMPLE = `Hi Martin,

Thank you for you email yesterday. I have checked with our team and we will send the updated quotation untill Friday. Please let me know if you has any question.

Looking forward to hear from you.

Best regards,
Gary`;

// Harper's lint categories → Traditional Chinese (Taiwan) label + short explanation.
// "err" = 錯誤 (orange), "sug" = 建議 (blue).
const KINDS = {
  Agreement:      ["err", "一致性", "主詞和動詞、或冠詞和名詞的單複數沒有對上。"],
  BoundaryError:  ["err", "連寫／分寫", "這個字應該連在一起寫，或應該分開寫。"],
  Capitalization: ["err", "大小寫", "大小寫不正確，例如句首、專有名詞或 I。"],
  Eggcorn:        ["err", "誤聽誤寫", "把聽起來很像的詞組寫錯了。"],
  Grammar:        ["err", "文法", "句子結構或詞性用法有誤。"],
  Malapropism:    ["err", "近音誤用", "用了一個發音相近、但意思不同的字。"],
  Nonstandard:    ["err", "非標準用法", "這種寫法不是標準英文，正式場合建議避免。"],
  Punctuation:    ["err", "標點", "標點符號或連字號使用有誤。"],
  Spelling:       ["err", "拼字", "拼字錯誤，或字典裡查不到這個字。"],
  Typo:           ["err", "打字錯誤", "看起來是手誤打錯的字。"],
  Usage:          ["err", "慣用搭配", "這個字的搭配方式不符合英文慣用法。"],
  WordOrder:      ["err", "語序", "字的順序不自然或不正確。"],
  WordChoice:     ["err", "用字", "這個字可能用錯了，或有詞形錯誤（例如該用 V-ing）。"],
  Enhancement:    ["sug", "表達加強", "沒有錯，但可以寫得更清楚有力。"],
  Formatting:     ["sug", "格式", "空格、排版等格式問題。"],
  Miscellaneous:  ["sug", "其他", "其他值得注意的地方。"],
  Readability:    ["sug", "易讀性", "句子可能太長或太複雜，建議拆開。"],
  Redundancy:     ["sug", "贅詞", "意思重複了，可以刪掉多餘的字。"],
  Regionalism:    ["sug", "地區用法", "這是某些地區（如美式／英式）才用的寫法。"],
  Repetition:     ["sug", "重複", "同一個字連續出現了兩次。"],
  Style:          ["sug", "風格", "兩種寫法都對，但這種比較常見或比較正式。"],

};
const kindInfo = k => KINDS[k] || ["sug", k || "其他", "值得檢查的地方。"];

const $ = id => document.getElementById(id);
const src = $("src"), engineEl = $("engine");

let harper = null;        // { linter, Dialect, SuggestionKind }
let current = [];         // plain lint records for the latest run
let runId = 0;
let timer = 0;
let ignoredCount = 0;
const ignoredCustom = new Set();   // 已忽略的補充規則提示
const NAME_KINDS = new Set(["Spelling", "Typo", "WordChoice", "Miscellaneous"]);

// ---------- loading ----------
async function loadHarper() {
  let lastErr;
  for (const base of SOURCES) {
    try {
      const [main, bin] = await Promise.all([
        import(base + "index.js"),
        import(base + "binary.js"),
      ]);
      const linter = new main.WorkerLinter({ binary: bin.binary });
      await linter.setup();
      return { linter, Dialect: main.Dialect, SuggestionKind: main.SuggestionKind, base };
    } catch (e) {
      lastErr = e;
      console.warn("Harper load failed from", base, e);
    }
  }
  throw lastErr;
}

// ---------- linting ----------
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, 350);
}

async function run() {
  updateCount();
  saveDraft();
  if (!harper) return;
  const text = src.value;
  const id = ++runId;
  if (!text.trim()) { current = []; render(text); return; }
  let lints;
  try {
    lints = await harper.linter.lint(text, { language: "plaintext" });
  } catch (e) {
    console.error(e);
    setEngine("檢查時發生錯誤，請重新整理頁面。", "err");
    return;
  }
  if (id !== runId) return; // a newer run started
  const fromHarper = lints.map(lint => {
    const span = lint.span();
    const kind = lint.lint_kind();
    const problem = lint.get_problem_text ? lint.get_problem_text() : text.slice(span.start, span.end);
    return {
      lint, start: span.start, end: span.end, kind, problem,
      message: lint.message(),
      // 大寫開頭、被當成拼錯的字，多半是人名或公司名（例如 Novak）
      maybeName: NAME_KINDS.has(kind) && /^[A-Z][a-z]/.test(problem),
      suggestions: lint.suggestions().slice(0, 4).map(s => ({
        text: s.get_replacement_text(),
        kind: Number(s.kind()),
      })),
    };
  });
  // 補充規則：和 Harper 重疊的就不重複顯示
  const extra = checkCustom(text).filter(c =>
    !ignoredCustom.has(customKey(c)) &&
    !fromHarper.some(h => c.start < h.end && h.start < c.end));
  current = [...fromHarper, ...extra].sort((a, b) => a.start - b.start);
  render(text);
}

// ---------- applying suggestions ----------
// SuggestionKind: 0 = Replace, 1 = Remove, 2 = InsertAfter
function applyTo(text, rec, sug) {
  if (sug.kind === 1) return text.slice(0, rec.start) + text.slice(rec.end);
  if (sug.kind === 2) return text.slice(0, rec.end) + sug.text + text.slice(rec.end);
  return text.slice(0, rec.start) + sug.text + text.slice(rec.end);
}
function sugLabel(rec, sug) {
  if (sug.kind === 1) return "刪除";
  if (sug.kind === 2) return rec.problem + sug.text;
  return sug.text === "" ? "刪除" : sug.text;
}
function customKey(r) { return r.rule + "|" + r.problem.toLowerCase(); }

function applyAll(text, recs) {
  // apply right-to-left so earlier offsets stay valid; skip overlaps
  let out = text, lastStart = Infinity;
  for (const rec of [...recs].sort((a, b) => b.start - a.start)) {
    if (!rec.suggestions.length || rec.maybeName || rec.end > lastStart) continue;
    out = applyTo(out, rec, rec.suggestions[0]);
    lastStart = rec.start;
  }
  return out;
}

// ---------- rendering ----------
function visible() {
  const onlyErr = $("errorsOnly").checked;
  return current.filter(r => !onlyErr || kindInfo(r.kind)[0] === "err");
}

function render(text) {
  const recs = visible();
  const errN = current.filter(r => kindInfo(r.kind)[0] === "err").length;
  const sugN = current.length - errN;
  $("tally").textContent = text.trim() ? `${errN} 個錯誤 · ${sugN} 個建議` : "";

  // marked-up proof
  const proof = $("proof");
  proof.replaceChildren();
  let cur = 0;
  recs.forEach((r, n) => {
    if (r.start < cur) return;
    proof.append(document.createTextNode(text.slice(cur, r.start)));
    const mk = document.createElement("mark");
    if (kindInfo(r.kind)[0] === "sug") mk.className = "sug";
    mk.textContent = text.slice(r.start, r.end) || " ";
    const sup = document.createElement("sup");
    sup.textContent = n + 1;
    mk.append(sup);
    mk.title = kindInfo(r.kind)[1];
    mk.addEventListener("click", () => focusItem(n));
    proof.append(mk);
    cur = r.end;
  });
  proof.append(document.createTextNode(text.slice(cur)));

  // issue list
  const ol = $("issues");
  ol.replaceChildren();
  if (!text.trim()) {
    ol.append(emptyLi("在左邊貼上英文，就會自動開始檢查。"));
  } else if (!recs.length) {
    ol.append(emptyLi(current.length ? "沒有錯誤，只剩風格建議（已隱藏）。" : "沒有發現問題 ✓", true));
  }
  recs.forEach((r, n) => {
    const [sev, zhName, zhWhy] = kindInfo(r.kind);
    const li = document.createElement("li");
    if (sev === "sug") li.className = "sug";
    const num = el("div", "num", String(n + 1).padStart(2, "0"));
    const body = document.createElement("div");
    const head = el("div", "head");
    head.append(el("span", "problem", r.problem || "（此處）"), el("span", "kind", r.maybeName ? "人名？" : zhName));
    if (r.custom) head.append(el("span", "src-tag", "校稿台規則"));
    const acts = el("div", "acts");
    r.suggestions.forEach(s => {
      const b = el("button", "fix", sugLabel(r, s));
      b.type = "button";
      b.title = "套用這個修正";
      b.addEventListener("click", () => { src.value = applyTo(src.value, r, s); run(); });
      acts.append(b);
    });
    if (r.maybeName) {
      const add = el("button", "ign", "這是人名／專有名詞，加入字典");
      add.type = "button";
      add.addEventListener("click", () => addWord(r.problem));
      acts.append(add);
    }
    const ign = el("button", "ign", "忽略");
    ign.type = "button";
    ign.addEventListener("click", async () => {
      if (r.custom) ignoredCustom.add(customKey(r));
      else { try { await harper.linter.ignoreLint(src.value, r.lint); } catch (e) { console.warn(e); } }
      ignoredCount++; $("resetIgnoreBtn").hidden = false;
      run();
    });
    acts.append(ign);
    const zhText = r.maybeName
      ? "字典裡沒有這個字。如果是人名、公司名或產品名，請忽略或加入字典；「套用建議後的版本」不會自動修改它。"
      : (r.zh || zhWhy);
    body.append(head, el("div", "zh", zhText));
    if (!r.custom) body.append(el("div", "en", r.message));
    body.append(acts);
    li.append(num, body);
    ol.append(li);
  });

  $("fixed").textContent = text.trim() ? applyAll(text, current.filter(r => recs.includes(r))) : "";
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function emptyLi(msg, good) {
  const li = document.createElement("li");
  li.style.display = "block";
  li.append(el("p", good ? "empty good" : "empty", msg));
  return li;
}
function focusItem(n) {
  const li = $("issues").children[n];
  if (!li) return;
  li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  li.classList.add("flash");
  setTimeout(() => li.classList.remove("flash"), 1200);
}
function setEngine(msg, cls) {
  engineEl.textContent = msg;
  engineEl.className = "engine" + (cls ? " " + cls : "");
}
function updateCount() {
  const t = src.value.trim();
  $("count").textContent = (t ? t.split(/\s+/).length : 0) + " words";
}

// ---------- clipboard ----------
async function copy(text, btn) {
  const orig = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "已複製";
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand("copy"); btn.textContent = "已複製"; } catch { btn.textContent = "複製失敗"; }
    ta.remove();
  }
  setTimeout(() => (btn.textContent = orig), 1500);
}

// ---------- personal dictionary ----------
function loadWords() { try { return JSON.parse(localStorage.getItem("gc-words") || "[]"); } catch { return []; } }
async function addWord(w) {
  const words = loadWords();
  if (!words.includes(w)) { words.push(w); try { localStorage.setItem("gc-words", JSON.stringify(words)); } catch {} }
  try { await harper.linter.importWords([w]); } catch (e) { console.warn(e); }
  run();
}

// ---------- drafts ----------
function saveDraft() { try { localStorage.setItem("gc-draft", src.value); } catch {} }
function loadDraft() { try { return localStorage.getItem("gc-draft"); } catch { return null; } }
function saveDialect(v) { try { localStorage.setItem("gc-dialect", v); } catch {} }
function loadDialect() { try { return localStorage.getItem("gc-dialect"); } catch { return null; } }

// ---------- appearance ----------
function currentTheme() { try { return localStorage.getItem("gc-theme") || "auto"; } catch { return "auto"; } }
function setTheme(t) {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { t === "auto" ? localStorage.removeItem("gc-theme") : localStorage.setItem("gc-theme", t); } catch {}
  document.querySelectorAll("[data-theme-choice]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === t)));
}
document.querySelectorAll("[data-theme-choice]").forEach(b => b.addEventListener("click", () => setTheme(b.dataset.themeChoice)));
setTheme(currentTheme());

// ---------- wiring ----------
src.value = loadDraft() ?? EXAMPLE;
updateCount();
render(src.value);
$("proof").textContent = src.value;
$("issues").replaceChildren(emptyLi("檢查引擎載入中，第一次開啟約需幾秒…"));

const savedDialect = loadDialect();
if (savedDialect) $("dialect").value = savedDialect;

src.addEventListener("input", schedule);
$("errorsOnly").addEventListener("change", () => render(src.value));
$("exampleBtn").addEventListener("click", () => { src.value = EXAMPLE; run(); });
$("clearBtn").addEventListener("click", () => { src.value = ""; run(); src.focus(); });
$("copyFixed").addEventListener("click", e => copy($("fixed").textContent, e.currentTarget));
$("useFixed").addEventListener("click", () => { if ($("fixed").textContent) { src.value = $("fixed").textContent; run(); } });
$("copyPrompt").addEventListener("click", e => copy(
`請幫我檢查並改寫以下英文，用簡單易懂的英文，讓它更自然、適合商務場合。
請用台灣繁體中文說明主要修改的地方，並提供兩個版本：
1. 微調版：盡量保留原文，只修正錯誤
2. 完整修改版：改寫得更自然流暢

"""
${src.value.trim()}
"""`, e.currentTarget));
$("resetIgnoreBtn").addEventListener("click", async () => {
  try { await harper.linter.clearIgnoredLints(); } catch {}
  ignoredCustom.clear();
  ignoredCount = 0; $("resetIgnoreBtn").hidden = true; run();
});
$("dialect").addEventListener("change", async e => {
  saveDialect(e.target.value);
  if (!harper) return;
  try { await harper.linter.setDialect(harper.Dialect[e.target.value]); } catch (err) { console.warn(err); }
  run();
});

loadHarper().then(async h => {
  harper = h;
  const d = $("dialect").value;
  if (d !== "American") { try { await h.linter.setDialect(h.Dialect[d]); } catch {} }
  const words = loadWords();
  if (words.length) { try { await h.linter.importWords(words); } catch {} }
  setEngine("檢查引擎已就緒 · 離線運作", "ready");
  run();
}).catch(() => {
  setEngine("檢查引擎載入失敗", "err");
  $("issues").replaceChildren(emptyLi("無法載入檢查引擎。請確認網路連線，或請管理員確認網站已透過 GitHub Actions 部署（會自動放入引擎檔案）。"));
});
