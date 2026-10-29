import { createHash } from "node:crypto";

// "https://res.cloudinary.com/<cloud>/image/upload/v123/abc.jpg" -> "abc"
// Unsigned uploads here use no folder or transformation, but keep any folder path.
export function publicIdFromUrl(url) {
  const m = /\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i.exec(String(url));
  return m ? decodeURIComponent(m[1]) : "";
}

// Signed destroy. Secret stays server-side (Vercel env), never in the browser.
export async function destroyImage(publicId, { cloudName, apiKey, apiSecret }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");
  const body = new URLSearchParams({ public_id: publicId, timestamp, api_key: apiKey, signature });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: "POST", body });
  if (!res.ok) throw new Error("Cloudinary destroy failed");
}
