import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "../components/BottomNav";
import TopNav from "../components/TopNav";
import SyncProvider from "../components/SyncProvider";
import PaymentLock from "../components/PaymentLock";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DurianCare",
  description: "Hybrid CNN-ViT Ripeness Assessment",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DurianCare",
    // Adding apple-touch-icon link logic internally
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // Essential for full-screen PWA
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-100 h-full overflow-hidden`}>
        <PaymentLock>
          <SyncProvider>
            <div className="relative h-full max-w-md mx-auto bg-white shadow-2xl flex flex-col">
              {/* Top Navigation */}
              <TopNav />
              
              {/* Scrollable Content Area */}
              <main className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
                {children}
              </main>

              {/* Bottom Navigation */}
              <BottomNav />
              
              {/* Global Overlays */}
            </div>
          </SyncProvider>
        </PaymentLock>
      </body>
    </html>
  );
}