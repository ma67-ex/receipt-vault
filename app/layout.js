import "./globals.css";
import { Cormorant_Garamond, Inter } from "next/font/google";
import SWRegister from "@/components/SWRegister";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = {
  title: "Receipt Vault · Keep every receipt, know every dollar",
  description:
    "Photograph a receipt and Receipt Vault files the store, amount and date for you. Come tax season, everything is already in one place.",
};

export const viewport = {
  themeColor: "#eceae4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}<SWRegister /></body>
    </html>
  );
}
