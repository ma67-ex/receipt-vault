// ─────────────────────────────────────────────────────────────
// Pure receipt helpers: categories, OCR parsing, image compression,
// URL safety, formatting. No DOM, no React — safe to unit test.
// ─────────────────────────────────────────────────────────────

export const CATEGORIES = [
  "Groceries", "Restaurants", "Gas & Fuel", "Retail & Clothing",
  "Pharmacy & Health", "Electronics", "Home & Hardware", "Entertainment",
  "Travel", "Services", "Other",
];

// small brand→category guesser (unknown falls back to "Other")
const BRAND_CATEGORY = {
  walmart: "Groceries", costco: "Groceries", target: "Retail & Clothing", kroger: "Groceries",
  "whole foods": "Groceries", safeway: "Groceries", aldi: "Groceries", "trader joe": "Groceries",
  publix: "Groceries", loblaws: "Groceries", "no frills": "Groceries", metro: "Groceries",
  sobeys: "Groceries", "food basics": "Groceries",
  hofer: "Groceries", lidl: "Groceries", tesco: "Groceries", biedronka: "Groceries", carrefour: "Groceries",
  starbucks: "Restaurants", mcdonald: "Restaurants", "tim horton": "Restaurants",
  subway: "Restaurants", "burger king": "Restaurants", wendy: "Restaurants", kfc: "Restaurants",
  chevron: "Gas & Fuel", shell: "Gas & Fuel", esso: "Gas & Fuel", petro: "Gas & Fuel",
  bp: "Gas & Fuel", "7-eleven": "Gas & Fuel",
  "best buy": "Electronics", apple: "Electronics",
  "home depot": "Home & Hardware", lowe: "Home & Hardware", ikea: "Home & Hardware",
  "canadian tire": "Home & Hardware",
  cvs: "Pharmacy & Health", walgreens: "Pharmacy & Health", "shoppers drug": "Pharmacy & Health",
  rexall: "Pharmacy & Health",
  "h&m": "Retail & Clothing", zara: "Retail & Clothing", nike: "Retail & Clothing",
  netflix: "Entertainment", spotify: "Entertainment",
};

// A known chain name inside some text. Short keys ("bp", "kfc") must be whole words, otherwise they match inside
// OCR junk; longer keys may continue into a suffix ("mcdonald" in "McDonald's").
export function knownBrand(text) {
  const t = (text || "").toLowerCase();
  return Object.keys(BRAND_CATEGORY).find((k) => {
    const at = (i) => (i < 0 || i >= t.length ? "" : t[i]);
    for (let i = t.indexOf(k); i !== -1; i = t.indexOf(k, i + 1)) {
      const before = !/[a-z0-9]/.test(at(i - 1));
      const after = k.length > 3 || !/[a-z0-9]/.test(at(i + k.length));
      if (before && after) return true;
    }
    return false;
  });
}

export function guessCategory(brand) {
  const key = knownBrand(brand);
  return key ? BRAND_CATEGORY[key] : "Other";
}

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "PLN", "CHF", "JPY"];

// Formats in a fixed locale so the symbol and layout do not change with the browser's language.
export function money(n, currency = "USD") {
  const v = Number(n) || 0;
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(v); }
  catch { return currency + " " + v.toFixed(2); }
}
export function todayStr() { return new Date().toISOString().slice(0, 10); }
export function titleCase(s) { return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

// Only allow https Cloudinary image URLs. Anything else (javascript:, data:,
// http, other hosts) returns "" so a malicious/corrupt imgUrl never renders.
export function safeImageUrl(raw) {
  const s = String(raw ?? "");
  let u;
  try { u = new URL(s); } catch { return ""; }
  if (u.protocol !== "https:") return "";
  if (!/^res(-\w+)?\.cloudinary\.com$/.test(u.hostname)) return "";
  return u.href;
}

// shrink image: max 1200px wide, JPEG ~0.7 keeps storage tiny (browser-only)
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("The browser cannot open that image"));
    img.onload = () => {
      const maxW = 1200;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7);
    };
    img.src = URL.createObjectURL(file);
  });
}

// Form strings -> Firestore fields. `base` is always written; `extras` only when filled in.
export function buildDoc(form) {
  const num = (v) => (v !== "" && v != null && !isNaN(parseFloat(v)) ? parseFloat(v) : null);
  const base = { brand: form.brand.trim(), category: form.category, amount: parseFloat(form.amount) || 0, date: form.date };
  const extras = {};
  if (form.currency) extras.currency = form.currency;
  if (form.time) extras.time = form.time;
  if (num(form.subtotal) != null) extras.subtotal = num(form.subtotal);
  if (num(form.tax) != null) extras.tax = num(form.tax);
  if ((form.payment || "").trim()) extras.payment = form.payment.trim().slice(0, 20);
  return { base, extras };
}

// ── OCR text parsing ─────────────────────────────────────────
// OCR text is noisy, so every field is best-effort and the caller shows it for the user to confirm.

// Money like 22.41 or 1,234.56. Rejects 22.491 (misread) and 5,00 % (a tax rate).
const MONEY = /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})*|\d+)[.,](\d{2})(?!\d)(?!\s*%)/g;
const SUB = /sub\s*-?\s*total|sous[\s-]*total|subtotale|subtotaal|netto|net\s+(?:sales|amount|total)|zwischensumme|base\s+imponible/i;
const TAX = /\bt[ae]x\b|\bm[wa]st\b|mwst|\bvat\b|\bgst\b|\bhst\b|\bptu\b|\biva\b|\btva\b|\bust\b|\bbtw\b|\bsteuer\b|\bimpuesto\b|\bpdv\b/i;
const TOTAL = /total|suma|summe|gesamt|amount\s*due|balance\s*due|to\s*pay|zu\s*zahlen|montant|importe|razem|do\s*zap[łl]aty|a\s*pagar|totaal/i;
const TENDER = /cash|change|tender|paid|card|visa|master|amex|credit|debit|balance|karta|bar\b|tarjeta|carte|efectivo|contanti|bargeld|rendu|vuelto|reszta/i;

// O/l/S read inside a number are digits: "1O.5O" -> "10.50"
const fixDigits = (l) => l.replace(/(?<=[\d.,$])[Oo](?=[\d.,])/g, "0").replace(/(?<=[\d.,$])[lI|](?=[\d.,])/g, "1");
const moneyIn = (l) => [...fixDigits(l).matchAll(MONEY)].map((m) => +(m[1].replace(/[.,]/g, "") + "." + m[2]));
const cents = (n) => Math.round(n * 100) / 100;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function findBrand(lines) {
  const top = lines.slice(0, 25);
  const clean = (l) => l.replace(/[^a-zA-Z0-9&' ]/g, " ").replace(/\s+/g, " ").trim();
  for (const l of top) { // a known chain anywhere near the top wins
    const hit = knownBrand(l);
    if (hit) return titleCase(hit);
  }
  const skip = /receipt|invoice|thank|welcome|\btel\b|phone|www\.|http|@|\bstr(?:a(?:ss|ß)e|eet)\b|\bul\.|\bave\b|\broad\b|sklep|date|time|paragon|cashier|order|customer|view|purchase|download|support|manage|unsubscribe|privacy|statement|\bvat\b|tax|total|\bnip\b|atu\d/i;
  let best = "", bestScore = 0;
  top.slice(0, 15).forEach((l, i) => {
    const letters = l.replace(/[^a-zA-Z]/g, "");
    const words = clean(l).split(" ").length;
    if (letters.length < 3 || letters.length / l.length < 0.5 || words > 5 || skip.test(l) || /[a-z]\d{2,}|\d{2,}[a-z]/i.test(l) || (l.match(/\d/g) || []).length > 3) return;
    const upper = letters.replace(/[^A-Z]/g, "").length / letters.length;
    const company = /\b(?:inc|llc|ltd|corp|pbc|plc|gmbh|co)\b/i.test(l) ? 2 : 0; // "Anthropic, PBC"
    const score = (upper > 0.7 ? 2 : 0) + (words <= 3 ? 1 : 0) + (15 - i) / 15 + Math.min(letters.length, 14) / 14 + company; // longer beats OCR junk like "Hin"
    if (score > bestScore) { best = clean(l).split(" ").filter((w) => w.length > 2 || w === w.toUpperCase()).join(" "); bestScore = score; }
  });
  return best === best.toUpperCase() ? titleCase(best) : best; // keep "Anthropic PBC" as printed; only fix SHOUTING
}

// Candidates in text order, each checked for a real, non-future date. Dotted dates are day-first,
// slashed dates are month-first unless the first number cannot be a month.
function findDate(text) {
  const found = [];
  const push = (y, mo, d) => {
    if (y < 100) y += 2000;
    if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) return;
    const dt = new Date(y, mo - 1, d);
    if (dt > new Date()) return; // future date = misread
    found.push(dt.getFullYear() + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0"));
  };
  const mon = (s) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;
  const pats = [
    [/(?<!\d)((?:19|20)\d\d)[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g, (m) => push(+m[1], +m[2], +m[3])],
    [/(?<!\d)(\d{1,2})[. ](\d{2})\.(\d{4}|\d{2})(?!\d)/g, (m) => push(+m[3], +m[2], +m[1])],
    [/(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?!\d)/g, (m) => (+m[1] > 12 ? push(+m[3], +m[2], +m[1]) : push(+m[3], +m[1], +m[2]))],
    [/(?<!\d)(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*((?:19|20)\d\d)/gi, (m) => push(+m[3], mon(m[2]), +m[1])],
    [/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2}),?\s*((?:19|20)\d\d)/gi, (m) => push(+m[3], mon(m[1]), +m[2])],
  ];
  const hits = [];
  for (const [re, fn] of pats) for (const m of text.matchAll(re)) { const n = found.length; fn(m); if (found.length > n) hits.push([m.index, found[found.length - 1]]); }
  hits.sort((a, b) => a[0] - b[0]);
  return hits.length ? hits[0][1] : "";
}

// First hh:mm, as 24-hour "HH:MM". Prefers a line that also carries a date or the word "time".
function findTime(lines) {
  const re = /(?<![\d:.])([01]?\d|2[0-3])\s?[:;]\s?([0-5]\d)(?!\d)(?:\s?[:;]\s?[0-5]\d)?(?:\s*([ap])\.?\s?m\b)?/i;
  const parse = (m) => {
    let h = +m[1]; const ap = (m[3] || "").toLowerCase();
    if (ap === "p" && h < 12) h += 12; else if (ap === "a" && h === 12) h = 0;
    return String(h).padStart(2, "0") + ":" + m[2];
  };
  const anchored = lines.find((l) => re.test(l) && (findDate(l) || /time|zeit|godz/i.test(l)));
  if (anchored) return parse(anchored.match(re));
  const any = lines.find((l) => re.test(l));
  return any ? parse(any.match(re)) : "";
}

// First currency marker found. OCR often drops the symbol but keeps the code ("EUR", "PLN"), so codes count too.
const CURRENCY_HINTS = [["EUR", /€|\beuros?\b|\beur\b/i], ["GBP", /£|\bgbp\b/i], ["PLN", /\bpln\b|\bzł\b|\bzl\b/i], ["CAD", /\bcad\b|\bc\$/i],
  ["AUD", /\baud\b|\ba\$/i], ["INR", /₹|\binr\b/i], ["CHF", /\bchf\b/i], ["JPY", /\bjpy\b/i], ["USD", /\busd\b|\$/i]];
export function detectCurrency(text) {
  const find = (t) => { const hit = CURRENCY_HINTS.find(([, re]) => re.test(t)); return hit ? hit[0] : ""; };
  const priced = text.split("\n").filter((l) => /\d+[.,]\d{2}/.test(l)).join("\n"); // a marker next to an amount beats stray symbols
  return find(priced) || find(text);
}

const PAYMENT_KINDS = [["Visa", /\bvisa\b/], ["Mastercard", /master\s?card|maestro/], ["Amex", /amex|american express/], ["Discover", /discover/],
  ["Debit", /\bdebit\b/], ["Credit", /\bcredit\b/], ["Cash", /\bcash\b|\bbar(?:geld)?\b|gotówk|efectivo|esp[èe]ces|contanti|dinheiro/]];
const PAYMENT_LABEL = /^\s*(?:payment(?:\s*(?:method|type|source))?|paid\s*(?:by|with|via|from)|pay(?:ed)?\s*with|account|card(?:\s*used)?|charged\s*to|billed\s*to|funding\s*source)\s*[:\-]?\s*(.*)$/i;

// The value after a "Payment" or "Paid by" label, as a short name: "CITIZENS BANK NA ••7433" -> "Citizens Bank 7433".
// Digital receipts name the bank or wallet rather than the card network.
function labelledPayment(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PAYMENT_LABEL);
    if (!m) continue;
    const raw = (m[1].trim() || (lines[i + 1] || "").trim()); // the value may be on the next line
    if (!/[a-z]{3}/i.test(raw) || /\b(due|received|total|terms|date|summary|confirmation|id|status|number|no|holder|name|balance|type|activity)\b/i.test(raw)) continue;
    const last4 = (raw.match(/(\d{4})\D*$/) || [])[1];
    const name = titleCase(raw.replace(/[^A-Za-z&'. ].*$/, "").replace(/\bn\.?a\.?\s*$/i, "").replace(/\s+/g, " ").trim());
    if (name.length < 3) continue;
    return (last4 ? name + " " + last4 : name).slice(0, 20);
  }
  return "";
}

function findPayment(text) {
  const network = (s, kinds) => { const hit = kinds.find(([, re]) => re.test(s.toLowerCase())); return hit ? hit[0] : ""; };
  const labelled = labelledPayment(text.split("\n"));
  // a card brand in the labelled value wins ("Visa ending 4242"); otherwise the bank or wallet name
  if (labelled) return network(labelled, PAYMENT_KINDS.slice(0, 4)) || labelled;
  return network(text, PAYMENT_KINDS);
}

// parse OCR text into { brand, amount, date, time, subtotal, tax, total, payment, currency, derived, consistent }
// amount is the total as a string (what the form field takes); the rest are numbers or "".
export function parseReceipt(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 1);
  const brand = findBrand(lines);

  let subtotal = null, tax = null, total = null;
  const totals = [];
  let totalWorkedOut = false;
  for (const l of lines) {
    const m = moneyIn(l);
    if (!m.length) continue;
    const sm = l.match(SUB), after = sm ? moneyIn(l.slice(sm.index + sm[0].length)) : m; // a tax rate printed before "Netto" is not an amount
    if (sm && after.length >= 2 && (TAX.test(l) || /netto|net\s/i.test(l))) { subtotal = after[0]; tax = after[after.length - 1]; } // "Netto 20,37 MwSt 2,04"
    else if (TAX.test(l)) tax = m[m.length - 1];
    else if (sm) subtotal = after.length ? after[after.length - 1] : m[m.length - 1];
    else if (TOTAL.test(l) && !TENDER.test(l)) totals.push(Math.max(...m));
  }
  if (totals.length) {
    const want = subtotal != null && tax != null ? subtotal + tax : null; // the numbers should add up
    total = (want != null && totals.find((t) => Math.abs(t - want) < 0.02)) || Math.max(...totals);
  } else if (subtotal != null && tax != null) { total = cents(subtotal + tax); totalWorkedOut = true; }
  else {
    const all = lines.filter((l) => !TENDER.test(l) && !TAX.test(l)).flatMap(moneyIn);
    if (all.length) total = Math.max(...all);
  }

  if (tax != null && total != null && tax >= total) tax = null; // a misread digit, not a real tax
  const derived = totalWorkedOut ? ["total"] : [];
  if (total != null && tax != null && subtotal == null && tax < total) { subtotal = cents(total - tax); derived.push("subtotal"); }
  if (total != null && subtotal != null && tax == null && subtotal < total) { tax = cents(total - subtotal); derived.push("tax"); }
  if (subtotal != null && tax != null && tax > subtotal) [subtotal, tax] = [tax, subtotal]; // tax is never more than the pre-tax amount
  // only a real check when all three were read: a worked-out amount always adds up by construction
  const consistent = derived.length === 0 && total != null && subtotal != null && tax != null && Math.abs(subtotal + tax - total) < 0.02;

  return {
    brand,
    amount: total != null ? total.toFixed(2) : "",
    date: findDate(text) || todayStr(),
    time: findTime(lines),
    subtotal: subtotal ?? "",
    tax: tax ?? "",
    total: total ?? "",
    payment: findPayment(text),
    currency: detectCurrency(text),
    derived,
    consistent,
  };
}

// How complete and self-consistent a parse is. Used to pick the best of several OCR passes:
// subtotal + tax = total is an independent check that the digits were read right.
export function scoreParse(p) {
  return (p.brand ? 1 : 0) + (p.total !== "" ? 2 : 0) + (p.time ? 1 : 0) + (p.payment ? 1 : 0) + (p.tax !== "" ? 1 : 0) +
    (p.date !== todayStr() ? 1 : 0) + (p.consistent ? 4 : 0) - p.derived.length * 0.5;
}

// Passes that read the same date and total as another pass. Two independent reads agreeing is strong evidence.
export function agreement(parses) {
  const seen = new Set();
  for (const p of parses) {
    if (p.total === "" || p.date === todayStr()) continue;
    const key = p.total + "|" + p.date;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

// Combine several OCR passes of the same photo. Each text field comes from the best-scoring pass that found it,
// so a store name read in one pass and a total read in another both survive. The total is the value most passes
// read; the three amounts then come from one pass, so subtotal + tax = total still means something.
export function mergeParses(parses) {
  const ranked = [...parses].sort((a, b) => scoreParse(b) - scoreParse(a));
  const best = ranked[0], pick = (k) => (ranked.find((p) => p[k] !== "") || best)[k];
  const chain = ranked.find((p) => knownBrand(p.brand)); // a recognised store name beats a longer but noisier one
  const votes = {};
  for (const p of ranked) if (p.total !== "") votes[p.total] = (votes[p.total] || 0) + 1;
  const top = Math.max(0, ...Object.values(votes));
  const money = ranked.find((p) => p.total !== "" && votes[p.total] === top) || best; // ranked, so ties go to the better pass
  const dated = ranked.find((p) => p.date !== todayStr());
  // a worked-out amount is as good as read when a second pass independently lands on the same three numbers
  const same = ranked.filter((p) => p.total === money.total && p.subtotal === money.subtotal && p.tax === money.tax).length;
  const confirmed = same >= 2 && money.total !== "" && money.subtotal !== "" && money.tax !== "" && Math.abs(money.subtotal + money.tax - money.total) < 0.02;
  return {
    ...best,
    brand: chain ? chain.brand : pick("brand"), time: pick("time"), payment: pick("payment"), currency: pick("currency"), date: dated ? dated.date : best.date,
    amount: money.amount, total: money.total, subtotal: money.subtotal, tax: money.tax, derived: confirmed ? [] : money.derived, consistent: confirmed || money.consistent,
  };
}
