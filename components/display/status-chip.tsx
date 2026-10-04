import { TONE_CLASS, type StatusTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

/**
 * One count on the board's header: the status in words, its dot, and the
 * number big enough to read across the shop. Theme tokens only (the board
 * draws itself in the dark theme), and the word is always there.
 */
export function StatusChip({
  label,
  count,
  tone,
  className,
}: {
  label: string;
  count: number;
  tone: StatusTone;
  className?: string;
}) {
  const palette = TONE_CLASS[tone];
  return (
    <div className={cn("flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2", className)}>
      <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold leading-tight">
        <span aria-hidden className={cn("size-3 shrink-0 rounded-full", palette.dot)} />
        <span className="min-w-0">{label}</span>
      </span>
      <span className={cn("rf-num rounded-lg px-2 py-0.5 text-2xl font-bold leading-none", count > 0 ? palette.chip : "text-muted-foreground")}>
        {count}
      </span>
    </div>
  );
}
