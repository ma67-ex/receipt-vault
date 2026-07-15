"use client";
import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ToastProvider } from "@/components/Toast";
import Login from "@/components/Login";
import AppShell from "@/components/AppShell";
import ConsentBanner from "@/components/ConsentBanner";
import Footer from "@/components/Footer";

export default function Home() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  // false until the first Firestore snapshot lands (cache or network) — drives
  // the skeleton placeholders instead of showing empty tables mid-load.
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); });
  }, []);

  // Live receipts for the signed-in user. Single-field query (no composite
  // index), sorted newest-first in the browser. Firestore's persistent cache
  // fills this from disk first when offline (snap.metadata.fromCache).
  useEffect(() => {
    if (!user) { setReceipts([]); setDataReady(false); return; }
    setDataReady(false);
    const q = query(collection(db, "receipts"), where("uid", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        setReceipts(rows);
        setDataReady(true);
      },
      (err) => { console.error("Firestore load error:", err); setDataReady(true); }
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
      {ready && user && <AppShell user={user} receipts={receipts} loading={!dataReady} />}
      {ready && <Footer />}
      <ConsentBanner />
    </ToastProvider>
  );
}
