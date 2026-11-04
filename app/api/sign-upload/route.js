import { cloudinaryConfig } from "@/lib/config";
import { signParams } from "@/lib/cloudinary-server";
import { uidFromIdToken } from "@/lib/firebase-server";

// Signs one upload into receipts/<uid>/ for a signed-in user, so uploads do not depend on the public unsigned preset.
// The caller's Firebase ID token is checked with Google's lookup endpoint (lib/firebase-server). 501 when the secret is not configured,
// and the client then falls back to the unsigned preset.
export async function POST(req) {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) return Response.json({ error: "not configured" }, { status: 501 });

  const uid = await uidFromIdToken((req.headers.get("authorization") || "").replace(/^Bearer /, ""));
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = { folder: `receipts/${uid}`, timestamp: Math.floor(Date.now() / 1000) };
  return Response.json({ ...params, apiKey, cloudName: cloudinaryConfig.cloudName, signature: signParams(params, apiSecret) });
}
