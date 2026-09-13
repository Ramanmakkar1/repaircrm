import { Shot, Panel } from "./shot";

const MOMENTS = [
  {
    src: "/marketing/repair-bench.jpg",
    width: 1600,
    height: 900,
    alt: "A phone ready for service on a clean electronics repair bench.",
    title: "At the workbench",
    copy: "Keep the diagnosis, parts, photos and technician notes with each repair.",
  },
  {
    src: "/marketing/diagnostics.jpg",
    width: 1600,
    height: 1000,
    alt: "A technician carefully diagnosing a smartphone at a well-lit workbench.",
    title: "In the middle of the job",
    copy: "See what's moving, what's blocked and what needs the next update.",
  },
  {
    src: "/marketing/customer-handoff.jpg",
    width: 1600,
    height: 1000,
    alt: "A technician returns a repaired laptop to a customer at the counter.",
    title: "At pickup",
    copy: "Give customers a clear status and a simple path from estimate to handoff.",
  },
] as const;

/**
 * Show the moments RepairPilot supports using original workshop photography.
 * The product preview lives in the hero, where sample UI is clearly labeled.
 */
export function Showcase() {
  return (
    <section
      aria-labelledby="showcase-heading"
      className="border-t border-border py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-accent">
            From intake to pickup
          </p>
          <h2
            id="showcase-heading"
            className="mt-3 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[44px]"
          >
            Every repair has a clear next step.
          </h2>
          <p className="mt-5 text-[16.5px] leading-relaxed text-muted-foreground">
            Bring work orders, parts, invoices and customer updates together so
            the whole shop knows what happens next.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {MOMENTS.map((moment) => (
            <figure key={moment.title} className="min-w-0">
              <Panel>
                <Shot
                  src={moment.src}
                  width={moment.width}
                  height={moment.height}
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 360px"
                  alt={moment.alt}
                />
              </Panel>
              <figcaption className="mt-4">
                <h3 className="text-[15px] font-semibold text-foreground">{moment.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
                  {moment.copy}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
