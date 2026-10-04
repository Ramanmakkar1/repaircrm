import Image from "next/image";
import Link from "next/link";
import { Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OpenSearchButton } from "@/components/search/open-search-button";

export const metadata = { title: "Not found · Repairs helper" };

/**
 * The catch-all inside the signed-in app: an address that matches no screen,
 * or a `notFound()` from a screen that has no not-found of its own. Record
 * pages that can say something more specific (a customer, a product) keep
 * their own file next to the page; this is the floor, not a replacement.
 *
 * The likely cause is a deleted record or a mistyped number, so the first way
 * out is Search; Home is the second. The shell's Back is still above.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-10 text-center sm:py-12">
      <span className="relative block size-32 overflow-hidden rounded-2xl bg-white">
        <Image src="/images/home/customers-cards.webp" alt="" fill sizes="128px" className="object-contain p-3" priority />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[24px] font-semibold tracking-tight">We couldn&rsquo;t find that</h1>
        <p className="text-[16px] leading-snug text-muted-foreground">
          It may have been deleted, or the link is out of date. Search the shop for the name, phone or number.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
        <OpenSearchButton className="min-h-14 px-8 text-[16px]">Search the shop</OpenSearchButton>
        <Button variant="outline" size="lg" asChild className="min-h-14 px-8 text-[16px]">
          <Link href="/counter">
            <Home aria-hidden />
            Go Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
