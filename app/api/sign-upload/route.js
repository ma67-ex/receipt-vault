import { firebaseConfig, cloudinaryConfig } from "@/lib/config";
import { signParams } from "@/lib/cloudinary-server";

// Signs one upload into receipts/<uid>/ for a signed-in user, so uploads do not depend on the public unsigned preset.
// The caller's Firebase ID token is checked with Google's lookup endpoint. 501 when the secret is not configured,
// and the client then falls back to the unsigned preset.
export async function POST(req) {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) return Response.json({ error: "not configured" }, { status: 501 });

  const idToken = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!idToken) return Response.json({ error: "unauthorized" }, { status: 401 });
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const uid = res.ok ? (await res.json()).users?.[0]?.localId : null;
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = { folder: `receipts/${uid}`, timestamp: Math.floor(Date.now() / 1000) };
  return Response.json({ ...params, apiKey, cloudName: cloudinaryConfig.cloudName, signature: signParams(params, apiSecret) });
}
