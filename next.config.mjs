/** @type {import('next').NextConfig} */

// Content Security Policy. Report-only for the first days so a missed host shows up in the browser console
// instead of breaking sign-in or OCR; flip the header name to "Content-Security-Policy" once it is quiet.
// Hosts: Firebase Auth and Firestore (googleapis, the /__/auth rewrites are same-origin), Cloudinary uploads
// and images, Google avatars, Tesseract.js worker/core/language files (jsdelivr, projectnaptha) which run
// as blob: workers with WebAssembly. Next.js injects inline scripts, hence 'unsafe-inline' for now.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://apis.google.com",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.cloudinary.com https://*.googleusercontent.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com https://api.cloudinary.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    // Cloudinary + Google avatars are the only remote hosts we render.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "res-*.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
