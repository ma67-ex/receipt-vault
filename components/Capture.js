"use client";
import { useState, useRef } from "react";
import { CATEGORIES, CURRENCIES, compressImage, guessCategory, todayStr } from "@/lib/receipt";
import { readReceipt } from "@/lib/ocr";
import { saveReceipt, isOffline } from "@/lib/save";
import { enqueue } from "@/lib/queue";
import { useToast } from "./Toast";

const LANGUAGES = [["eng", "English"], ["deu", "German"], ["fra", "French"], ["spa", "Spanish"], ["ita", "Italian"], ["por", "Portuguese"], ["pol", "Polish"], ["nld", "Dutch"]];

const stored = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const blank = () => ({ brand: "", category: "Other", amount: "", date: todayStr(), currency: stored("rv-currency", "USD"), time: "", subtotal: "", tax: "", payment: "" });

export default function Capture({ uid, onSaved }) {
  const toast = useToast();
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [preview, setPreview] = useState("");
  const [blob, setBlob] = useState(null);
  const [ocr, setOcr] = useState("");
  const [read, setRead] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState(() => stored("rv-lang", "eng"));
  const [form, setForm] = useState(blank);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const text = (v) => (v === "" || v == null ? "" : String(v));

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setBlob(compressed);
    setPreview(URL.createObjectURL(compressed));
    setOcr("Reading the receipt…");
    setRead(null);
    setShowForm(false);
    try {
      const p = await readReceipt(file, (n, of) => setOcr(n > 1 ? `Reading again, pass ${n} of ${of}…` : "Reading the receipt…"), lang);
      setRead(p);
      setForm({
        ...blank(), brand: p.brand || "", category: guessCategory(p.brand), amount: p.amount || "", date: p.date || todayStr(),
        currency: p.currency || stored("rv-currency", "USD"), time: p.time, subtotal: text(p.subtotal), tax: text(p.tax), payment: p.payment,
      });
    } catch {
      toast("Could not read the receipt. Please fill the fields in yourself.");
      setForm(blank());
    } finally {
      setOcr("");
      setShowForm(true);
    }
  };

  const reset = () => {
    setBlob(null); setPreview(""); setShowForm(false); setRead(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  };

  const changeLang = (v) => { setLang(v); store("rv-lang", v); };

  const save = async (e) => {
    e.preventDefault();
    if (!blob) { toast("Add a photo first."); return; }
    setSaving(true);
    try {
      const r = await saveReceipt(uid, blob, form);
      store("rv-currency", form.currency);
      toast(r.extras ? "Receipt saved." : "Receipt saved without the extra details. Update the Firestore rules to keep them.");
      reset();
      onSaved?.();
    } catch (err) {
      if (isOffline(err)) {
        try {
          await enqueue({ uid, blob, form });
          toast("No connection. The receipt is kept on this device and uploads when you are back online.");
          reset();
          onSaved?.();
        } catch { toast("Save failed: no connection and this browser cannot keep it for later."); }
      } else {
        console.error("Save failed:", err);
        toast("Save failed: " + err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tab active">
      <h2>Add a receipt</h2>
      <p className="hint">
        Take a photo with your back camera, or choose an image you already have. The store,
        amount and date are read for you. Look them over, correct anything that came out wrong, then save.
      </p>
      <label className="lang-row">Receipt language
        <select value={lang} onChange={(e) => changeLang(e.target.value)}>
          {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        {lang !== "eng" && <span className="hint">Downloads the language once, then works offline.</span>}
      </label>

      <div className="capture-drop">
        {/* camera input forces the back camera on phones; gallery input (no
            capture attr) opens the photo library instead. Desktop shows a file
            picker for both. */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={onFile} />
        {!preview && (
          <div id="dropInner">
            <div className="drop-frame">+</div>
            <span>Snap a new receipt or pick one from your photos</span>
            <div className="capture-actions">
              <button type="button" className="primary-btn" onClick={() => cameraRef.current?.click()}>Take a photo</button>
              <button type="button" className="ghost-btn" onClick={() => galleryRef.current?.click()}>Choose from gallery</button>
            </div>
          </div>
        )}
        {preview && <img src={preview} className="preview-img" alt="receipt preview" />}
      </div>

      {ocr && <div className="ocr-status"><span className="spinner" /> {ocr}</div>}

      {showForm && read && !read.complete && (
        <p className="hint">Some of this could not be read well, which usually means a blurry, dark or crumpled photo. Check every field, or retake it flat and in good light.</p>
      )}
      {showForm && read && read.tax !== "" && (
        <p className="hint">
          {read.derived.includes("subtotal") && "Before tax was worked out from the total. "}
          {read.derived.includes("total") && "The total was worked out from before tax plus tax. "}
          {read.consistent ? "The amounts add up." : "The amounts could not be checked against each other, so check the total."}
        </p>
      )}

      {showForm && (
        <form className="receipt-form" onSubmit={save}>
          <label>Store
            <input type="text" value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Walmart" required />
          </label>
          <label>Category
            <select value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Currency
            <select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {[...new Set([form.currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Total
            <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" required />
          </label>
          <label>Before tax
            <input type="number" step="0.01" min="0" value={form.subtotal} onChange={(e) => set("subtotal", e.target.value)} placeholder="optional" />
          </label>
          <label>Tax
            <input type="number" step="0.01" min="0" value={form.tax} onChange={(e) => set("tax", e.target.value)} placeholder="optional" />
          </label>
          <label>Date
            <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
          </label>
          <label>Time
            <input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
          </label>
          <label>Paid by
            <input type="text" maxLength={20} value={form.payment} onChange={(e) => set("payment", e.target.value)} placeholder="e.g. Visa, Cash" />
          </label>
          <div className="form-actions">
            <button type="button" className="ghost-btn" onClick={reset}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={saving}>{saving ? "Saving…" : "Save receipt"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
