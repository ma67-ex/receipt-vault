"use client";
import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Dashboard from "./Dashboard";
import Capture from "./Capture";
import Receipts from "./Receipts";
import Export from "./Export";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "capture", label: "Add receipt" },
  { id: "receipts", label: "All receipts" },
  { id: "export", label: "Export" },
];

export default function AppShell({ user, receipts, loading = false }) {
  const [tab, setTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (id) => { setTab(id); setMenuOpen(false); };

  return (
    <section className="app-view">
      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
        <div className="side-brand">Receipt <span className="vault">Vault</span></div>
        <nav className="side-nav">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-item${tab === t.id ? " active" : ""}`} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="side-user">
          {user.photoURL && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
          <div className="side-user-meta">
            <span>{user.displayName || user.email}</span>
            <button className="link-btn" onClick={() => signOut(auth)}>Sign out</button>
          </div>
        </div>
      </aside>

      <button className="menu-btn" aria-label="Open menu" onClick={() => setMenuOpen((o) => !o)}>Menu</button>

      <main className="content">
        {tab === "dashboard" && <Dashboard receipts={receipts} loading={loading} />}
        {tab === "capture" && <Capture uid={user.uid} onSaved={() => go("receipts")} />}
        {tab === "receipts" && <Receipts receipts={receipts} loading={loading} />}
        {tab === "export" && <Export receipts={receipts} />}
      </main>
    </section>
  );
}
