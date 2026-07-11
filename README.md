# ReceiptVault

![Stack](https://img.shields.io/badge/stack-Next.js%20%2F%20React-000000)
![Backend](https://img.shields.io/badge/backend-Firebase%20%2B%20Cloudinary-FFCA28)
![Cost](https://img.shields.io/badge/cost-%240%20free%20tier-2ea44f)
![OCR](https://img.shields.io/badge/OCR-Tesseract.js-blueviolet)

Photograph a receipt and the app reads the **store, amount and date** for you, stores the **photo and its data** in the cloud, and shows your **monthly and yearly spending**. Export everything as CSV at tax season.

Built as a portfolio project at **$0 cost**, using the Firebase free (Spark) plan for auth and database, plus the Cloudinary free tier for images. (Firebase Storage now requires a billing account even for free usage, so images live on Cloudinary instead.)

> **Now a Next.js app.** This was originally plain HTML/CSS/JS with no build step. It has been ported to **Next.js 14 (App Router) + React 18**: same features, same visual system, same Firebase/Cloudinary backend, now componentised with a real build pipeline. The logic that used to live in one `app.js` is split into `lib/` (pure helpers) and `components/` (the UI).

## What problem this solves

Tracking receipts for taxes or budgeting usually means a shoebox, a spreadsheet nobody updates, or a paid app with a subscription. ReceiptVault does the annoying part for you: take a photo, OCR reads the store, amount, and date, and it's saved and charted automatically. It's built to run at $0 on free tiers, so a family can use it indefinitely without a bill showing up.

## Features
- Google sign-in (each user sees only their own receipts)
- Back-camera capture on phones (`capture="environment"`)
- On-device OCR (Tesseract.js) fills in store, amount and date, which you can edit before saving
- Auto image compression (max 1200px, JPEG 0.7) so storage stays tiny
- Live dashboard: this-month and this-year totals, monthly bar chart, category doughnut
- Search and filter all receipts, tap an image to zoom, delete
- Export CSV (for taxes) and JSON backup

## Tech
Next.js 14 (App Router) · React 18 · Firebase Auth + Firestore · Cloudinary (images) · Tesseract.js · Chart.js.

### Project layout
```
app/
  layout.js          root layout + Google fonts (next/font)
  page.js            "use client" root: auth gate + Firestore subscription
  globals.css        the visual system (ported from the old styles.css)
components/
  Login.js           Google sign-in view
  AppShell.js        sidebar + tab switching
  Dashboard.js       stats + Chart.js bar/doughnut
  Capture.js         camera → OCR → editable form → save
  Receipts.js        ledger list, search/filter, delete, image modal
  Export.js          CSV + JSON export
  ConsentBanner.js   cookie consent
  Toast.js           toast context/provider
lib/
  config.js          firebase + cloudinary keys (public by design)
  firebase.js        Firebase singletons (app/auth/db)
  cloudinary.js      unsigned image upload
  receipt.js         pure helpers: OCR parse, compression, categories, URL safety
public/
  privacy.html       static privacy policy
```

---

## Deploy on your device

The keys committed in `lib/config.js` are **public by design**: Firebase security is enforced by the Firestore rules (below), not by hiding the config. To run this under **your own** free accounts, replace the values in `lib/config.js` and follow the steps below. It takes about 10 minutes, is free, and needs no credit card.

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com>, click **Add project**, name it, and create it.
2. Click the **`</>` (Web)** icon to register a web app, give it a nickname, then **Register**.
3. Firebase shows a `firebaseConfig = { ... }` object. Copy those values into **`lib/config.js`**.

### 2. Turn on Authentication + Firestore
- **Authentication**: Get started, open Sign-in method, enable **Google**, then Save.
- **Firestore Database**: Create database, choose **Production mode**, pick a region.
- Skip **Storage**: it now requires a billing (Blaze) plan even for free usage, so images go to Cloudinary (step 3).

### 3. Create a free Cloudinary account (for receipt images)
1. Visit <https://cloudinary.com/users/register/free> and sign up. No card required.
2. The dashboard shows your **Cloud name** at the top. Paste it into `cloudinaryConfig.cloudName` in `lib/config.js`.
3. Open Settings (gear icon), go to the **Upload** tab, scroll to **Upload presets**, then **Add upload preset**.
4. Set **Signing Mode** to **Unsigned** and Save.
5. Copy that preset's name into `cloudinaryConfig.uploadPreset`.

Free tier: 25GB storage plus bandwidth, well beyond family use.

### 4. Paste Firestore security rules (so each user only touches their own data)

In **Firestore → Rules**. These bind every document to its owner and validate the shape and size of each field on create. Documents are immutable (no `update` rule), so validation only runs at creation:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /receipts/{id} {
      // Read and delete only your own receipts.
      allow read, delete: if request.auth != null
        && resource.data.uid == request.auth.uid;

      // Create only a well-formed receipt owned by the signed-in user.
      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.keys().hasOnly(
             ['uid','brand','category','amount','date','imgUrl','createdAt'])
        && request.resource.data.brand is string
        && request.resource.data.brand.size() <= 100
        && request.resource.data.category is string
        && request.resource.data.category.size() <= 50
        && request.resource.data.amount is number
        && request.resource.data.amount >= 0
        && request.resource.data.amount <= 1000000
        && request.resource.data.date is string
        && request.resource.data.date.size() <= 10
        && request.resource.data.imgUrl is string
        && request.resource.data.imgUrl.size() <= 500
        && request.resource.data.imgUrl.matches('https://res(-[a-z0-9]+)?[.]cloudinary[.]com/.*')
        && request.resource.data.createdAt == request.time;

      // Documents are immutable once written.
      allow update: if false;
    }
  }
}
```

### 5. Authorize your domains
In Authentication → **Settings → Authorized domains**, add:
- `localhost` (already there, for local testing)
- your production domain (e.g. `your-app.vercel.app`)

---

## Run locally
```
npm install
npm run dev
```
Open <http://localhost:5173>. Google sign-in needs `http://localhost`, not `file://`, and Next's dev server handles that automatically.

## Build / deploy
```
npm run build   # production build
npm start        # serve the production build on :5173
```

**Deploy (Vercel, free):** import the repo at <https://vercel.com/new>. Vercel auto-detects Next.js (`vercel.json` sets `"framework": "nextjs"`), no config needed. Add your production domain to Firebase **Authorized domains** afterwards.

## Security hardening

- **Cloudinary unsigned uploads:** the cloud name + preset are public, so anyone can POST images to the preset (spam, storage/bandwidth exhaustion, hosting arbitrary images under the account). In the preset settings, restrict to a dedicated folder, set **Allowed formats** to `jpg,png,webp`, cap **Max file size** and image dimensions, and enable **moderation**. For a real deployment, move to **signed uploads** via a Next.js API route (`app/api/sign/route.js`) so the browser never holds upload authority. Deleted receipts leave their image behind (no client-side delete without a secret key), acceptable at family scale, and worth documenting as a retention/privacy item.
- **Content-Security-Policy + headers:** add a CSP and hardening headers at the host. With Next on Vercel, set them in `next.config.mjs` under `async headers()` (or `vercel.json`). A CSP that fits the current dependencies:
  ```
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com;
  connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://api.cloudinary.com;
  worker-src 'self' blob:;
  frame-src https://*.firebaseapp.com;
  object-src 'none'; base-uri 'self';
  ```
  (Next's runtime needs `'unsafe-inline'`/`'unsafe-eval'` in `script-src` unless you wire up a nonce.)
  Also add `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- **Bundled dependencies:** Chart.js, Tesseract.js and the Firebase SDK are now installed via npm and bundled by Next, not pulled from a CDN at runtime, so the old Subresource-Integrity concern for `<script>` CDN tags no longer applies. Keep versions pinned and run `npm audit` periodically.

## Notes and limits
- OCR accuracy on crumpled or faded receipts is about 70 to 85 percent, which is why every field stays editable before save.
- Free tier: 50k Firestore reads per day, 25GB Cloudinary storage, well beyond a family's use.
- Client config keys in `lib/config.js` are meant to be public. Security comes from the Firestore rules above.
- The receipt list loads a user's whole collection into memory (fine at family scale). For thousands of receipts, add Firestore pagination (`limit` + `startAfter`).
- Deleting a receipt removes its Firestore record; the Cloudinary image stays stored (unsigned uploads cannot be deleted without exposing a secret key client-side), a non-issue at this scale on the 25GB free tier.
