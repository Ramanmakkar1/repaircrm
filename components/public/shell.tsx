import Link from "next/link";
import { Clock, MapPin, Phone } from "lucide-react";

import { RepairPilotMark } from "@/components/brand/repairpilot";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { shopInitials, telHref, type PublicShop } from "@/lib/portal-display";
import { BIG_BUTTON } from "./sizes";

/**
 * The one frame every customer page sits in: the customer portal, the check-in
 * desk and the shop page all introduce the shop the same way (its logo or its
 * initials in a black square, its name, what this page is) and end the same
 * way (call, directions, hours, Privacy and Terms, a small "Powered by").
 *
 * No hooks and no server-only imports, so the check-in desk (a client
 * component) can use it as well as the server-rendered portal.
 */

const WIDTH = {
  md: "max-w-3xl",
  lg: "max-w-5xl",
} as const;

export function PublicShell({
  shop,
  eyebrow,
  homeHref,
  actions,
  children,
  width = "md",
  kiosk = false,
  hideContact = false,
  legalNewTab = false,
}: {
  shop: Pick<PublicShop, "name" | "phone" | "logoUrl" | "address" | "mapUrl" | "hours">;
  /** What this page is, under the shop name: "Your repairs", "Device check-in". */
  eyebrow?: string;
  /** Where the shop name in the header goes. Absent: it is not a link. */
  homeHref?: string;
  /** Right side of the header (Sign out). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  width?: keyof typeof WIDTH;
  /** Counter tablet: nothing that leads off the page, no footer links. */
  kiosk?: boolean;
  /** The page already shows the shop's contact itself. */
  hideContact?: boolean;
  /** Privacy and Terms open in a new tab, so a half-filled form is not lost. */
  legalNewTab?: boolean;
}) {
  const brand = (
    <>
      <ShopMark name={shop.name} logoUrl={shop.logoUrl} />
      <span className="flex min-w-0 flex-col">
        <span className={cn("truncate font-bold leading-tight tracking-tight", kiosk ? "text-xl" : "text-[17px]")}>{shop.name}</span>
        {eyebrow ? <span className="truncate text-[13px] text-muted-foreground">{eyebrow}</span> : null}
      </span>
    </>
  );

  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className={cn("mx-auto flex w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-6", WIDTH[width])}>
          {homeHref && !kiosk ? (
            <Link
              href={homeHref}
              className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {brand}
            </Link>
          ) : (
            <div className="flex min-h-12 min-w-0 items-center gap-3">{brand}</div>
          )}
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      <main className={cn("mx-auto w-full min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8", WIDTH[width])}>{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className={cn("mx-auto flex w-full flex-col gap-5 px-4 py-6 sm:px-6", WIDTH[width])}>
          {kiosk || hideContact ? null : <ShopContact shop={shop} />}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            {kiosk ? null : <LegalLinks newTab={legalNewTab} />}
            <PoweredBy link={!kiosk} />
          </div>
        </div>
      </footer>
    </div>
  );
}

/** The shop's logo on a white canvas, or its initials in a black square. Never a grey shield. */
export function ShopMark({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // A shop logo can live anywhere (an upload, the shop's own site), so a
      // plain img: next/image would need every host allow-listed.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={cn("size-11 shrink-0 rounded-xl border border-border bg-white object-contain p-1", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-[15px] font-bold tracking-tight text-accent-foreground",
        className,
      )}
    >
      {shopInitials(name)}
    </span>
  );
}

/**
 * Call, directions and hours: the three things a customer needs from a shop.
 * Call is outline here because the page above has its own main button; pass
 * `primary` where calling IS the main thing to do.
 */
export function ShopContact({
  shop,
  primary = false,
  title,
  className,
}: {
  shop: Pick<PublicShop, "name" | "phone" | "address" | "mapUrl" | "hours">;
  primary?: boolean;
  /** The heading; null for none (the page has its own). */
  title?: string | null;
  className?: string;
}) {
  if (!shop.phone && !shop.address && shop.hours.length === 0) return null;
  return (
    <section aria-label={`Contact ${shop.name}`} className={cn("flex flex-col gap-3", className)}>
      {title === null ? null : <h2 className="text-base font-semibold">{title ?? `Questions? Talk to ${shop.name}`}</h2>}
      {shop.phone || shop.mapUrl ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {shop.phone ? (
            <Button asChild size="lg" variant={primary ? "default" : "outline"} className={BIG_BUTTON}>
              <a href={telHref(shop.phone)}>
                <Phone aria-hidden />
                Call {shop.phone}
              </a>
            </Button>
          ) : null}
          {shop.mapUrl ? (
            <Button asChild size="lg" variant="outline" className={BIG_BUTTON}>
              <a href={shop.mapUrl} target="_blank" rel="noreferrer">
                <MapPin aria-hidden />
                Directions
                <span className="sr-only"> (opens a map)</span>
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
      {shop.address || shop.hours.length > 0 ? (
        <div className="flex flex-col gap-2 text-[15px] text-muted-foreground sm:flex-row sm:gap-8">
          {shop.address ? (
            <p className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{shop.address}</span>
            </p>
          ) : null}
          {shop.hours.length > 0 ? (
            <div className="flex items-start gap-2">
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <ul aria-label="Opening hours" className="flex min-w-0 flex-col">
                {shop.hours.map((line) => (
                  <li key={line} className="[overflow-wrap:anywhere]">{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Privacy and Terms, as 48px links. Shown wherever a customer gives us personal details. */
export function LegalLinks({ className, newTab = false }: { className?: string; newTab?: boolean }) {
  const tab = newTab ? { target: "_blank", rel: "noreferrer" } : {};
  const link =
    "inline-flex min-h-12 items-center rounded-lg px-1 text-[14px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <nav aria-label="Legal" className={cn("flex items-center gap-4", className)}>
      <Link href="/privacy" className={link} {...tab}>
        Privacy
        {newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
      </Link>
      <Link href="/terms" className={link} {...tab}>
        Terms
        {newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
      </Link>
    </nav>
  );
}

/** "Powered by Repairs helper", small and quiet. A plain line in kiosk mode. */
export function PoweredBy({ link = true }: { link?: boolean }) {
  const inner = (
    <>
      <RepairPilotMark className="size-5" />
      <span>
        Powered by <span className="font-semibold">Repairs helper</span>
      </span>
    </>
  );
  const base = "inline-flex min-h-12 items-center gap-2 text-[13px] text-muted-foreground";
  return link ? (
    <Link
      href="/"
      className={cn(base, "rounded-lg px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {inner}
    </Link>
  ) : (
    <span className={base}>{inner}</span>
  );
}
