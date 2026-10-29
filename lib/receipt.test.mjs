import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReceipt, mergeParses, agreement } from "./receipt.js";

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
