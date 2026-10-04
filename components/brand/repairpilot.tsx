import { cn } from "@/components/ui/cn";
import Image from "next/image";

/** Shared husky repair mascot, on a transparent background. */
export function RepairPilotMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
    >
      <Image
        src="/brand/husky-mark-blue.webp"
        alt=""
        fill
        unoptimized
        sizes="64px"
        className="object-contain"
      />
    </span>
  );
}

/** Shared wordmark: one spelling and weight treatment across every surface. */
export function RepairPilotWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("tracking-tight", className)}>
      <span className="font-medium">Repairs </span>
      <span className="font-bold text-[#2563eb]">helper</span>
    </span>
  );
}
