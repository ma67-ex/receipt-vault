"use client";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useToast } from "./Toast";

export default function Login() {
  const toast = useToast();

  const signIn = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { toast("Sign-in failed: " + e.message); }
  };

  return (
    <section className="login-view">
      <div className="login-card">
        <div className="brand-mark">Receipt&nbsp;Vault</div>
        <h1>Every receipt, quietly kept.</h1>
        <p className="tagline">
          Photograph a receipt and it reads the store, amount and date, then files the
          image alongside them. When tax season comes around, the work is already done.
        </p>
        <button className="google-btn" onClick={signIn}>
          <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.5 5.5C41.9 36 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z" />
          </svg>
          Continue with Google
        </button>
        <p className="fineprint">Free to use. Your receipts stay private to your account.</p>
        <p className="login-links"><Link href="/privacy">Privacy Policy</Link></p>
      </div>
      <footer className="login-foot">A portfolio project, running on the Firebase free tier.</footer>
    </section>
  );
}
