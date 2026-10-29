"use client";
import { useState } from "react";
import { deleteDoc, deleteField, doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { CATEGORIES, CURRENCIES, buildDoc, money, safeImageUrl } from "@/lib/receipt";
import { useToast } from "./Toast";

function ReceiptsSkeleton() {
  return (
    <div className="tab active">
      <h2>All receipts</h2>
      <p className="section-lead">Everything you have filed, newest first.</p>
      <div className="ledger">
        <div className="ledger-head">
          <span>Store</span><span>Category</span><span>Date</span>
          <span className="num">Amount</span><span></span>
        </div>
        <div className="ledger-body">
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="row" key={i}>
              <div className="cell store">
                <span className="thumb sk" />
                <span className="sk sk-line" style={{ width: "58%" }} />
              </div>
              <div className="cell cat"><span className="sk sk-line" style={{ width: "70%" }} /></div>
              <div className="cell date"><span className="sk sk-line" style={{ width: "80%" }} /></div>
              <div className="cell amt num"><span className="sk sk-line" style={{ width: "50%" }} /></div>
              <div className="cell act"><span className="sk sk-line" style={{ width: "60%" }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PAGE = 50;

export default function Receipts({ receipts, loading = false }) {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("");
  const [modal, setModal] = useState("");
  const [draft, setDraft] = useState(null); // the receipt being edited, as form strings
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const filtered = receipts.filter(
    (r) =>
      (!term || (r.brand || "").toLowerCase().includes(term.toLowerCase())) &&
      (!cat || r.category === cat)
  );

  // Server route deletes the record and the Cloudinary image (secret stays on
  // the server). If it is unconfigured, offline or fails, fall back to removing
  // just the record, which Firestore queues offline.
  const remove = async (id) => {
    if (!confirm("Delete this receipt permanently?")) return;
    try {
      let ok = false;
      try {
        const token = await auth.currentUser.getIdToken();
        const res = await fetch("/api/delete-receipt", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        ok = res.ok;
      } catch {}
      if (!ok) await deleteDoc(doc(db, "receipts", id));
      toast("Deleted");
    } catch (err) { toast("Delete failed: " + err.message); }
  };

  const edit = (r) => setDraft({
    id: r.id, brand: r.brand || "", category: r.category || "Other", amount: String(r.amount ?? ""), date: r.date || "",
    currency: r.currency || "USD", time: r.time || "", subtotal: r.subtotal == null ? "" : String(r.subtotal),
    tax: r.tax == null ? "" : String(r.tax), payment: r.payment || "",
  });
  const setD = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const saveEdit = async (e) => {
    e.preventDefault();
    const { base, extras } = buildDoc(draft);
    const update = { ...base };
    for (const k of ["currency", "time", "subtotal", "tax", "payment"]) update[k] = k in extras ? extras[k] : deleteField();
    setSaving(true);
    try { await updateDoc(doc(db, "receipts", draft.id), update); toast("Receipt updated."); setDraft(null); }
    catch (err) {
      toast(err.code === "permission-denied" ? "Editing needs the updated Firestore rules. See the README." : "Update failed: " + err.message);
    } finally { setSaving(false); }
  };

  if (loading) return <ReceiptsSkeleton />;

  return (
    <div className="tab active">
      <h2>All receipts</h2>
      <p className="section-lead">Everything you have filed, newest first.</p>
      <div className="filter-row">
        <input type="text" placeholder="Search by store" value={term} onChange={(e) => setTerm(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="ledger">
        <div className="ledger-head">
          <span>Store</span>
          <span>Category</span>
          <span>Date</span>
          <span className="num">Amount</span>
          <span></span>
        </div>
        <div className="ledger-body">
          {filtered.slice(0, shown).map((r) => {
            const src = safeImageUrl(r.imgUrl);
            return (
              <div className="row" key={r.id}>
                <div className="cell store">
                  {src
                    ? <img className="thumb" src={src} alt={r.brand || ""} onClick={() => setModal(src)} />
                    : <span className="thumb thumb-empty" />}
                  <span className="name">
                    {r.brand || "Unknown"}
                    {(r.time || r.payment || r.tax != null) && (
                      <small className="sub">{[r.time, r.payment, r.tax != null && `tax ${money(r.tax, r.currency)}`].filter(Boolean).join(" · ")}</small>
                    )}
                  </span>
                </div>
                <div className="cell cat"><span className="tag">{r.category || "Other"}</span></div>
                <div className="cell date">{r.date || ""}</div>
                <div className="cell amt num">{money(r.amount, r.currency)}</div>
                <div className="cell act">
                  <button className="del" onClick={() => edit(r)}>Edit</button>
                  <button className="del" onClick={() => remove(r.id)}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {filtered.length > shown && (
        <button className="ghost-btn" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({filtered.length - shown} left)
        </button>
      )}
      {receipts.length === 0 && (
        <p className="empty-state">Nothing here yet. Add your first receipt from the Add receipt tab.</p>
      )}

      {draft && (
        <div className="img-modal" onClick={(e) => { if (e.target.classList.contains("img-modal")) setDraft(null); }}>
          <form className="receipt-form edit-form" onSubmit={saveEdit}>
            <h3>Edit receipt</h3>
            <label>Store<input type="text" value={draft.brand} onChange={(e) => setD("brand", e.target.value)} required /></label>
            <label>Category
              <select value={draft.category} onChange={(e) => setD("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Currency
              <select value={draft.currency} onChange={(e) => setD("currency", e.target.value)}>
                {[...new Set([draft.currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Total<input type="number" step="0.01" min="0" value={draft.amount} onChange={(e) => setD("amount", e.target.value)} required /></label>
            <label>Before tax<input type="number" step="0.01" min="0" value={draft.subtotal} onChange={(e) => setD("subtotal", e.target.value)} /></label>
            <label>Tax<input type="number" step="0.01" min="0" value={draft.tax} onChange={(e) => setD("tax", e.target.value)} /></label>
            <label>Date<input type="date" value={draft.date} onChange={(e) => setD("date", e.target.value)} required /></label>
            <label>Time<input type="time" value={draft.time} onChange={(e) => setD("time", e.target.value)} /></label>
            <label>Paid by<input type="text" maxLength={20} value={draft.payment} onChange={(e) => setD("payment", e.target.value)} /></label>
            <div className="form-actions">
              <button type="button" className="ghost-btn" onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
            </div>
          </form>
        </div>
      )}

      {modal && (
        <div className="img-modal" onClick={(e) => { if (e.target.classList.contains("img-modal")) setModal(""); }}>
          <img src={modal} alt="receipt" />
          <button id="imgModalClose" onClick={() => setModal("")}>Close</button>
        </div>
      )}
    </div>
  );
}
