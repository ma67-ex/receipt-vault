import { cloudinaryConfig } from "./config";

// Upload a Blob to Cloudinary via the unsigned preset (free tier, no card).
// Returns the delivered secure_url.
export async function uploadToCloudinary(blob) {
  const { cloudName, uploadPreset } = cloudinaryConfig;
  const form = new FormData();
  form.append("file", blob);
  form.append("upload_preset", uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Image upload failed");
  const data = await res.json();
  return data.secure_url;
}
