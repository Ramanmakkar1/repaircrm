import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepairFlow",
  description: "Repair shop management, done right.",
  // The manifest lives at app/manifest.ts; naming it here is what puts the
  // <link rel="manifest"> in the document, which is what makes the app
  // installable.
  manifest: "/manifest.webmanifest",
  applicationName: "RepairFlow",
  appleWebApp: {
    capable: true,
    title: "RepairFlow",
    // "default" keeps the iOS status bar legible against the app's white
    // canvas; "black-translucent" would let content slide under the clock.
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // iOS ignores the manifest for this one and reads the tag.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

/**
 * The browser chrome colour, matching the app's canvas in each theme so an
 * installed copy has no seam between the OS bar and the page.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
