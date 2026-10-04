import { Instrument_Serif, Manrope } from "next/font/google";

/** Clear, rounded product-label typography, self-hosted for the public site. */
export const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--site-font-sans",
});

/** Retain the established display face for the hero alone. */
export const heroDisplay = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--site-font-display",
});
