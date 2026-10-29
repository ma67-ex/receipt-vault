import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReceipt, mergeParses, agreement, detectCurrency, money, buildDoc, knownBrand } from "./receipt.js";

// Real Tesseract output (noisy) from public-domain / CC receipt photos, after crop + binarize.
const fx = (n) => parseReceipt(readFileSync(new URL(`./fixtures/${n}.txt`, import.meta.url), "utf8"));

test("hofer: net + tax = total, 24h time, card network", () => {
  const p = fx("hofer");
  assert.equal(p.brand, "Hofer");
  assert.equal(p.date, "2024-03-25");
  assert.equal(p.time, "18:00");
  assert.deepEqual([p.subtotal, p.tax, p.total, p.payment], [20.37, 2.04, 22.41, "Visa"]);
  assert.equal(p.consistent, true);
});

test("biedronka: day-first ISO date, tax-inclusive total gives a worked-out pre-tax amount", () => {
  const p = fx("biedronka");
  assert.equal(p.brand, "Biedronka");
  assert.deepEqual([p.date, p.time, p.tax, p.total, p.payment], ["2020-01-09", "13:18", 0.39, 8.27, "Visa"]);
  assert.deepEqual([p.subtotal, p.derived], [7.88, ["subtotal"]]);
});

test("building 19: slashed US date, pre-tax worked out from total - tax (OCR read \"PM\" as \"pif\", so no 24h shift)", () => {
  const p = fx("building19");
  assert.deepEqual([p.date, p.time, p.subtotal, p.tax, p.total, p.payment], ["2005-03-25", "03:27", 0.97, 0.05, 1.02, "Cash"]);
});

test("garbage text never throws and returns empty fields", () => {
  const p = parseReceipt("~~ ;; ..\n  \n");
  assert.deepEqual([p.amount, p.time, p.payment, p.consistent], ["", "", "", false]);
});

test("misread tax keyword on a netto line still gives net first, tax second", () => {
  const p = parseReceipt("HOFER\nWA 10.0% Netto 20,37 Mast 2,04\nHOFER PREIS 22.41\nTotal-EFT EUR 22.41");
  assert.deepEqual([p.subtotal, p.tax, p.total], [20.37, 2.04, 22.41]);
});

test("swapped net and tax are put back in order", () => {
  const p = parseReceipt("SHOP\nTAX 20.37\nSubtotal 2.04\nTotal 22.41");
  assert.deepEqual([p.subtotal, p.tax], [20.37, 2.04]);
});

test("tax read as the net amount with pre-tax worked out from it comes back in order", () => {
  const p = parseReceipt("HOFER\nMwSt 20,37\nTotal-EFT EUR 22.41");
  assert.deepEqual([p.subtotal, p.tax, p.total], [20.37, 2.04, 22.41]);
});

test("mergeParses takes each field from the pass that found it and keeps the amounts together", () => {
  const a = parseReceipt("HOFER\nTotal 22.41\nNetto 20,37 MwSt 2,04\nVisa");           // amounts + payment, no date or time
  const b = parseReceipt("garbage ~~\n25.03.2024 18:00\nTotal 99.99");                    // date + time, wrong total
  const m = mergeParses([b, a]);
  assert.deepEqual([m.brand, m.date, m.time, m.payment], ["Hofer", "2024-03-25", "18:00", "Visa"]);
  assert.deepEqual([m.subtotal, m.tax, m.total, m.consistent], [20.37, 2.04, 22.41, true]);
});

test("a worked-out pre-tax amount does not count as a verified total", () => {
  const p = parseReceipt("SHOP\nTAX 0.39\nSUMA PLN 8,21");
  assert.deepEqual([p.subtotal, p.derived, p.consistent], [7.82, ["subtotal"], false]);
});

test("mergeParses trusts the total most passes read over one self-consistent outlier", () => {
  const good = parseReceipt("HOFER\n25.03.2024 18:00\nTotal 22.41");
  const outlier = parseReceipt("HOFER\n25.03.2024 18:00\nNetto 10,05 MwSt 2,04\nTotal 12.09");
  const m = mergeParses([outlier, good, good]);
  assert.equal(m.total, 22.41);
  assert.equal(agreement([outlier, good]), false);
  assert.equal(agreement([outlier, good, good]), true);
});

test("a tax rate misread as an amount before Netto is ignored, and a worked-out total is not verified", () => {
  const a = parseReceipt("HOFER\nA 10.05 Netto 20,37 Mest 2,04\nTotal 22.41");
  assert.deepEqual([a.subtotal, a.tax, a.total, a.consistent], [20.37, 2.04, 22.41, true]);
  const b = parseReceipt("HOFER\nA 10.05 Netto 20,37 Mest 2,04");                      // no total line: derived, never "consistent"
  assert.deepEqual([b.total, b.derived, b.consistent], [22.41, ["total"], false]);
});

test("mergeParses counts worked-out amounts as confirmed when two passes agree on all three", () => {
  const a = parseReceipt("HOFER\nNetto 20,37 MwSt 2,04");   // total worked out from net + tax
  const b = parseReceipt("HOFER\nNetto 20,37 MwSt 2,04");
  const m = mergeParses([a, b]);
  assert.deepEqual([m.total, m.derived, m.consistent], [22.41, [], true]);
  assert.equal(mergeParses([a]).consistent, false);
});

test("a tax larger than the total is dropped as a misread", () => {
  const p = parseReceipt("SHOP\nTAX 8.39\nTotal 8.21");
  assert.deepEqual([p.tax, p.total], ["", 8.21]);
});

test("currency comes from the symbol or the code OCR kept", () => {
  assert.equal(fx("hofer").currency, "EUR");        // "Total-EFT EUR 22.41"
  assert.equal(fx("biedronka").currency, "PLN");    // "SUMA PLN 8,27"
  assert.equal(fx("building19").currency, "USD");   // "$1.02"
  assert.equal(detectCurrency("TOTAL £4.50"), "GBP");
  assert.equal(detectCurrency("C$ 12.00 CAD"), "CAD"); // before the generic dollar sign
  assert.equal(detectCurrency("no marker here"), "");
});

test("money formats in the receipt's currency and falls back safely", () => {
  assert.equal(money(12), "$12.00");
  assert.equal(money(22.41, "EUR"), "€22.41");
  assert.equal(money(8.27, "PLN"), "PLN\u00a08.27");
  assert.equal(money(5, "NOT-A-CODE"), "NOT-A-CODE 5.00");
});

test("total, tax and payment words in other languages", () => {
  const es = parseReceipt("TIENDA\nSubtotal 10,00\nIVA 2,10\nTOTAL 12,10\nEfectivo 20,00");
  assert.deepEqual([es.subtotal, es.tax, es.total, es.payment], [10, 2.1, 12.1, "Cash"]);
  const fr = parseReceipt("MAGASIN\nSous-total 10,00\nTVA 2,00\nMontant 12,00\nCarte VISA");
  assert.deepEqual([fr.subtotal, fr.tax, fr.total, fr.payment], [10, 2, 12, "Visa"]);
});

test("buildDoc keeps the original fields apart from the optional ones and drops blanks", () => {
  const full = buildDoc({ brand: " Hofer ", category: "Groceries", amount: "22.41", date: "2024-03-25", currency: "EUR", time: "18:00", subtotal: "20.37", tax: "2.04", payment: "Visa" });
  assert.deepEqual(full.base, { brand: "Hofer", category: "Groceries", amount: 22.41, date: "2024-03-25" });
  assert.deepEqual(full.extras, { currency: "EUR", time: "18:00", subtotal: 20.37, tax: 2.04, payment: "Visa" });
  const bare = buildDoc({ brand: "X", category: "Other", amount: "", date: "2024-01-01", currency: "", time: "", subtotal: "", tax: "abc", payment: "  " });
  assert.deepEqual([bare.base.amount, bare.extras], [0, {}]);
});

test("short chain names match whole words only, so OCR junk is not a store", () => {
  assert.equal(knownBrand("BP Gas Station"), "bp");
  assert.equal(knownBrand("Kbpx ubp junk"), undefined);
  assert.equal(knownBrand("McDonald's #1234"), "mcdonald");
  assert.notEqual(parseReceipt("Kbpx zzz\nTotal 5.00").brand, "Bp"); // junk is no longer taken for BP
});

test("mergeParses prefers a recognised chain name over a noisier one from a better-scoring pass", () => {
  const noisy = parseReceipt("Some Odd Garbled Name\n25.03.2024 18:00\nTotal 5.00\nVisa");
  const chain = parseReceipt("Lidl\nTotal 5.00");
  assert.equal(mergeParses([noisy, chain]).brand, "Lidl");
});
