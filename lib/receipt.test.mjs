import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReceipt } from "./receipt.js";

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
