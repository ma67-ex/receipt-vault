// Firebase singletons. Guarded so Next's double-eval / fast-refresh never
// re-inits the app. Client-only usage (imported from "use client" modules).
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { firebaseConfig } from "./config";

const isNew = getApps().length === 0;
const app = isNew ? initializeApp(firebaseConfig) : getApp();

// Firestore with IndexedDB-backed offline cache. onSnapshot then serves the
// last-synced receipts straight from disk when the network is gone, so the
// Dashboard / All-receipts tabs open with real data offline. initializeFirestore
// only works on first init; on fast-refresh re-eval we fall back to getFirestore.
export const db = (() => {
  if (!isNew) return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // e.g. private-mode / IndexedDB unavailable — degrade to memory cache.
    return getFirestore(app);
  }
})();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
