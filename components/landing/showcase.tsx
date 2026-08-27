import { BrowserFrame, Shot } from "./shot";

/**
 * The proof band, sitting between the detailed rows and the price.
 *
 * The deep dives above show tight crops, so this is deliberately the opposite:
 * two whole windows, at rest, with a sentence under each. Coming after the
 * close-ups it reads as stepping back rather than as repeating them — and it
 * puts an unedited view of the product immediately before the one place the
 * page asks for anything.
 *
 * Both images lazy-load; neither is above the fold on any width.
 */

const SHOT_SIZES = "(max-width: 1023px) 100vw, 560px";

export function Showcase() {
  return (
    <section
      aria-labelledby="showcase-heading"
      className="border-t border-border py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-accent">
            See it working
          </p>
          <h2
            id="showcase-heading"
            className="mt-3 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[44px]"
          >
            Real screens, not a rendering.
          </h2>
          <p className="mt-5 text-[16.5px] leading-relaxed text-muted-foreground">
            Every screenshot on this page is the app itself, running against a
            demo shop&rsquo;s data. Nothing here is a drawing of something we
            plan to build later.
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-8">
          <figure>
            <BrowserFrame url="app.repairflow.com/tickets">
              <Shot
                src="/marketing/tickets.jpg"
                width={1512}
                height={805}
                sizes={SHOT_SIZES}
                alt="The RepairFlow tickets board: filter pills across the top for open jobs and each status, then a grid of ticket cards, each with a coloured status edge, the customer, the device and fault, its tags, who it is assigned to and how many hours it has been open."
              />
            </BrowserFrame>
            <figcaption className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Tickets.</span>{" "}
              Every open job on one board, coloured by status — and filtered
              down to whichever pile you&rsquo;re trying to clear.
            </figcaption>
          </figure>

          <figure>
            <BrowserFrame url="app.repairflow.com/pos">
              <Shot
                src="/marketing/pos.jpg"
                width={1512}
                height={805}
                sizes={SHOT_SIZES}
                alt="The RepairFlow point-of-sale register: a barcode and product search, category filters, a grid of product tiles showing price and stock remaining, and a cart panel on the right with subtotal, sales tax, total and buttons for cash, card, check or other payment."
              />
            </BrowserFrame>
            <figcaption className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">The counter.</span>{" "}
              Scan or tap a product, take cash or card, and sell from the same
              stock your repairs pull their parts from.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
