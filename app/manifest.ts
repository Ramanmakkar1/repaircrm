import type { MetadataRoute } from "next";

/**
 * The web app manifest, served at /manifest.webmanifest.
 *
 * What it buys a repair shop: the counter machine and the tech's phone can
 * install RepairPilot to the home screen and open it without browser chrome, so
 * the ticket board fills the screen and nobody navigates away by mistake.
 *
 * `start_url` is /dashboard rather than /: the marketing page is not what an
 * installed copy is for, and landing there would cost a redirect on every
 * launch. Someone who is signed out still gets sent to /login from there.
 *
 * `display: standalone` rather than fullscreen — an installed app that hides
 * the clock and the battery on a shop's counter tablet is a nuisance.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RepairPilot",
    short_name: "RepairPilot",
    description: "Repair shop management, done right.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // The app's own canvas colour, so the splash screen does not flash white
    // against a dark OS theme and then white again.
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // The same art declared maskable: Android crops icons to the launcher's
      // shape, and the glyph is inside the safe zone (see public/icons/icon.svg).
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
