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
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface-hover">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
