import * as React from "react";
import { cn } from "./cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full pointer-coarse:min-h-11 pointer-coarse:text-base rounded-md border border-border-strong bg-surface px-3 text-[13.5px] text-foreground placeholder:text-faint-foreground shadow-xs transition-colors outline-none",
        // soft 3px indigo halo + a solid accent edge — legible on pure white
        "focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
