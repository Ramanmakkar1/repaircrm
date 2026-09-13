import { cn } from "@/components/ui/cn";

/** A compact R-and-route mark: the leg of the R points the work forward. */
export function RepairPilotMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-xs",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-[68%]" fill="none">
        <path
          d="M9 6h6a5 5 0 0 1 0 10H9V6Zm0 10v10m0-10 13 10m-5 0h5v-5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Shared wordmark: one spelling and weight treatment across every surface. */
export function RepairPilotWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("tracking-tight", className)}>
      <span className="font-medium">Repair</span>
      <span className="font-bold">Pilot</span>
    </span>
  );
}
