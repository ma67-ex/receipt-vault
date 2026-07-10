"use client";
import { useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CATEGORIES, money, safeImageUrl } from "@/lib/receipt";
import { useToast } from "./Toast";

export default function Receipts({ receipts }) {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("");
  const [modal, setModal] = useState("");

  const filtered = receipts.filter(
    (r) =>
      (!term || (r.brand || "").toLowerCase().includes(term.toLowerCase())) &&
      (!cat || r.category === cat)
  );

  // Note: only removes the Firestore record. The Cloudinary image (unsigned
  // upload, no secret key in the browser) stays stored — fine at family scale.
  const remove = async (id) => {
    if (!confirm("Delete this receipt permanently?")) return;
    try { await deleteDoc(doc(db, "receipts", id)); toast("Deleted"); }
    catch (err) { toast("Delete failed: " + err.message); }
  };

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
          {filtered.map((r) => {
            const src = safeImageUrl(r.imgUrl);
            return (
              <div className="row" key={r.id}>
                <div className="cell store">
                  {src
                    ? <img className="thumb" src={src} alt={r.brand || ""} onClick={() => setModal(src)} />
                    : <span className="thumb thumb-empty" />}
                  <span className="name">{r.brand || "Unknown"}</span>
                </div>
                <div className="cell cat"><span className="tag">{r.category || "Other"}</span></div>
                <div className="cell date">{r.date || ""}</div>
                <div className="cell amt num">{money(r.amount)}</div>
                <div className="cell act"><button className="del" onClick={() => remove(r.id)}>Remove</button></div>
              </div>
            );
          })}
        </div>
      </div>
      {receipts.length === 0 && (
        <p className="empty-state">Nothing here yet. Add your first receipt from the Add receipt tab.</p>
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
