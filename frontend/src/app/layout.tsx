import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
import {
  AccessibilityTopBar,
  PrototypeSafetyBanner,
  PrototypeSafetyFooter,
} from "@/components/PrototypeBanner";
import { RightSidebarNav } from "@/components/RightSidebarNav";
import { Providers } from "@/components/Providers";
import "@/styles/globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-noto-sans",
  display: "swap",
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MedSarthi — Accessible Healthcare Communication Prototype",
  description:
    "Multilingual, accessibility-first educational prototype helping patients understand doctor-provided instructions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${notoSans.variable} ${notoDevanagari.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Providers>
          <AccessibilityTopBar />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
          <RightSidebarNav />
          <PrototypeSafetyBanner />
          <PrototypeSafetyFooter />
        </Providers>
      </body>
    </html>
  );
}
