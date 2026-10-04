import type { StatusTone } from "@/components/ui/badge";

/**
 * How a settings card says "this one needs you".
 *
 * `Card`'s own `tone` paints a coloured stripe down the left edge. The touch
 * style has no side stripes, so a card that needs attention tints its whole
 * hairline instead, and the status pill in its title still says the word.
 * Only the tones that mean "do something" get a tint; the rest stay quiet so
 * a wall of tinted cards never says nothing.
 *
 * Class names are written out in full so Tailwind can see them.
 */
export function attentionBorder(tone: StatusTone | undefined): string | undefined {
  switch (tone) {
    case "danger":
      return "border-status-overdue/50";
    case "active":
      return "border-status-in-progress/50";
    case "waiting":
      return "border-status-waiting/50";
    default:
      return undefined;
  }
}
