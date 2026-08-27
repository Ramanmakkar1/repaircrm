/**
 * Landing-page icon set.
 *
 * Hand-written inline SVG rather than an icon package: the marketing page must
 * ship with zero external assets, and drawing the six feature marks by hand
 * keeps them on one visual system — 24x24 box, 1.75 stroke, round caps and
 * joins, no fills. They are intentionally lucide-shaped so they sit next to
 * the lucide icons the app itself uses without a seam.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Kanban columns — the ticket board. */
export function BoardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M9 3v18M15 3v18" />
      <path d="M5.75 7.5h1M11.75 7.5h1M17.75 7.5h1" />
    </Svg>
  );
}

/** A document with a signature squiggle — invoices and estimates. */
export function DocumentIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 2.75H7A2 2 0 0 0 5 4.75v14.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.25z" />
      <path d="M14.5 2.75v4.5H19" />
      <path d="M8.5 16.5c1-1.6 1.8-1.6 2.5 0s1.5 1.6 2.5 0" />
      <path d="M8.5 11.5h4" />
    </Svg>
  );
}

/** Barcode — the point of sale and inventory labels. */
export function BarcodeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4H6" />
      <path d="M21 7V5.5A1.5 1.5 0 0 0 19.5 4H18" />
      <path d="M3 17v1.5A1.5 1.5 0 0 0 4.5 20H6" />
      <path d="M21 17v1.5a1.5 1.5 0 0 1-1.5 1.5H18" />
      <path d="M7.5 8v8M11 8v8M14.5 8v8M18 8v8" />
    </Svg>
  );
}

/** A key on a link — the magic-link customer portal. */
export function KeyLinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.25" cy="16.75" r="3.25" />
      <path d="m9.6 14.4 8-8" />
      <path d="m15.5 8.5 2 2" />
      <path d="m17.6 6.4 2 2" />
    </Svg>
  );
}

/** Paper plane — follow-ups that send themselves. */
export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14.5 21.5 10.5 13.5 2.5 9.5z" />
    </Svg>
  );
}

/** Sparkles — AI drafting and reports. */
export function SparkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m10 3 1.85 4.9L16.75 9.75l-4.9 1.85L10 16.5l-1.85-4.9L3.25 9.75l4.9-1.85z" />
      <path d="m17.75 14.5.95 2.3 2.3.95-2.3.95-.95 2.3-.95-2.3-2.3-.95 2.3-.95z" />
    </Svg>
  );
}

/** Chevron used by the FAQ disclosures. */
export function ChevronIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

/** A tick inside a circle — pricing bullets. */
export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.25 12.25 2.5 2.5 5-5.5" />
    </Svg>
  );
}

/** Arrow used on the primary calls to action. */
export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </Svg>
  );
}

/** The wrench that is the RepairFlow mark, matching components/shell/brand.tsx. */
export function WrenchIcon(props: IconProps) {
  return (
    <Svg strokeWidth={2.5} {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Svg>
  );
}
