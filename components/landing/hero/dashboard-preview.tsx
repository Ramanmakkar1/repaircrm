import Image from "next/image";
import { SHOTS } from "../media";

/** Real app imagery, with fictional demo records rather than invented controls. */
export function DashboardPreview() {
  return (
    <figure className="site-counter-preview mx-auto px-4 sm:px-6">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[13px] font-medium text-(--site-muted)">
        <span>Your counter, ready for the day</span>
        <span>Actual app · Demo shop data</span>
      </figcaption>
      <div className="site-preview-screen">
        <picture>
          <source media="(max-width: 639px)" srcSet={SHOTS.homePhone.src} />
          <Image src={SHOTS.home.src} alt={SHOTS.home.alt} width={2048} height={1536} unoptimized priority className="h-full w-full object-cover object-top" />
        </picture>
      </div>
    </figure>
  );
}
