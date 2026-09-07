import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

/**
 * Tight, toolbar-grade buttons: a 36px default target on a 6px corner.
 *
 * Stripe's own dashboard controls are 32px, but this app is worked on counter
 * tablets and phones in the POS and the workroom, so the default keeps a 36px
 * hit target and `sm` takes the 32px slot. That is still a real tightening —
 * every button in the app was 40px before.
 *
 * Variants and sizes are additive — `soft` and `lg` were added for the card UI,
 * the original four variants and three sizes keep their names and meaning.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /*
         * A solid indigo block on white needs almost no shadow — an xs
         * contact shadow seats it on the page, anything heavier reads cheap.
         */
        /*
         * NOTE: written as an explicit `background-image`, not Tailwind's
         * `bg-gradient-to-b`. In Tailwind v4 that utility wiped the button's
         * `background-color` outright, leaving white text on white — an
         * invisible primary button. Setting only `background-image` cannot
         * touch the fill underneath it.
         *
         * Stripe's primary button is not a flat rectangle of brand colour: it
         * carries a barely-there top-down gradient and a 1px inset highlight
         * along its top edge, so it reads as a raised, pressable object rather
         * than a filled div. At these opacities you cannot point at the effect
         * — you only notice its absence, which is what made the old flat fill
         * look like a prototype.
         */
        default:
          "bg-accent [background-image:linear-gradient(to_bottom,rgb(255_255_255/0.13),rgb(255_255_255/0))] text-accent-foreground shadow-xs ring-1 ring-inset ring-white/15 hover:bg-accent-hover",
        outline:
          "border border-border-strong bg-surface text-foreground shadow-xs hover:bg-surface-hover",
        ghost: "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
        soft: "bg-accent-soft text-accent-soft-foreground hover:brightness-[0.96]",
        destructive:
          "bg-destructive [background-image:linear-gradient(to_bottom,rgb(255_255_255/0.13),rgb(255_255_255/0))] text-destructive-foreground shadow-xs ring-1 ring-inset ring-white/15 hover:bg-destructive-hover",
      },
      size: {
        default: "h-9 px-3.5 text-[13.5px] [&_svg]:size-4",
        sm: "h-8 px-3 text-[13px] [&_svg]:size-[15px]",
        lg: "h-10 px-5 text-sm [&_svg]:size-[18px]",
        icon: "h-9 w-9 shrink-0 [&_svg]:size-[17px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
