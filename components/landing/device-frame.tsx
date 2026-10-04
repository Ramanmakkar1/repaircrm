import Image from "next/image";

import { cn } from "@/components/ui/cn";

/**
 * Simple rounded device frames around real screenshots of the app.
 *
 * The screenshots are captured at 1024x768 @2x (tablet) and 390x844 @3x
 * (phone) and stored as WebP at that real pixel size, so they are served as-is
 * (`unoptimized`): re-encoding them through the image optimiser at its default
 * quality would soften the text, and the files are already 80-130 KB.
 *
 * The screen area has a fixed aspect ratio and the image is `cover` + top
 * aligned, so a re-captured screenshot with a slightly different height still
 * fits the frame. width/height are the capture size (they reserve the space and
 * give the browser the ratio); CSS makes the image fill the screen area.
 */

type FrameProps = {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

export function TabletFrame({ src, alt, className, sizes = "(min-width: 1024px) 760px, 92vw", priority }: FrameProps) {
  return (
    <div
      className={cn(
        "rounded-[1.4rem] bg-[#0b0f1a] p-2 shadow-[0_30px_70px_-30px_rgba(11,15,26,0.5)] sm:rounded-[2rem] sm:p-3",
        className,
      )}
    >
      <div className="aspect-[4/3] overflow-hidden rounded-[0.9rem] bg-white sm:rounded-[1.35rem]">
        <Image
          src={src}
          alt={alt}
          width={2048}
          height={1536}
          sizes={sizes}
          unoptimized
          priority={priority}
          className="h-full w-full object-cover object-top"
        />
      </div>
    </div>
  );
}

export function PhoneFrame({ src, alt, className, sizes = "(min-width: 1024px) 280px, 46vw", priority }: FrameProps) {
  return (
    <div
      className={cn(
        "rounded-[1.7rem] bg-[#0b0f1a] p-1.5 shadow-[0_30px_70px_-30px_rgba(11,15,26,0.5)] sm:rounded-[2.3rem] sm:p-2",
        className,
      )}
    >
      <div className="aspect-[390/844] overflow-hidden rounded-[1.3rem] bg-white sm:rounded-[1.9rem]">
        <Image
          src={src}
          alt={alt}
          width={1170}
          height={2532}
          sizes={sizes}
          unoptimized
          priority={priority}
          className="h-full w-full object-cover object-top"
        />
      </div>
    </div>
  );
}

/**
 * A tablet with a phone overlapping one bottom corner: the same app on two
 * screens. `side` is the side the phone sits on.
 */
export function DeviceDuo({
  tablet,
  phone,
  side = "left",
  className,
}: {
  tablet: { src: string; alt: string };
  phone: { src: string; alt: string };
  side?: "left" | "right";
  className?: string;
}) {
  const left = side === "left";
  return (
    <div className={cn("relative pb-10 sm:pb-14", left ? "pl-[13%]" : "pr-[13%]", className)}>
      <TabletFrame src={tablet.src} alt={tablet.alt} />
      <PhoneFrame
        src={phone.src}
        alt={phone.alt}
        className={cn("absolute bottom-0 w-[27%] max-w-[190px]", left ? "left-0" : "right-0")}
      />
    </div>
  );
}
