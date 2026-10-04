import Image from "next/image";
import Link from "next/link";

import { cn } from "@/components/ui/cn";

export type RestockLink = {
  key: string;
  title: string;
  detail: string;
  href: string;
  photo: string;
  /** A count worth noticing, with its word ("3 running low"): never a bare red dot. */
  alert?: boolean;
  current?: boolean;
};

/**
 * The way from Stock to buying more, one tap from the Stock list: "Running low",
 * "Orders" and "Suppliers" as a row of small picture boxes (the Home tiles'
 * family, shorter, so the shelves stay on the first screen). Owners only, like
 * the purchasing pages they open.
 */
export function RestockRow({ links }: { links: RestockLink[] }) {
  return (
    <nav aria-label="Restock">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {links.map((link) => (
          <li key={link.key}>
            <Link
              href={link.href}
              data-touch-control
              aria-current={link.current ? "page" : undefined}
              className={cn(
                "flex min-h-16 items-center gap-3 rounded-2xl border bg-surface p-2 pr-4 transition-[border-color,transform] duration-150 active:scale-[0.99]",
                "motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                link.current ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
              )}
            >
              <span className="relative block size-12 shrink-0 overflow-hidden rounded-xl bg-white">
                <Image src={link.photo} alt="" fill sizes="48px" className="object-contain p-1" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base font-semibold leading-tight">{link.title}</span>
                <span className={cn("truncate text-[14px] leading-snug", link.alert ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {link.detail}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
