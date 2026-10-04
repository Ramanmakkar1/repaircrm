import type { Metadata, Viewport } from "next";
import { readUiPrefs } from "@/lib/prefs";
import { AppToaster } from "@/components/ui/toaster";
import "./globals.css";
import { PUBLIC_SITE_URL } from "@/lib/public-site";

/** Relative metadata URLs (canonical, social image) resolve against the public origin. */
const siteOrigin = new URL(PUBLIC_SITE_URL);

export const metadata: Metadata = {
  metadataBase: siteOrigin,
  title: "Repairs helper",
  description: "Repair shop management, done right.",
  // Public marketing and legal pages opt in; account and shop screens stay out of search.
  robots: { index: false, follow: true },
  // The manifest lives at app/manifest.ts; naming it here is what puts the
  // <link rel="manifest"> in the document, which is what makes the app
  // installable.
  manifest: "/manifest.webmanifest",
  applicationName: "Repairs helper",
  appleWebApp: {
    capable: true,
    title: "Repairs helper",
    // "default" keeps the iOS status bar legible against the app's white
    // canvas; "black-translucent" would let content slide under the clock.
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/symbol-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/symbol-512.png", sizes: "512x512", type: "image/png" },
    ],
    // iOS ignores the manifest for this one and reads the tag.
    apple: [{ url: "/icons/symbol-apple.png", sizes: "180x180" }],
  },
};

/**
 * The browser chrome colour, matching the app's canvas in each theme so an
 * installed copy has no seam between the OS bar and the page.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The on-screen keyboard shrinks the page instead of covering it, so the
  // fixed Next / Save / Pay bars ride above the keyboard rather than behind it.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefs = await readUiPrefs();
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-theme={prefs.theme !== "system" ? prefs.theme : undefined}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <AppToaster theme={prefs.theme} />
      </body>
    </html>
  );
}
