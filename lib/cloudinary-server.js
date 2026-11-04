import { createHash } from "node:crypto";

// "https://res.cloudinary.com/<cloud>/image/upload/v123/abc.jpg" -> "abc"
// Unsigned uploads here use no folder or transformation, but keep any folder path.
export function publicIdFromUrl(url) {
  const m = /\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i.exec(String(url));
  return m ? decodeURIComponent(m[1]) : "";
}

// The public id of a receipt image only if the URL is one of ours and the image sits in the caller's own
// folder, receipts/<uid>/... . Anything else (another cloud, another user's folder, the legacy flat
// uploads from the unsigned preset) returns "" and the caller must not destroy it. This is what stops a user
// from storing someone else's image URL in their own receipt and deleting that image through the server.
export function ownedPublicId(url, cloudName, uid) {
  let u;
  try { u = new URL(String(url)); } catch { return ""; }
  if (u.protocol !== "https:" || !/^res(-[a-z0-9]+)?\.cloudinary\.com$/i.test(u.hostname)) return "";
  if (!cloudName || !uid || !u.pathname.startsWith(`/${cloudName}/image/upload/`)) return "";
  const publicId = publicIdFromUrl(u.pathname);
  const prefix = `receipts/${uid}/`;
  if (!publicId.startsWith(prefix) || publicId.length <= prefix.length) return "";
  if (publicId.includes("..") || publicId.slice(prefix.length).includes("/")) return "";
  return publicId;
}

// Cloudinary signature: sorted "key=value" pairs joined by "&", the API secret appended, SHA-1 in hex.
export function signParams(params, secret) {
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("sha1").update(toSign + secret).digest("hex");
}

// Signed destroy. Secret stays server-side (Vercel env), never in the browser.
export async function destroyImage(publicId, { cloudName, apiKey, apiSecret }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp }, apiSecret);
  const body = new URLSearchParams({ public_id: publicId, timestamp, api_key: apiKey, signature });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: "POST", body });
  if (!res.ok) throw new Error("Cloudinary destroy failed");
}
