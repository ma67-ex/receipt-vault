// ─────────────────────────────────────────────────────────────
// FIREBASE + CLOUDINARY CONFIG. Auth + Firestore only (free, no card).
// Images go to Cloudinary (Firebase Storage now needs a Blaze plan).
// These client keys are SAFE to be public — Firebase security is enforced
// by the Firestore rules, not by hiding this config.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyA1OxFUpWoICuaCsUpERHo1hQx3r0wapHs",
  authDomain: "receipt-vault-seven.vercel.app",
  projectId: "reciept-vault-6f2af",
  storageBucket: "reciept-vault-6f2af.firebasestorage.app",
  messagingSenderId: "850903366782",
  appId: "1:850903366782:web:3a8d45183b440a5f8a2c2f",
  measurementId: "G-KHKQRBXQ9D",
};

// Free Cloudinary image storage (unsigned preset, no card needed).
export const cloudinaryConfig = {
  cloudName: "xulzdnnc",
  uploadPreset: "RecieptVault",
};
