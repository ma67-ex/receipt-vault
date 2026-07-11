"use client";
import { useState, useEffect } from "react";

// Essential cookies (Firebase auth/session) always run. This banner only records
// whether the visitor also allows non-essential cookies, and remembers the choice.
const CONSENT_KEY = "rv_consent";

export default function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem(CONSENT_KEY); } catch { /* storage blocked */ }
    if (saved !== "all" && saved !== "essential") setOpen(true);
  }, []);

  const decide = (choice) => {
    try { localStorage.setItem(CONSENT_KEY, choice); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="consent">
      <div className="consent-text">
        <b>A note on cookies</b>
        <p>
          Receipt Vault uses a small number of cookies. The essential ones keep you
          signed in through Google and cannot be turned off. You can accept everything,
          or keep it to the essentials only. See our <a href="/cookies.html">Cookie Policy</a> for
          the full list, or our <a href="/privacy.html">Privacy Policy</a> for the full picture.
        </p>
      </div>
      <div className="consent-actions">
        <button className="btn-essential" onClick={() => decide("essential")}>Essentials only</button>
        <button className="btn-accept" onClick={() => decide("all")}>Accept all</button>
      </div>
    </div>
  );
}
