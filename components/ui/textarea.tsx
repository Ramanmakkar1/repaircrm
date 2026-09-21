import * as React from "react";
import { cn } from "./cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-20 w-full pointer-coarse:text-base rounded-md border border-border-strong bg-surface px-3 py-2 text-[13.5px] text-foreground placeholder:text-faint-foreground shadow-xs transition-colors outline-none",
        "focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
