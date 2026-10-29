import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";

import { DarkCta } from "@/components/landing/ui";
import { cn } from "@/components/ui/cn";
import type { Crumb, Faq } from "@/lib/seo/schema";

/** Content column width shared by every marketing section. */
const WRAP = "mx-auto w-full max-w-[1184px] px-5 sm:px-8";

/** Visible breadcrumb trail; the BreadcrumbList JSON-LD mirrors it. */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const items = [{ name: "Home", path: "/" }, ...trail];
  return (
    <nav aria-label="Breadcrumb" className="text-[13px] text-neutral-600">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="text-neutral-900">
                  {item.name}
                </span>
              ) : (
                <>
                  <Link href={item.path} className="hover:text-neutral-900 hover:underline">
                    {item.name}
                  </Link>
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The top of a page: breadcrumbs, the page's single h1 and its lede. */
export function PageHero({
  trail,
  eyebrow,
  title,
  lede,
  children,
}: {
  trail: Crumb[];
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={cn(WRAP, "pb-12 pt-8 sm:pb-16 sm:pt-12")} aria-labelledby="page-title">
      <Breadcrumbs trail={trail} />
      <p className="mt-8 text-[13px] font-semibold text-(--site-accent-ink)">{eyebrow}</p>
      <h1
        id="page-title"
        className="mt-3 max-w-[22ch] text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-[1.08] tracking-[-0.045em] text-neutral-900 [text-wrap:balance]"
      >
        {title}
      </h1>
      <div className="site-lede mt-6 max-w-[62ch]">{lede}</div>
      {children ? <div className="mt-8 flex flex-wrap items-center gap-3">{children}</div> : null}
    </section>
  );
}

/** Primary and secondary calls to action used under a hero. */
export function HeroActions({ secondary }: { secondary?: { href: string; label: string } }) {
  return (
    <>
      <DarkCta href="/signup">Start free</DarkCta>
      {secondary ? (
        <Link href={secondary.href} className="site-text-link">
          {secondary.label} <ArrowRight size={17} aria-hidden="true" />
        </Link>
      ) : null}
      <p className="w-full text-[13px] text-neutral-600">Free during early access. No credit card.</p>
    </>
  );
}

/** A content band. Alternate `tray` and white to keep the home page rhythm. */
export function Band({
  id,
  title,
  intro,
  tone = "white",
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  tone?: "white" | "tray";
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("py-14 sm:py-20", tone === "tray" ? "bg-(--site-tray)" : "bg-white")}
    >
      <div className={WRAP}>
        <h2 id={`${id}-title`} className="site-h2 max-w-[24ch]">
          {title}
        </h2>
        {intro ? <div className="site-lede mt-4 max-w-[64ch]">{intro}</div> : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** Two-column list of titled points, each a real thing the product does. */
export function PointGrid({ points }: { points: readonly { title: string; body: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      {points.map((point) => (
        <div key={point.title} className="border-t border-neutral-200 pt-5">
          <dt className="text-[17px] font-semibold tracking-tight text-neutral-900">{point.title}</dt>
          <dd className="mt-2 text-[15px] leading-relaxed text-neutral-700">{point.body}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Numbered workflow steps. */
export function Steps({ steps }: { steps: readonly { title: string; body: ReactNode }[] }) {
  return (
    <ol className="grid gap-6 md:grid-cols-2">
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-4 rounded-2xl bg-white p-5 sm:p-6">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--site-tray) text-[15px] font-semibold text-(--site-accent-ink)"
          >
            {i + 1}
          </span>
          <div>
            <h3 className="text-[17px] font-semibold tracking-tight text-neutral-900">{step.title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-700">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export type ShotData = { src: string; alt: string };

/**
 * A screenshot from the running app (fictional demo shop data), with a
 * caption saying what it shows. Phone captures are tall, so they get a
 * narrower frame.
 */
export function Shot({
  shot,
  caption,
  phone = false,
  priority = false,
}: {
  shot: ShotData;
  caption: string;
  phone?: boolean;
  priority?: boolean;
}) {
  return (
    <figure className={cn("w-full", phone ? "mx-auto max-w-[300px]" : "max-w-[880px]")}>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <Image
          src={shot.src}
          alt={shot.alt}
          width={phone ? 1170 : 2048}
          height={phone ? 2532 : 1536}
          sizes={phone ? "300px" : "(min-width: 960px) 880px, 100vw"}
          priority={priority}
          className="h-auto w-full"
        />
      </div>
      <figcaption className="mt-3 text-[13px] leading-relaxed text-neutral-600">{caption}</figcaption>
    </figure>
  );
}

/** A plain note for setup requirements and honest limits. */
export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <p className="text-[15px] font-semibold text-neutral-900">{title}</p>
      <div className="mt-2 text-[15px] leading-relaxed text-neutral-700">{children}</div>
    </aside>
  );
}

/** Visible FAQ. Pair it with faqSchema(faqs) only on the same page. */
export function FaqSection({ faqs, title = "Common questions" }: { faqs: readonly Faq[]; title?: string }) {
  return (
    <section aria-labelledby="faq-title" className="bg-(--site-tray) py-14 sm:py-20">
      <div className={cn(WRAP, "grid gap-10 lg:grid-cols-12 lg:gap-14")}>
        <h2 id="faq-title" className="site-h2 lg:col-span-4">
          {title}
        </h2>
        <div className="space-y-2 lg:col-span-8">
          {faqs.map((faq, i) => (
            <details key={faq.q} open={i === 0} className="group rounded-2xl bg-white px-5 sm:px-6">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 py-4 text-[17px] font-medium tracking-tight text-neutral-900 [&::-webkit-details-marker]:hidden">
                <h3 className="min-w-0 flex-1 text-[17px] font-medium">{faq.q}</h3>
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--site-tray) text-neutral-900 transition-transform group-open:rotate-45"
                >
                  <Plus className="h-4 w-4" />
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-[15px] leading-relaxed text-neutral-700">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export type RelatedLink = { href: string; title: string; body: string };

/** Descriptive internal links to neighbouring pages. */
export function Related({ links, title = "Keep reading" }: { links: readonly RelatedLink[]; title?: string }) {
  return (
    <section aria-labelledby="related-title" className="bg-white py-14 sm:py-20">
      <div className={WRAP}>
        <h2 id="related-title" className="site-h2">
          {title}
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group flex h-full flex-col rounded-2xl border border-neutral-200 p-5 transition-colors hover:border-neutral-400"
              >
                <span className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-neutral-900">
                  {link.title}
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-2 text-[15px] leading-relaxed text-neutral-700">{link.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Closing call to action. */
export function ClosingCta({ title, body }: { title: string; body: string }) {
  return (
    <section aria-labelledby="closing-title" className="bg-(--site-tray) py-16 text-center sm:py-24">
      <div className={WRAP}>
        <h2 id="closing-title" className="site-h2 mx-auto max-w-3xl">
          {title}
        </h2>
        <p className="site-lede mx-auto mt-5 max-w-xl">{body}</p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <DarkCta href="/signup">Create your shop</DarkCta>
          <p className="text-[13px] text-neutral-600">Free during early access · No credit card</p>
        </div>
      </div>
    </section>
  );
}

export { WRAP };
