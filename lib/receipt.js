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

export function guessCategory(brand) {
  const b = (brand || "").toLowerCase();
  for (const key in BRAND_CATEGORY) { if (b.includes(key)) return BRAND_CATEGORY[key]; }
  return "Other";
}

export function money(n) { return "$" + (Number(n) || 0).toFixed(2); }
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
  return new Promise((resolve) => {
    const img = new Image();
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

// ── OCR text parsing ─────────────────────────────────────────
// OCR text is noisy, so every field is best-effort and the caller shows it for the user to confirm.

// Money like 22.41 or 1,234.56. Rejects 22.491 (misread) and 5,00 % (a tax rate).
const MONEY = /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})*|\d+)[.,](\d{2})(?!\d)(?!\s*%)/g;
const SUB = /sub\s*-?\s*total|netto|net\s+(?:sales|amount|total)|zwischensumme/i;
const TAX = /\bt[ae]x\b|\bm[wa]st\b|mwst|\bvat\b|\bgst\b|\bhst\b|\bptu\b|\biva\b|\btva\b|\bust\b/i;
const TOTAL = /total|suma|summe|gesamt|amount\s*due|balance\s*due|to\s*pay|zu\s*zahlen/i;
const TENDER = /cash|change|tender|paid|card|visa|master|amex|credit|debit|balance|karta|bar\b/i;

// O/l/S read inside a number are digits: "1O.5O" -> "10.50"
const fixDigits = (l) => l.replace(/(?<=[\d.,$])[Oo](?=[\d.,])/g, "0").replace(/(?<=[\d.,$])[lI|](?=[\d.,])/g, "1");
const moneyIn = (l) => [...fixDigits(l).matchAll(MONEY)].map((m) => +(m[1].replace(/[.,]/g, "") + "." + m[2]));
const cents = (n) => Math.round(n * 100) / 100;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function findBrand(lines) {
  const top = lines.slice(0, 25);
  const clean = (l) => l.replace(/[^a-zA-Z0-9&' ]/g, " ").replace(/\s+/g, " ").trim();
  for (const l of top) { // a known chain anywhere near the top wins
    const hit = Object.keys(BRAND_CATEGORY).find((k) => l.toLowerCase().includes(k));
    if (hit) return titleCase(hit);
  }
  const skip = /receipt|invoice|thank|welcome|\btel\b|phone|www\.|http|@|\bstr(?:a(?:ss|ß)e|eet)\b|\bul\.|\bave\b|\broad\b|sklep|date|time|paragon|cashier|order|customer|\bvat\b|tax|total|\bnip\b|atu\d/i;
  let best = "", bestScore = 0;
  top.slice(0, 15).forEach((l, i) => {
    const letters = l.replace(/[^a-zA-Z]/g, "");
    const words = clean(l).split(" ").length;
    if (letters.length < 3 || letters.length / l.length < 0.5 || words > 5 || skip.test(l) || /[a-z]\d{2,}|\d{2,}[a-z]/i.test(l) || (l.match(/\d/g) || []).length > 3) return;
    const upper = letters.replace(/[^A-Z]/g, "").length / letters.length;
    const score = (upper > 0.7 ? 2 : 0) + (words <= 3 ? 1 : 0) + (15 - i) / 15;
    if (score > bestScore) { best = clean(l).split(" ").filter((w) => w.length > 2 || w === w.toUpperCase()).join(" "); bestScore = score; }
  });
  return titleCase(best);
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

function findPayment(text) {
  const t = text.toLowerCase();
  const kinds = [["Visa", /\bvisa\b/], ["Mastercard", /master\s?card|maestro/], ["Amex", /amex|american express/], ["Discover", /discover/],
    ["Debit", /\bdebit\b/], ["Credit", /\bcredit\b/], ["Cash", /\bcash\b|\bbar\b|gotówk/]];
  const hit = kinds.find(([, re]) => re.test(t));
  return hit ? hit[0] : "";
}

// parse OCR text into { brand, amount, date, time, subtotal, tax, total, payment, derived, consistent }
// amount is the total as a string (what the form field takes); the rest are numbers or "".
export function parseReceipt(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 1);
  const brand = findBrand(lines);

  let subtotal = null, tax = null, total = null;
  const totals = [];
  for (const l of lines) {
    const m = moneyIn(l);
    if (!m.length) continue;
    if (SUB.test(l) && m.length >= 2 && (TAX.test(l) || /netto|net\s/i.test(l))) { subtotal = m[0]; tax = m[m.length - 1]; } // "Netto 20,37 MwSt 2,04"
    else if (TAX.test(l)) tax = m[m.length - 1];
    else if (SUB.test(l)) subtotal = m[m.length - 1];
    else if (TOTAL.test(l) && !TENDER.test(l)) totals.push(Math.max(...m));
  }
  if (totals.length) {
    const want = subtotal != null && tax != null ? subtotal + tax : null; // the numbers should add up
    total = (want != null && totals.find((t) => Math.abs(t - want) < 0.02)) || Math.max(...totals);
  } else if (subtotal != null && tax != null) total = cents(subtotal + tax);
  else {
    const all = lines.filter((l) => !TENDER.test(l) && !TAX.test(l)).flatMap(moneyIn);
    if (all.length) total = Math.max(...all);
  }

  const derived = [];
  if (total != null && tax != null && subtotal == null && tax < total) { subtotal = cents(total - tax); derived.push("subtotal"); }
  if (total != null && subtotal != null && tax == null && subtotal < total) { tax = cents(total - subtotal); derived.push("tax"); }
  if (subtotal != null && tax != null && tax > subtotal) [subtotal, tax] = [tax, subtotal]; // tax is never more than the pre-tax amount
  const consistent = total != null && subtotal != null && tax != null && Math.abs(subtotal + tax - total) < 0.02;

  return {
    brand,
    amount: total != null ? total.toFixed(2) : "",
    date: findDate(text) || todayStr(),
    time: findTime(lines),
    subtotal: subtotal ?? "",
    tax: tax ?? "",
    total: total ?? "",
    payment: findPayment(text),
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
