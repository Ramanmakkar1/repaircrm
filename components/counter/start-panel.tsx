import Link from "next/link";
import Image from "next/image";
import { ShoppingCart, Wrench } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { LinkPending } from "@/components/ui/link-pending";

export type AttentionItem = { href: string; label: string; count: number };

/** The two jobs that happen all day: always on screen, always the biggest things on it. */
export function StartButtons() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
      <Link
        href="/tickets/new"
        className={cn(
          "relative flex min-h-28 flex-col justify-between gap-3 rounded-2xl bg-accent p-4 text-accent-foreground sm:p-5 lg:min-h-24 lg:flex-row lg:items-center lg:justify-start lg:gap-4",
          "transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-foreground/10 lg:size-12">
          <Wrench className="size-6 lg:size-6" aria-hidden />
        </span>
        <span>
          <span className="block text-xl font-semibold">New repair</span>
          <span className="block text-sm opacity-80"><span className="lg:hidden">Check in</span><span className="hidden lg:inline">Check in a device</span></span>
        </span>
        <LinkPending />
      </Link>
      <Link
        href="/pos"
        className={cn(
          "relative flex min-h-28 flex-col justify-between gap-3 rounded-2xl border-2 border-accent bg-surface p-4 sm:p-5 lg:min-h-24 lg:flex-row lg:items-center lg:justify-start lg:gap-4",
          "transition-[background-color,transform] duration-150 hover:bg-surface-hover active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-hover lg:size-12">
          <ShoppingCart className="size-6 lg:size-6" aria-hidden />
        </span>
        <span>
          <span className="block text-xl font-semibold">New sale</span>
          <span className="block text-sm text-muted-foreground"><span className="lg:hidden">Scan or tap</span><span className="hidden lg:inline">Scan or tap items</span></span>
        </span>
        <LinkPending />
      </Link>
    </div>
  );
}

/**
 * Work that needs a person, as counts you can tap. Only non-zero items show,
 * and each carries its number as text, so nothing depends on colour.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  const open = items.filter((item) => item.count > 0);
  return (
    <nav aria-label="Needs you" className="flex flex-col gap-2">
      <h2 className="text-[15px] font-semibold text-muted-foreground">Needs you</h2>
      {open.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">All clear. Nothing is waiting.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-1.5">
          {open.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="relative flex h-full min-h-12 items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium leading-tight transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:text-base"
              >
                <span>{item.label}</span>
                <span className="min-w-8 rounded-full bg-destructive px-2.5 py-0.5 text-center text-sm font-semibold tabular-nums text-destructive-foreground">{item.count}</span>
                <LinkPending />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

/** Settings stays apart from the working tiles, as a quiet row rather than a box. */
export function SettingsLink({ className }: { className?: string }) {
  return (
    <Link
      href="/settings"
      className={cn(
        "relative flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-3 text-base font-semibold lg:min-h-12 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-white">
        <Image src="/images/home/gears.webp" alt="" fill sizes="40px" className="object-contain p-1" />
      </span>
      <span className="flex flex-col leading-tight">
        <span>Settings</span>
        <span className="text-sm font-normal text-muted-foreground">Shop, staff, printing</span>
      </span>
      <LinkPending />
    </Link>
  );
}
