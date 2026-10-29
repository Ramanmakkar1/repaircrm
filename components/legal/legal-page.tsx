import { PublicSite } from "@/components/public/public-site";

/** Privacy and Terms: a readable column inside the public site's header and footer. */
export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <PublicSite>
      <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16 sm:px-8 sm:pt-16 sm:pb-24">
        <p className="text-sm font-semibold text-(--site-accent-ink)">{eyebrow}</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-[-0.045em] sm:text-5xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-(--site-muted) sm:text-lg sm:leading-8">{intro}</p>

        <article className="mt-12 space-y-10 text-[15px] leading-7 text-(--site-muted) [overflow-wrap:anywhere] [&_a]:font-semibold [&_a]:text-(--site-accent-ink) [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-(--site-ink) [&_li]:pl-1 [&_p+p]:mt-3 [&_strong]:text-(--site-ink) [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
          {children}
        </article>
      </div>
    </PublicSite>
  );
}
