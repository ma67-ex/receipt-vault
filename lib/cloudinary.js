import { cloudinaryConfig } from "./config";
import { auth } from "./firebase";

// Signed upload parameters from our server route, or null when it is not configured, offline or unauthorized.
async function signedParams() {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;
    const res = await fetch("/api/sign-upload", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Upload a Blob to Cloudinary (free tier, no card). Signed into receipts/<uid>/ when the server route is
// configured; otherwise the unsigned preset. Returns the delivered secure_url.
export async function uploadToCloudinary(blob) {
  const signed = await signedParams();
  const form = new FormData();
  form.append("file", blob);
  if (signed) {
    form.append("api_key", signed.apiKey);
    form.append("timestamp", signed.timestamp);
    form.append("folder", signed.folder);
    form.append("signature", signed.signature);
  } else {
    form.append("upload_preset", cloudinaryConfig.uploadPreset);
  }
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Image upload failed");
  const data = await res.json();
  return data.secure_url;
}
