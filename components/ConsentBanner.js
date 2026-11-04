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
          Essential cookies keep you signed in. <span className="consent-long">You can accept everything,
          or keep it to the essentials only.</span>{" "}
          <a href="/cookies.html" target="_blank" rel="noopener noreferrer">Cookie Policy</a>
          {" · "}
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </p>
      </div>
      <div className="consent-actions">
        <button className="btn-essential" onClick={() => decide("essential")}>Essentials only</button>
        <button className="btn-accept" onClick={() => decide("all")}>Accept all</button>
      </div>
    </div>
  );
}
