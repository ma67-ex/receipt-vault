import { rgbaToGray, paperBox, cropGray, stretch, binarize, unsharp, deblur } from "./ocr-prep";
import { parseReceipt, scoreParse, mergeParses, agreement } from "./receipt";

// Browser-only. Photo -> grayscale -> crop to the paper -> up to five OCR passes. Cheap passes come first and
// the run stops once two passes agree on date and total, because one pass can misread digits that still add up. Later passes target soft photos:
// Richardson-Lucy deblur, and upscale + unsharp mask. Every pass's parse is merged field by field at the end.
const PASSES = [
  { bin: true, psm: "6" },
  { bin: false, psm: "6" },
  { rl: 2.5, psm: "6" },
  { bin: true, psm: "6", minW: 2000, sharp: [3, 2] },
  { bin: true, psm: "4", minW: 2000 },
];
const MAX_PIXELS = 6e6; // Tesseract.js runs out of memory on much larger images

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

function toCanvas(gray, w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const img = new ImageData(w, h);
  for (let i = 0; i < gray.length; i++) { const j = i * 4; img.data[j] = img.data[j + 1] = img.data[j + 2] = gray[i]; img.data[j + 3] = 255; }
  c.getContext("2d").putImageData(img, 0, 0);
  return c;
}

function resizeGray(gray, w, h, tw) {
  const th = Math.round((h * tw) / w), src = toCanvas(gray, w, h), dst = document.createElement("canvas");
  dst.width = tw; dst.height = th;
  const ctx = dst.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, tw, th);
  return { gray: rgbaToGray(ctx.getImageData(0, 0, tw, th).data, tw, th), w: tw, h: th };
}

function prepare(crop, w, h, p) {
  let img = { gray: crop, w, h };
  if (p.rl && img.w > 1200) img = resizeGray(img.gray, img.w, img.h, 1200);
  if (p.minW) {
    const tw = Math.min(p.minW, Math.floor(Math.sqrt((MAX_PIXELS * img.w) / img.h)));
    if (tw > img.w) img = resizeGray(img.gray, img.w, img.h, tw);
  }
  let g = img.gray;
  if (p.rl) g = stretch(deblur(g, img.w, img.h, p.rl));
  if (p.sharp) g = unsharp(g, img.w, img.h, ...p.sharp);
  if (p.bin) g = binarize(g, img.w, img.h);
  return toCanvas(g, img.w, img.h);
}

export async function readReceipt(file, onPass) {
  const { gray, w, h } = await loadGray(file);
  const box = paperBox(gray, w, h);
  const crop = stretch(cropGray(gray, w, box));
  const Tesseract = (await import("tesseract.js")).default;
  const worker = await Tesseract.createWorker("eng");
  try {
    const parses = [];
    for (let i = 0; i < PASSES.length; i++) {
      const p = PASSES[i];
      onPass?.(i + 1, PASSES.length);
      await worker.setParameters({ tessedit_pageseg_mode: p.psm || "6", preserve_interword_spaces: "1" });
      const { data } = await worker.recognize(prepare(crop, box.w, box.h, p));
      const parsed = parseReceipt(data.text);
      parses.push(parsed);
      if (agreement(parses)) break;
    }
    const merged = mergeParses(parses);
    return { ...merged, complete: scoreParse(merged) >= 10 };
  } finally { await worker.terminate(); }
}
