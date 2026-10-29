import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { uploadToCloudinary } from "./cloudinary";
import { buildDoc } from "./receipt";
import { pending, remove } from "./queue";

// Upload the photo, then write the receipt. The extra fields (currency, time, pre-tax, tax, payment) need the
// updated Firestore rules; on older rules the write is refused, so it is retried with the original fields only.
export async function saveReceipt(uid, blob, form) {
  const imgUrl = await uploadToCloudinary(blob);
  const { base, extras } = buildDoc(form);
  const doc = { uid, ...base, imgUrl, createdAt: serverTimestamp() };
  try {
    await addDoc(collection(db, "receipts"), { ...doc, ...extras });
    return { extras: true };
  } catch (err) {
    if (err.code !== "permission-denied" || !Object.keys(extras).length) throw err;
    await addDoc(collection(db, "receipts"), doc);
    return { extras: false };
  }
}

// A failed fetch (no network) throws TypeError. An HTTP error does not, so a bad upload preset is never queued forever.
export const isOffline = (err) => (typeof navigator !== "undefined" && !navigator.onLine) || err instanceof TypeError;

let flushing = false;
// Upload receipts that were captured offline. Stops at the first failure and keeps the rest for next time.
export async function flushQueue(uid) {
  if (flushing) return 0;
  flushing = true;
  let done = 0;
  try {
    for (const item of await pending(uid)) {
      try { await saveReceipt(uid, item.blob, item.form); await remove(item.id); done++; }
      catch { break; }
    }
  } finally { flushing = false; }
  return done;
}
