// Pure image helpers for receipt OCR. Work on grayscale Uint8Array (w*h); no DOM, so they run in Node tests too.

export function rgbaToGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return g;
}

function otsu(hist, total) {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sB += i * hist[i];
    const d = sB / wB - (sum - sB) / wF, v = wB * wF * d * d;
    if (v > best) { best = v; t = i; }
  }
  return t;
}

// Bounding box of the bright paper against a darker background. Falls back to the whole image
// when the paper fills the frame or no clear paper is found.
export function paperBox(gray, w, h) {
  const full = { x: 0, y: 0, w, h };
  const s = Math.max(1, Math.floor(w / 200)), sw = Math.floor(w / s), sh = Math.floor(h / s);
  const small = new Uint8Array(sw * sh), hist = new Array(256).fill(0);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let a = 0;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) a += gray[(y * s + dy) * w + x * s + dx];
    const v = (small[y * sw + x] = a / (s * s)); hist[v | 0]++;
  }
  const t = otsu(hist, sw * sh), col = new Array(sw).fill(0), row = new Array(sh).fill(0);
  let bright = 0;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (small[y * sw + x] > t) { col[x]++; row[y]++; bright++; }
  if (bright / (sw * sh) > 0.85 || bright / (sw * sh) < 0.1) return full;
  const lo = (p) => { const m = Math.max(...p) * 0.25; let a = 0; while (p[a] < m) a++; let b = p.length - 1; while (p[b] < m) b--; return [a, b + 1]; };
  const [x0, x1] = lo(col), [y0, y1] = lo(row), mx = Math.round(sw * 0.02), my = Math.round(sh * 0.02);
  const X0 = Math.max(0, x0 - mx) * s, X1 = Math.min(sw, x1 + mx) * s, Y0 = Math.max(0, y0 - my) * s, Y1 = Math.min(sh, y1 + my) * s;
  if ((X1 - X0) * (Y1 - Y0) < w * h * 0.15) return full;
  return { x: X0, y: Y0, w: Math.min(w, X1) - X0, h: Math.min(h, Y1) - Y0 };
}

export function cropGray(gray, w, box) {
  const out = new Uint8Array(box.w * box.h);
  for (let y = 0; y < box.h; y++) out.set(gray.subarray((box.y + y) * w + box.x, (box.y + y) * w + box.x + box.w), y * box.w);
  return out;
}

// Stretch the 1st to 99th percentile to 0..255 so dim photos reach full contrast.
export function stretch(gray) {
  const hist = new Array(256).fill(0); for (const v of gray) hist[v]++;
  const cut = gray.length * 0.01; let a = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { a += hist[i]; if (a > cut) { lo = i; break; } }
  a = 0; for (let i = 255; i >= 0; i--) { a += hist[i]; if (a > cut) { hi = i; break; } }
  const span = Math.max(1, hi - lo), out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = Math.max(0, Math.min(255, ((gray[i] - lo) * 255) / span));
  return out;
}

// Adaptive (local-mean) threshold: handles shadows and uneven light that a global cut-off cannot.
export function binarize(gray, w, h, bias = 0.12) {
  const W = w + 1, I = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
  const r = Math.max(8, Math.round(w / 24)), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
      out[y * w + x] = gray[y * w + x] < (sum / ((x1 - x0) * (y1 - y0))) * (1 - bias) ? 0 : 255;
    }
  }
  return out;
}

// Separable box blur with clamped edges; three passes approximate a Gaussian.
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), cum = new Float64Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    cum[0] = 0; for (let x = 0; x < w; x++) cum[x + 1] = cum[x] + src[y * w + x];
    for (let x = 0; x < w; x++) { const a = Math.max(0, x - r), b = Math.min(w, x + r + 1); tmp[y * w + x] = (cum[b] - cum[a]) / (b - a); }
  }
  for (let x = 0; x < w; x++) {
    cum[0] = 0; for (let y = 0; y < h; y++) cum[y + 1] = cum[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) { const a = Math.max(0, y - r), b = Math.min(h, y + r + 1); out[y * w + x] = (cum[b] - cum[a]) / (b - a); }
  }
  return out;
}

// Unsharp mask: adds back the difference from a blurred copy, which steepens soft edges so thin strokes survive thresholding.
export function unsharp(gray, w, h, radius, amount) {
  let b = Float32Array.from(gray);
  for (let i = 0; i < 3; i++) b = boxBlur(b, w, h, radius);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, gray[i] + amount * (gray[i] - b[i])));
  return out;
}

function gaussKernel(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}
function gaussBlur(src, w, h, k) {
  const r = (k.length - 1) / 2, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; out[y * w + x] = a; }
  return out;
}

// Richardson-Lucy deconvolution with a Gaussian blur of the given sigma (pixels). Undoes soft focus and low-res blur
// better than an unsharp mask, but amplifies noise, so keep iterations low.
export function deblur(gray, w, h, sigma, iters = 8) {
  const k = gaussKernel(sigma), obs = new Float32Array(w * h), u = new Float32Array(w * h);
  for (let i = 0; i < obs.length; i++) obs[i] = u[i] = (gray[i] + 1) / 256;
  for (let n = 0; n < iters; n++) {
    const est = gaussBlur(u, w, h, k), ratio = new Float32Array(w * h);
    for (let i = 0; i < ratio.length; i++) ratio[i] = obs[i] / Math.max(1e-4, est[i]);
    const corr = gaussBlur(ratio, w, h, k);
    for (let i = 0; i < u.length; i++) u[i] = Math.min(1, u[i] * corr[i]);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, u[i] * 256 - 1));
  return out;
}
