/**
 * Semicircle gauge drawn as 40 tick marks (SVG, not an image).
 *
 * The ticks sweep a 180 degree arc from angle PI to 2 PI around (100, 100),
 * each running from radius (R - 10) out to R = 80. The first
 * `round(value / 100 * 40)` ticks use `color`, the rest are light grey.
 */

export const GAUGE_TICKS = 40;
export const GAUGE_RADIUS = 80;
const CENTER = 100;
const TICK_LENGTH = 10;
export const GAUGE_INACTIVE = "#d4d4d8";

/** How many of the 40 ticks are lit for a 0-100 value. */
export function activeTickCount(value: number, ticks = GAUGE_TICKS): number {
  const clamped = Math.min(100, Math.max(0, value));
  return Math.round((clamped / 100) * ticks);
}

/** Line endpoints of tick `i` (0 is the far left of the arc, 39 the far right). */
export function gaugeTick(i: number, ticks = GAUGE_TICKS) {
  const angle = Math.PI + (i / (ticks - 1)) * Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    x1: round(CENTER + (GAUGE_RADIUS - TICK_LENGTH) * cos),
    y1: round(CENTER + (GAUGE_RADIUS - TICK_LENGTH) * sin),
    x2: round(CENTER + GAUGE_RADIUS * cos),
    y2: round(CENTER + GAUGE_RADIUS * sin),
  };
}

export function Gauge({
  value,
  color = "var(--site-accent, #ef4d23)",
  showLabels = false,
  min,
  max,
}: {
  /** 0-100. Also printed in the middle as "{value}%". */
  value: number;
  /** Colour of the lit ticks. Defaults to the site accent (one CSS variable). */
  color?: string;
  /** Show `min` and `max` under the ends of the arc. */
  showLabels?: boolean;
  min?: string | number;
  max?: string | number;
}) {
  const active = activeTickCount(value);
  return (
    <div className="mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 120" className="block w-full" aria-hidden="true" focusable="false">
        {Array.from({ length: GAUGE_TICKS }, (_, i) => {
          const on = i < active;
          const t = gaugeTick(i);
          return (
            <line
              key={i}
              data-tick=""
              data-active={on ? "true" : "false"}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{ stroke: on ? color : GAUGE_INACTIVE }}
            />
          );
        })}
        <text x={100} y={105} textAnchor="middle" fontSize={22} fontWeight={600} fill="#0b0f1a">
          {value}%
        </text>
      </svg>
      {showLabels ? (
        <div className="flex justify-between text-[11px] text-neutral-500">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      ) : null}
    </div>
  );
}
