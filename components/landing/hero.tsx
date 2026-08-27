import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "./icons";
import { ProductMockup } from "./product-mockup";

/**
 * One h1 for the whole document lives here.
 *
 * The headline is set tight (-0.04em, 0.95 leading) and big, because it is the
 * only piece of type on the page allowed to shout. Everything under it drops
 * straight back to the app's 15px body scale.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* backdrop: faint graph paper + a single soft indigo wash, both decorative */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="rf-hero-grid absolute inset-0" />
        <div className="rf-hero-wash absolute inset-0" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-semibold text-muted-foreground shadow-xs">
            <span className="size-1.5 rounded-full bg-status-ready" />
            Early access — free while we build
          </span>

          <h1 className="mt-6 text-[40px] font-bold leading-[0.98] tracking-[-0.04em] text-foreground sm:text-6xl lg:text-[68px]">
            The whole shop
            <br className="hidden sm:block" />{" "}
            <span className="text-accent">on one screen.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-[17px] leading-relaxed text-muted-foreground sm:text-lg">
            RepairFlow is the working system behind the bench: tickets, estimates
            and invoices, a point-of-sale counter with inventory, a customer
            portal, and the follow-ups you keep meaning to send. Phone, computer,
            console, mail-in, on-site IT — one place, from intake to pickup.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/signup">
                Start free
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href="#features">See what&rsquo;s inside</a>
            </Button>
          </div>

          <p className="mt-4 text-[13px] text-faint-foreground">
            No credit card. Creates your shop and signs you in.
          </p>
        </div>

        <div className="rf-rise mt-14 sm:mt-20">
          <ProductMockup />
        </div>
      </div>
    </section>
  );
}
