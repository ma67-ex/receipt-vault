"use client";
import { useState, useRef } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { CATEGORIES, compressImage, guessCategory, money, todayStr } from "@/lib/receipt";
import { readReceipt } from "@/lib/ocr";
import { useToast } from "./Toast";

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
  const [form, setForm] = useState({ brand: "", category: "Other", amount: "", date: todayStr() });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
      const p = await readReceipt(file, (n, of) => setOcr(n > 1 ? `Reading again, pass ${n} of ${of}…` : "Reading the receipt…"));
      setRead(p);
      setForm({ brand: p.brand || "", category: guessCategory(p.brand), amount: p.amount || "", date: p.date || todayStr() });
    } catch {
      toast("Could not read the receipt. Please fill the fields in yourself.");
      setForm({ brand: "", category: "Other", amount: "", date: todayStr() });
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

      {showForm && read && (read.time || read.payment || read.tax !== "" || read.subtotal !== "") && (
        <p className="hint">
          Also read:{" "}
          {[
            read.time && `time ${read.time}`,
            read.subtotal !== "" && `before tax ${money(read.subtotal)}${read.derived.includes("subtotal") ? " (worked out)" : ""}`,
            read.tax !== "" && `tax ${money(read.tax)}${read.derived.includes("tax") ? " (worked out)" : ""}`,
            read.payment && `paid by ${read.payment}`,
          ].filter(Boolean).join(", ")}
          . {read.consistent ? "The amounts add up." : "The amounts do not add up, so check the total."}
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
