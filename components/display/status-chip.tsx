import { cn } from "@/components/ui/cn";

/** One colored pill in the board header: a status label + its live count. */
export function StatusChip({
  label,
  count,
  bg,
  fg,
  className,
}: {
  label: string;
  count: number;
  bg: string;
  fg: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-3.5 py-2",
        className,
      )}
      style={{ background: bg }}
    >
      <span
        className="text-[13px] font-semibold uppercase tracking-wide"
        style={{ color: fg }}
      >
        {label}
      </span>
      <span
        className="text-base font-bold tabular-nums"
        style={{ color: fg }}
      >
        {count}
      </span>
    </div>
  );
}
