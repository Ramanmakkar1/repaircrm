import type { Metadata } from "next";

/**
 * The console has no shop shell — no side menu, no location switcher, no
 * assistant. It is a different product for a different person.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
