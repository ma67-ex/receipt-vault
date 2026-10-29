import { firebaseConfig, cloudinaryConfig } from "@/lib/config";
import { destroyImage, publicIdFromUrl } from "@/lib/cloudinary-server";

const DOC = (id) =>
  `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/receipts/${encodeURIComponent(id)}`;

// Deletes a receipt AND its Cloudinary image. Firestore calls carry the user's
// own ID token, so the security rules decide ownership; imgUrl comes from the
// stored doc, never from the client. 501 when the secret is not configured, and
// the client then falls back to deleting only the record.
export async function POST(req) {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) return Response.json({ error: "not configured" }, { status: 501 });

  const auth = req.headers.get("authorization") || "";
  const { id } = await req.json().catch(() => ({}));
  if (!auth.startsWith("Bearer ") || !id) return Response.json({ error: "bad request" }, { status: 400 });

  const headers = { Authorization: auth };
  const got = await fetch(DOC(id), { headers });
  if (got.status === 404) return Response.json({ ok: true });
  if (!got.ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const imgUrl = (await got.json()).fields?.imgUrl?.stringValue;

  const del = await fetch(DOC(id), { method: "DELETE", headers });
  if (!del.ok) return Response.json({ error: "forbidden" }, { status: 403 });

  const publicId = publicIdFromUrl(imgUrl);
  if (publicId) {
    try { await destroyImage(publicId, { ...cloudinaryConfig, apiKey, apiSecret }); }
    catch (err) { console.error(err.message); } // record is gone; orphan image is the old behavior
  }
  return Response.json({ ok: true });
}
