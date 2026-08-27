import * as React from "react";
import { cn } from "./cn";

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-6 py-16 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="flex size-16 items-center justify-center rounded-xl bg-accent-soft">
          <Icon className="size-7 text-accent-soft-foreground" />
        </div>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-lg font-bold tracking-tight text-foreground">{title}</p>
        {hint ? (
          <p className="text-[14.5px] leading-snug text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
