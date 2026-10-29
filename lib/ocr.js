import { rgbaToGray, paperBox, cropGray, stretch, binarize } from "./ocr-prep";
import { parseReceipt, scoreParse } from "./receipt";

// Browser-only. Photo -> grayscale -> crop to the paper -> up to three OCR passes, keeping the parse
// that is most complete and whose subtotal + tax matches the total. Stops early once nearly every field
// is found (a perfect parse scores 11).
const PASSES = [
  { bin: true, psm: "6" },
  { bin: false, psm: "6" },
  { bin: true, psm: "4", minW: 2000 },
];

async function loadGray(file, maxW = 2000) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { bmp = await createImageBitmap(file); }
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  return { gray: rgbaToGray(ctx.getImageData(0, 0, w, h).data, w, h), w, h };
}

function toCanvas(gray, w, h, minW = 0) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const img = new ImageData(w, h);
  for (let i = 0; i < gray.length; i++) { const j = i * 4; img.data[j] = img.data[j + 1] = img.data[j + 2] = gray[i]; img.data[j + 3] = 255; }
  c.getContext("2d").putImageData(img, 0, 0);
  if (w >= minW) return c;
  const up = document.createElement("canvas");
  up.width = minW; up.height = Math.round((h * minW) / w);
  up.getContext("2d").drawImage(c, 0, 0, up.width, up.height);
  return up;
}

export async function readReceipt(file, onPass) {
  const { gray, w, h } = await loadGray(file);
  const box = paperBox(gray, w, h);
  const crop = stretch(cropGray(gray, w, box));
  const Tesseract = (await import("tesseract.js")).default;
  const worker = await Tesseract.createWorker("eng");
  try {
    let best = null;
    for (let i = 0; i < PASSES.length; i++) {
      const p = PASSES[i];
      onPass?.(i + 1, PASSES.length);
      await worker.setParameters({ tessedit_pageseg_mode: p.psm, preserve_interword_spaces: "1" });
      const img = p.bin ? binarize(crop, box.w, box.h) : crop;
      const { data } = await worker.recognize(toCanvas(img, box.w, box.h, p.minW));
      const parsed = parseReceipt(data.text), score = scoreParse(parsed);
      if (!best || score > best.score) best = { parsed, score };
      if (score >= 10) break;
    }
    return best.parsed;
  } finally { await worker.terminate(); }
}
