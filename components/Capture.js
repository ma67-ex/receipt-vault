"use client";
import { useState, useRef } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { CATEGORIES, compressImage, parseReceipt, guessCategory, todayStr } from "@/lib/receipt";
import { useToast } from "./Toast";

export default function Capture({ uid, onSaved }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState("");
  const [blob, setBlob] = useState(null);
  const [ocr, setOcr] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ brand: "", category: "Other", amount: "", date: todayStr() });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setBlob(compressed);
    setPreview(URL.createObjectURL(compressed));
    setOcr(true);
    setShowForm(false);
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(compressed, "eng");
      const p = parseReceipt(data.text);
      setForm({ brand: p.brand || "", category: guessCategory(p.brand), amount: p.amount || "", date: p.date || todayStr() });
    } catch {
      toast("Could not read the receipt. Please fill the fields in yourself.");
      setForm({ brand: "", category: "Other", amount: "", date: todayStr() });
    } finally {
      setOcr(false);
      setShowForm(true);
    }
  };

  const reset = () => {
    setBlob(null); setPreview(""); setShowForm(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async (e) => {
    e.preventDefault();
    if (!blob) { toast("Add a photo first."); return; }
    setSaving(true);
    try {
      const imgUrl = await uploadToCloudinary(blob);
      await addDoc(collection(db, "receipts"), {
        uid,
        brand: form.brand.trim(),
        category: form.category,
        amount: parseFloat(form.amount) || 0,
        date: form.date,
        imgUrl,
        createdAt: serverTimestamp(),
      });
      toast("Receipt saved.");
      reset();
      onSaved?.();
    } catch (err) {
      console.error("Save failed:", err);
      toast("Save failed: " + err.message);
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

      <label className="capture-drop">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        {!preview && (
          <div id="dropInner">
            <div className="drop-frame">+</div>
            <span>Open the camera or choose a photo</span>
          </div>
        )}
        {preview && <img src={preview} className="preview-img" alt="receipt preview" />}
      </label>

      {ocr && <div className="ocr-status"><span className="spinner" /> Reading the receipt…</div>}

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
          <label>Amount ($)
            <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" required />
          </label>
          <label>Date
            <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
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
