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

// parse OCR text into { brand, amount, date }
export function parseReceipt(text) {
  const rawLines = text.split("\n").map((l) => l.trim());
  const lines = rawLines.filter((l) => l.length > 1);

  // BRAND: first meaningful line at top (skip pure numbers/symbols)
  let brand = "";
  for (const l of lines) {
    const letters = l.replace(/[^a-zA-Z]/g, "");
    if (letters.length >= 3) { brand = titleCase(l.replace(/[^a-zA-Z0-9&' ]/g, "").trim()); break; }
  }

  // AMOUNT: prefer the grand total. Match total lines, skip subtotal, take the last.
  const hasMoney = (l) => /\d+[.,]\d{2}/.test(l);
  const isTotal = (l) => /(grand\s*total|amount\s*due|balance\s*due|\btotal\b)/i.test(l);
  const isSubtotal = (l) => /sub[\s-]*total/i.test(l);
  let amount = "";
  const totalLines = lines.filter((l) => isTotal(l) && !isSubtotal(l) && hasMoney(l));
  if (totalLines.length) {
    const m = totalLines[totalLines.length - 1].match(/(\d+[.,]\d{2})/g);
    if (m) amount = m[m.length - 1].replace(",", ".");
  }
  if (!amount) {
    let max = 0;
    for (const l of lines) {
      const m = l.match(/(\d+[.,]\d{2})/g);
      if (m) m.forEach((v) => { const n = parseFloat(v.replace(",", ".")); if (n > max) max = n; });
    }
    if (max > 0) amount = max.toFixed(2);
  }

  // DATE: common formats
  let date = todayStr();
  const dm = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)      // YYYY-MM-DD
    || text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);         // MM/DD/YYYY
  if (dm) {
    const iso = normalizeDate(dm);
    if (iso) date = iso;
  }
  return { brand, amount, date };
}

function normalizeDate(m) {
  try {
    let y, mo, d;
    if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }        // YYYY-MM-DD
    else { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000; }  // MM/DD/YY(YY)
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d);
    if (dt > new Date()) return null; // future date = misread
    return dt.toISOString().slice(0, 10);
  } catch { return null; }
}
