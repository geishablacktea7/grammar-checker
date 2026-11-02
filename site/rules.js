// 校稿台補充規則：補上 Harper 刻意不抓、但台灣人寫英文常犯的錯誤。
// 每條規則都盡量「只在很確定時才提示」，寧可漏抓也不要亂抓。
// 回傳的格式與 app.js 的提示紀錄相同：{start, end, kind, problem, zh, suggestions, rule}

// base: [第三人稱單數, 過去式, 過去分詞]
const VERBS = {
  accept: ["accepts", "accepted", "accepted"], agree: ["agrees", "agreed", "agreed"],
  allow: ["allows", "allowed", "allowed"], apply: ["applies", "applied", "applied"],
  approve: ["approves", "approved", "approved"], arrive: ["arrives", "arrived", "arrived"],
  ask: ["asks", "asked", "asked"], attach: ["attaches", "attached", "attached"],
  be: ["is", "was", "been"], become: ["becomes", "became", "become"],
  begin: ["begins", "began", "begun"], belong: ["belongs", "belonged", "belonged"],
  bring: ["brings", "brought", "brought"], buy: ["buys", "bought", "bought"],
  call: ["calls", "called", "called"], cancel: ["cancels", "cancelled", "cancelled"],
  change: ["changes", "changed", "changed"], check: ["checks", "checked", "checked"],
  choose: ["chooses", "chose", "chosen"], come: ["comes", "came", "come"],
  complete: ["completes", "completed", "completed"], confirm: ["confirms", "confirmed", "confirmed"],
  contact: ["contacts", "contacted", "contacted"], contain: ["contains", "contained", "contained"],
  cost: ["costs", "cost", "cost"], cover: ["covers", "covered", "covered"],
  create: ["creates", "created", "created"], decide: ["decides", "decided", "decided"],
  deliver: ["delivers", "delivered", "delivered"], depend: ["depends", "depended", "depended"],
  discuss: ["discusses", "discussed", "discussed"], do: ["does", "did", "done"],
  find: ["finds", "found", "found"], finish: ["finishes", "finished", "finished"],
  forget: ["forgets", "forgot", "forgotten"], get: ["gets", "got", "gotten"],
  give: ["gives", "gave", "given"], go: ["goes", "went", "gone"],
  happen: ["happens", "happened", "happened"], have: ["has", "had", "had"],
  hear: ["hears", "heard", "heard"], help: ["helps", "helped", "helped"],
  include: ["includes", "included", "included"], inform: ["informs", "informed", "informed"],
  know: ["knows", "knew", "known"], leave: ["leaves", "left", "left"],
  like: ["likes", "liked", "liked"], look: ["looks", "looked", "looked"],
  make: ["makes", "made", "made"], mean: ["means", "meant", "meant"],
  meet: ["meets", "met", "met"], mention: ["mentions", "mentioned", "mentioned"],
  need: ["needs", "needed", "needed"], order: ["orders", "ordered", "ordered"],
  pay: ["pays", "paid", "paid"], prepare: ["prepares", "prepared", "prepared"],
  provide: ["provides", "provided", "provided"], receive: ["receives", "received", "received"],
  reply: ["replies", "replied", "replied"], require: ["requires", "required", "required"],
  return: ["returns", "returned", "returned"], review: ["reviews", "reviewed", "reviewed"],
  say: ["says", "said", "said"], see: ["sees", "saw", "seen"],
  seem: ["seems", "seemed", "seemed"], sell: ["sells", "sold", "sold"],
  send: ["sends", "sent", "sent"], ship: ["ships", "shipped", "shipped"],
  show: ["shows", "showed", "shown"], sign: ["signs", "signed", "signed"],
  solve: ["solves", "solved", "solved"], start: ["starts", "started", "started"],
  submit: ["submits", "submitted", "submitted"], support: ["supports", "supported", "supported"],
  take: ["takes", "took", "taken"], tell: ["tells", "told", "told"],
  think: ["thinks", "thought", "thought"], try: ["tries", "tried", "tried"],
  understand: ["understands", "understood", "understood"], update: ["updates", "updated", "updated"],
  use: ["uses", "used", "used"], want: ["wants", "wanted", "wanted"],
  work: ["works", "worked", "worked"], write: ["writes", "wrote", "written"],
};
const PAST_TO_BASE = {};
for (const [b, [, past, pp]] of Object.entries(VERBS)) {
  if (b === "be" || b === "have") continue;
  PAST_TO_BASE[past] = b; PAST_TO_BASE[pp] = b;
}
const BASE_RE = Object.keys(VERBS).filter(v => v !== "be").join("|");
const PAST_RE = Object.keys(PAST_TO_BASE).join("|");

const PRONOUNS = new Set(["i", "you", "we", "they", "he", "she", "it", "me", "us", "them", "our", "your", "their", "my", "his", "her", "its"]);
// 這些字放在主詞前面時，後面接原形動詞是對的：Does it include / Let it go / will it work
const BEFORE_OK = new Set(["do", "does", "did", "can", "could", "will", "would", "shall", "should", "may", "might", "must",
  "let", "make", "makes", "made", "help", "helps", "see", "saw", "watch", "hear", "heard", "have", "has", "had", "to",
  "doesn't", "don't", "didn't", "can't", "won't", "wouldn't", "shouldn't", "couldn't"]);

const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|noon|the end of|end of|next week|next month|eod|cob";
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const DEADLINE_VERBS = /\b(send|sent|deliver|submit|reply|respond|finish|complete|confirm|provide|pay|ship|return|prepare|share|update|get back|let (?:me|us) know|receive|have it ready|be ready)\b/i;

function keepCase(orig, repl) {
  if (orig[0] && orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase()) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
}
function prevWord(text, idx) {
  const m = /([A-Za-z']+)\s*$/.exec(text.slice(Math.max(0, idx - 30), idx));
  return m ? m[1].toLowerCase() : "";
}
function sentenceAround(text, idx) {
  const before = text.slice(0, idx);
  const s = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n")) + 1;
  const rest = text.slice(idx);
  const m = /[.!?\n]/.exec(rest);
  return text.slice(s, m ? idx + m.index : text.length);
}


// ---------- 名詞單複數 ----------
// 只收「一定是可數」的常見名詞，避免 time、work、business 這類可數也可不可數的字造成誤判。
const COUNTABLE = `apple banana orange egg potato tomato cake cookie sandwich bottle cup glass plate
item order product customer client email message question problem issue invoice receipt quotation contract
day week month year hour minute second document file folder meeting call person child man woman
company country city town change request comment idea reason way thing example step option project task
colleague friend book car box bag package parcel shipment delivery supplier vendor price report chance
mistake error user member employee manager student teacher page picture photo case part piece point result
detail team office store shop restaurant hotel word sentence language holiday trip plan version update
computer phone laptop screen key table chair door window room house building street road bus train flight
ticket seat event course lesson class test exam task deadline account address number letter partner
side complaint
department branch factory warehouse truck pallet sample feature tool app website link account problem
solution answer reply proposal suggestion offer discount payment transfer bill department colleague
dog cat bird tree flower leaf knife life wife shelf half foot tooth mouse`.split(/\s+/).filter(Boolean);
const IRREG_PL = { person: "people", child: "children", man: "men", woman: "women", foot: "feet", tooth: "teeth", mouse: "mice",
  knife: "knives", life: "lives", wife: "wives", shelf: "shelves", half: "halves", leaf: "leaves", potato: "potatoes", tomato: "tomatoes" };
function plural(n) {
  if (IRREG_PL[n]) return IRREG_PL[n];
  if (/[^aeiou]y$/.test(n)) return n.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/.test(n)) return n + "es";
  return n + "s";
}
const SING = new Set(COUNTABLE);
const PL_TO_SING = {};
for (const n of COUNTABLE) PL_TO_SING[plural(n)] = n;
const ADJ = "new|old|big|small|large|different|good|bad|important|other|red|green|yellow|fresh|local|major|minor|similar|possible|additional|potential|urgent|open|last|next|few|great|nice|long|short|main|key|simple|small";
const NUMS = "two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|hundred|[2-9]|[1-9][0-9]+";

function nextWordAfter(text, idx) {
  const m = /^\s+([A-Za-z]+)/.exec(text.slice(idx));
  return m ? m[1].toLowerCase() : "";
}

function countRules() {
  const nounSing = COUNTABLE.join("|");
  const nounPl = Object.keys(PL_TO_SING).join("|");
  const mk = (id, re, check) => ({ id, re, check });
  return [
    // 需要複數的數量詞 + 單數名詞
    mk("plural-after-quantifier",
      new RegExp(`\\b(many|several|few|a few|both|these|those|various|numerous|multiple|a couple of|a number of|a lot of|lots of|${NUMS})\\s+(?:(${ADJ})\\s+)?(${nounSing})\\b`, "gi"),
      (m, text) => {
        const q = m[1].toLowerCase(), noun = m[3];
        const after = nextWordAfter(text, m.index + m[0].length);
        // "many apple trees"、"two email addresses"：後面還接名詞時，這個字是當形容詞用
        if (SING.has(after) || PL_TO_SING[after] || /^(trees|addresses|numbers|accounts|lists|types|sizes|models|levels|managers|members|pages)$/.test(after)) return null;
        // 數字當編號用：Version 2 update、Room 12 key、Step 3 result
        if (/^\d/.test(q) && /^(version|v|room|step|phase|level|page|chapter|section|model|no|number|item|line|gate|floor|building|week|day|year|q|part|type|size|option|plan|team|group)$/i.test(prevWord(text, m.index))) return null;
        // 數字後面接年份、時間等不是名詞的情況
        if (/^\d/.test(q) && /^(year|day|hour|minute|month|week)$/i.test(noun) && /-/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 1))) return null;
        const pl = plural(noun.toLowerCase());
        const fixed = noun[0] === noun[0].toUpperCase() ? pl[0].toUpperCase() + pl.slice(1) : pl;
        const start = m.index + m[0].length - noun.length;
        return {
          start, end: start + noun.length, kind: "Agreement", problem: noun,
          zh: `「${m[1]}」後面的可數名詞要用複數：${noun} → ${fixed}。`,
          suggestions: [{ text: fixed, kind: 0 }],
        };
      }),
    // 需要單數的限定詞 + 複數名詞
    mk("singular-after-each",
      new RegExp(`\\b(each|every|one|a single|another)\\s+(?:(${ADJ})\\s+)?(${nounPl})\\b`, "gi"),
      (m, text) => {
        const q = m[1].toLowerCase();
        // "one of the items" 不會被抓（of 在中間）；"each others" 之類不在名詞表
        if (q === "one" && /^\s+of\b/i.test(text.slice(m.index + m[0].length))) return null;
        const noun = m[3], sing = PL_TO_SING[noun.toLowerCase()];
        const fixed = noun[0] === noun[0].toUpperCase() ? sing[0].toUpperCase() + sing.slice(1) : sing;
        const start = m.index + m[0].length - noun.length;
        return {
          start, end: start + noun.length, kind: "Agreement", problem: noun,
          zh: `「${m[1]}」後面的名詞要用單數：${noun} → ${fixed}。`,
          suggestions: [{ text: fixed, kind: 0 }],
        };
      }),
    // much + 可數複數 → many
    mk("much-countable",
      new RegExp(`\\b(much|how much|too much|so much)\\s+(${nounPl})\\b`, "gi"),
      (m) => {
        const word = m[1].replace(/much/i, w => (w[0] === "M" ? "Many" : "many"));
        return {
          start: m.index, end: m.index + m[1].length, kind: "Agreement", problem: m[1],
          zh: `${m[2]} 是可數名詞，數量多要用 many，much 是給不可數名詞（例如 much time、much money）。`,
          suggestions: [{ text: word, kind: 0 }],
        };
      }),
  ];
}

const RULES = [
  // 1. 第三人稱單數：It include / He need / This email find
  {
    id: "third-person",
    re: new RegExp(`\\b(he|she|it|this(?: [a-z]+)?)\\s+((?:also|still|only|always|usually|often|never|really|just)\\s+)?(${BASE_RE})\\b`, "gi"),
    check(m, text) {
      const subj = m[1].toLowerCase();
      if (subj.startsWith("this ")) {
        const noun = subj.slice(5);
        if (PRONOUNS.has(noun) || /s$/.test(noun) || VERBS[noun] || ["is", "was", "will", "would", "can", "could", "should", "may", "might", "must", "does", "did", "has", "had", "week", "month", "year", "time", "morning", "afternoon", "evening"].includes(noun)) return null;
      }
      if (BEFORE_OK.has(prevWord(text, m.index))) return null;
      const verb = m[3];
      const fixed = keepCase(verb, VERBS[verb.toLowerCase()][0]);
      const start = m.index + m[0].length - verb.length;
      return {
        start, end: start + verb.length, kind: "Agreement", problem: verb,
        zh: `主詞「${m[1]}」是第三人稱單數，現在式動詞要加 s：${verb} → ${fixed}。`,
        suggestions: [{ text: fixed, kind: 0 }],
      };
    },
  },
  // 2. have/has not + 原形動詞 → 過去分詞：have not receive → received
  {
    id: "perfect-participle",
    re: new RegExp(`\\b(have|has|had)(?:n't|\\s+not|\\s+never|\\s+already|\\s+just|\\s+yet)?\\s+(${BASE_RE})\\b`, "gi"),
    check(m) {
      const verb = m[2], low = verb.toLowerCase();
      if (low === "to" || low === "have") return null;
      // "have" 當「擁有」時後面接名詞，例如 have work / have support，這些字當名詞太常見，不提示
      if (["work", "support", "order", "change", "review", "update", "help", "use", "look", "return", "cost", "need", "start", "call", "contact", "meet", "sign", "check", "cover", "find", "mean", "like", "ship", "show", "want", "leave", "talk"].includes(low) && !/n't|not|never|already|just/i.test(m[0])) return null;
      const pp = VERBS[low][2];
      if (pp === low) return null;
      const fixed = keepCase(verb, pp);
      const start = m.index + m[0].length - verb.length;
      return {
        start, end: start + verb.length, kind: "Grammar", problem: verb,
        zh: `完成式（have/has/had）後面要接過去分詞：${verb} → ${fixed}。`,
        suggestions: [{ text: fixed, kind: 0 }],
      };
    },
  },
  // 3. did/does/do not + 過去式 → 原形：did not received → receive
  {
    id: "do-base",
    re: new RegExp(`\\b(did|does|do)(?:n't|\\s+not)\\s+(${PAST_RE})\\b`, "gi"),
    check(m) {
      const verb = m[2];
      const base = PAST_TO_BASE[verb.toLowerCase()];
      if (!base || base === verb.toLowerCase()) return null;
      const fixed = keepCase(verb, base);
      const start = m.index + m[0].length - verb.length;
      return {
        start, end: start + verb.length, kind: "Grammar", problem: verb,
        zh: `do/does/did 後面要接原形動詞：${verb} → ${fixed}。`,
        suggestions: [{ text: fixed, kind: 0 }],
      };
    },
  },
  // 4. until + 期限 → by：send it until Friday → by Friday
  {
    id: "until-deadline",
    re: new RegExp(`\\buntil(?=\\s+(?:${DAYS}|${MONTHS}|\\d|the \\d|next|this (?:week|month|friday|monday|tuesday|wednesday|thursday)))`, "gi"),
    check(m, text) {
      const sent = sentenceAround(text, m.index);
      if (!DEADLINE_VERBS.test(sent)) return null;
      if (/\b(not|n't|wait|stay|valid|open|available|closed|away|off|out of)\b/i.test(sent)) return null;
      const fixed = keepCase(m[0], "by");
      return {
        start: m.index, end: m.index + m[0].length, kind: "Usage", problem: m[0],
        zh: "「在某時間之前完成」要用 by；until 是「一直持續到」某時間。這句講的是期限，所以用 by。",
        suggestions: [{ text: fixed, kind: 0 }],
      };
    },
  },
  // 5. 未來的事，before/after/when 後面卻用過去式：make sure ... before we sent it
  {
    id: "time-clause-tense",
    re: new RegExp(`\\b(before|after|once|when|until)\\s+(we|i|you|they|he|she|it)\\s+(${PAST_RE})\\b`, "gi"),
    check(m, text) {
      const sent = sentenceAround(text, m.index);
      if (!/\b(will|want|wants|need|needs|going to|make sure|plan|please|let me know|would like)\b/i.test(sent)) return null;
      const verb = m[3];
      let base = PAST_TO_BASE[verb.toLowerCase()];
      if (!base || base === verb.toLowerCase()) return null;
      const subj = m[2].toLowerCase();
      if (["he", "she", "it"].includes(subj)) base = VERBS[base][0];
      const fixed = keepCase(verb, base);
      const start = m.index + m[0].length - verb.length;
      return {
        start, end: start + verb.length, kind: "Grammar", problem: verb,
        zh: `這句在講還沒發生的事，${m[1]} 後面的動詞用現在式（不用 will）：${verb} → ${fixed}。如果是在講過去的事，可以忽略。`,
        suggestions: [{ text: fixed, kind: 0 }],
      };
    },
  },
  // 6. 數量詞與名詞單複數：Many apple / two order / every days / much apples
  ...countRules(),
  // 6. 中式英文常見固定錯誤
  ...[
    [/\bdiscuss(?:ed|es|ing)?\s+about\b/gi, m => m[0].replace(/\s+about$/i, ""), "discuss 是及物動詞，後面直接接討論的事，不用加 about。"],
    [/\b(?:I|we|they|you) (?:am|are) agree\b/gi, m => m[0].replace(/\s(am|are) agree/i, " agree"), "agree 是動詞，不用加 am/are。"],
    [/\b(?:he|she|it) is agree\b/gi, m => m[0].replace(/\sis agree/i, " agrees"), "agree 是動詞，不用加 is；第三人稱要寫 agrees。"],
    [/\breturn(?:ed|s|ing)?\s+back\b/gi, m => m[0].replace(/\s+back$/i, ""), "return 本身就有「回來、歸還」的意思，back 多餘。"],
    [/\bexplain(?:ed|s|ing)?\s+(?:me|us|him|her|them)\b(?!\s+(?:to|about))/gi, m => m[0].replace(/\s+(me|us|him|her|them)$/i, " to $1"), "explain 後面接人要加 to：explain to me。"],
    [/\b(informations|advices|feedbacks|equipments|furnitures|luggages|baggages|softwares|knowledges|evidences)\b/gi, m => m[0].replace(/s$/i, ""), "這是不可數名詞，沒有複數形。"],
    [/\baccording to (?:my|our) (?:opinion|view)\b/gi, m => m[0].replace(/according to (my|our) (opinion|view)/i, "in $1 $2"), "according to 用在引述別人或資料；表達自己的看法要用 in my opinion。"],
    [/\b(?:contact|contacted|contacting|contacts) with\b/gi, m => m[0].replace(/\s+with$/i, ""), "contact 當動詞時直接接人，不用加 with（get in touch with 才需要）。"],
    [/\b(?:could|would|should|must) of\b/gi, m => m[0].replace(/\sof$/i, " have"), "could/would/should/must 後面是 have，不是 of。"],
  ].map(([re, fix, zh], i) => ({
    id: "phrase-" + i,
    re,
    check(m, text) {
      if (i === 7 && /\b(in|into|keep|kept|stay|close|direct|come|came)\s+$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) return null;
      const fixed = fix(m);
      return {
        start: m.index, end: m.index + m[0].length, kind: "Usage", problem: m[0], zh,
        suggestions: [{ text: fixed, kind: 0 }],
      };
    },
  })),
];

export function checkCustom(text) {
  const out = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text))) {
      const rec = rule.check(m, text);
      if (rec) out.push({ ...rec, rule: rule.id, custom: true });
      if (m[0].length === 0) rule.re.lastIndex++;
    }
  }
  return out;
}
