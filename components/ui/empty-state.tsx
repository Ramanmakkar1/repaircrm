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
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {/*
        A 64px indigo block used to sit here. An empty state is the quietest
        moment in the app — there is nothing to look at yet — so it was also
        the most coloured, which is backwards. A muted glyph is enough to say
        which kind of nothing this is.
      */}
      {Icon ? <Icon className="size-6 text-faint-foreground" /> : null}
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </p>
        {hint ? (
          <p className="text-[13.5px] leading-snug text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
