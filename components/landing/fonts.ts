import { Inter, Instrument_Serif } from "next/font/google";

/**
 * The website's two typefaces, self-hosted by next/font and loaded only for
 * the pages that import this file (the landing page). The signed-in app keeps
 * its own system stack.
 *
 *   Inter             all text (400-700)
 *   Instrument Serif  one emphasised italic word per heading
 */
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--site-font-sans",
});

export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--site-font-serif",
});
