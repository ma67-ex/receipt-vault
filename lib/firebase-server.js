import { firebaseConfig } from "./config";

// Firebase ID token -> uid, checked with Google's Identity Toolkit lookup endpoint (server side only,
// no Admin SDK needed on the free tier). Returns null for a missing, expired or forged token.
export async function uidFromIdToken(idToken) {
  if (!idToken) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    return res.ok ? (await res.json()).users?.[0]?.localId || null : null;
  } catch { return null; }
}
