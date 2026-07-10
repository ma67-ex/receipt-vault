"use client";
import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ToastProvider } from "@/components/Toast";
import Login from "@/components/Login";
import AppShell from "@/components/AppShell";
import ConsentBanner from "@/components/ConsentBanner";

export default function Home() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); });
  }, []);

  // Live receipts for the signed-in user. Single-field query (no composite
  // index), sorted newest-first in the browser.
  useEffect(() => {
    if (!user) { setReceipts([]); return; }
    const q = query(collection(db, "receipts"), where("uid", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        setReceipts(rows);
      },
      (err) => console.error("Firestore load error:", err)
    );
  }, [user]);

  return (
    <ToastProvider>
      {!ready && (
        <section className="auth-splash">
          <div className="brand-mark">Receipt&nbsp;Vault</div>
          <span className="spinner" />
        </section>
      )}
      {ready && !user && <Login />}
      {ready && user && <AppShell user={user} receipts={receipts} />}
      <ConsentBanner />
    </ToastProvider>
  );
}
