import { Manrope } from "next/font/google";

/** Clear, rounded product-label typography, self-hosted for the public site. */
export const manrope = Manrope({
  subsets: ["latin"],
    display: "swap",
  variable: "--site-font-sans",
});
