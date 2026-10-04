/**
 * Every picture on the website, in one place: where the file is and what it
 * shows. Files live in public/. The screenshots are captured from the running
 * app (tablet 1024x768 @2x, phone 390x844 @3x) with the fictional "Demo Repair
 * Shop" data, so nothing here is a real customer.
 *
 * public/marketing/app/dashboard.webp is the Shop overview and is re-captured
 * whenever that screen changes; keep the file name.
 */

const app = "/marketing/app";

export const SHOTS = {
  home: {
    src: `${app}/home-tablet.webp`,
    alt: "The Home screen on a counter tablet: big New repair and New sale buttons, a Needs attention list, and picture tiles for Repairs, Pickup and pay, Take payment, Add customer, Find customer and Book a visit.",
  },
  homePhone: {
    src: `${app}/home-phone.webp`,
    alt: "The same Home screen on a phone: New repair and New sale side by side, the Needs attention counts, and tabs for Counter, Stock and Shop.",
  },
  newRepair: {
    src: `${app}/new-repair-tablet.webp`,
    alt: "Checking a device in, step two of four: picture boxes for Phone, Tablet, Laptop, Computer, Game console, TV, Watch and Other, with a This repair summary on the right.",
  },
  job: {
    src: `${app}/job-tablet.webp`,
    alt: "A repair job on a tablet: the device, the customer with Call and Text buttons, the status steps, and a big Start repair button beside Add part, Add photo, Message customer, Add note and Print.",
  },
  jobPhone: {
    src: `${app}/job-phone.webp`,
    alt: "The same repair job on a phone, with a big Start repair button pinned above the tab bar.",
  },
  pickup: {
    src: `${app}/pickup-tablet.webp`,
    alt: "The Ready for pickup list: two repairs, one with no invoice yet and a Create invoice button, one paid in full with a Hand over button.",
  },
  sell: {
    src: `${app}/pos-tablet.webp`,
    alt: "The Sell screen: product pictures to tap on the left, and the current sale with a total and Cash, Card and More buttons on the right.",
  },
  invoicePhone: {
    src: `${app}/invoice-phone.webp`,
    alt: "An invoice on a phone showing the amount due and a big Take payment button.",
  },
  dashboard: {
    src: `${app}/dashboard.webp`,
    alt: "The Shop overview: takings today and for the last seven days, money owed, and repairs on the bench by status.",
  },
  stock: {
    src: `${app}/inventory-tablet.webp`,
    alt: "The Stock screen: big picture groups such as Screen guards, Screens and Batteries, each with how many are in stock.",
  },
  assistant: {
    src: `${app}/assistant-panda-tablet.webp`,
    alt: "The shop assistant open over Home: suggestions such as What's ready for pickup, Which repairs are late and How did we do today, with a box to type and a microphone button.",
  },
} as const;

/** Photoreal white-background product pictures from the app's built-in library. */
export const SHELF = [
  { src: "/images/products/phone.webp", label: "Phones", alt: "A smartphone" },
  { src: "/images/products/tablet.webp", label: "Tablets", alt: "A tablet" },
  { src: "/images/products/laptop.webp", label: "Laptops", alt: "A laptop" },
  { src: "/images/products/game-console.webp", label: "Consoles", alt: "A game console with a controller" },
  { src: "/images/products/television.webp", label: "TVs", alt: "A flat-screen television" },
  { src: "/images/products/drone.webp", label: "Drones", alt: "A camera drone" },
  { src: "/images/products/smartwatch.webp", label: "Watches", alt: "A smartwatch" },
  { src: "/images/products/repair-tools.webp", label: "Parts and tools", alt: "Screwdrivers, a suction cup and tweezers" },
] as const;

/** The picture the library suggests for "glass guard". */
export const GLASS_GUARD = {
  src: "/images/products/screen-protector.webp",
  alt: "A tempered glass screen protector",
} as const;
