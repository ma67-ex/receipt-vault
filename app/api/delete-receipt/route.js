import { firebaseConfig, cloudinaryConfig } from "@/lib/config";
import { destroyImage, ownedPublicId } from "@/lib/cloudinary-server";
import { uidFromIdToken } from "@/lib/firebase-server";
import { rateLimit, tooMany, clientIp, readJson } from "@/lib/rate-limit";

const DOC = (id) =>
  `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/receipts/${encodeURIComponent(id)}`;

// Deletes a receipt AND its Cloudinary image. Firestore calls carry the user's
// own ID token, so the security rules decide ownership of the record. The image
// is a separate question: the stored imgUrl was written by the user, so before
// destroying anything the route checks the token with Google, learns the uid,
// and only destroys an image that lives in receipts/<uid>/ in our own cloud.
// 501 when the secret is not configured, and the client then falls back to
// deleting only the record.
export async function POST(req) {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) return Response.json({ error: "not configured" }, { status: 501 });

  const ip = clientIp(req);
  if (ip) { const ipLimit = rateLimit(`ip:${ip}:delete`, 60); if (!ipLimit.ok) return tooMany(ipLimit); }

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length > 4096) return Response.json({ error: "bad request" }, { status: 400 });
  const { id } = await readJson(req, 1024);
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Response.json({ error: "bad request" }, { status: 400 });

  const uid = await uidFromIdToken(auth.slice("Bearer ".length));
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const userLimit = rateLimit(`uid:${uid}:delete`, 30); // deletes per minute per user
  if (!userLimit.ok) return tooMany(userLimit);

  const headers = { Authorization: auth };
  const got = await fetch(DOC(id), { headers });
  if (got.status === 404) return Response.json({ ok: true });
  if (!got.ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const imgUrl = (await got.json()).fields?.imgUrl?.stringValue;

  const del = await fetch(DOC(id), { method: "DELETE", headers });
  if (!del.ok) return Response.json({ error: "forbidden" }, { status: 403 });

  const publicId = ownedPublicId(imgUrl, cloudinaryConfig.cloudName, uid);
  if (publicId) {
    try { await destroyImage(publicId, { ...cloudinaryConfig, apiKey, apiSecret }); }
    catch (err) { console.error(err.message); } // record is gone; orphan image is the old behavior
  }
  return Response.json({ ok: true });
}

