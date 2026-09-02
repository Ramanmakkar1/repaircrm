"use client";

import * as React from "react";
import JsBarcode from "jsbarcode";

/**
 * Renders a Code128 barcode of the document number into an inline SVG.
 *
 * SVG (rather than canvas) so the printed output is vector — a canvas barcode
 * prints at screen resolution and scanners struggle with it. Drawing happens in
 * an effect because JsBarcode mutates a live DOM node.
 *
 * ---------------------------------------------------------------------------
 * THE QUIET ZONE IS NOT DECORATION
 * ---------------------------------------------------------------------------
 * Code 128 requires at least ten narrow-bar widths of blank space on each side;
 * without it a reader has no way to know where the symbol starts, and most
 * refuse to decode at all. This was originally drawn with `margin: 0`, which
 * looked tidier and made the app's own labels unreadable to the camera scanner
 * (components/scan) and to real hardware alike. The default is now derived from
 * the bar width, which is what the specification actually asks for.
 */
export function Barcode({
  value,
  height = 44,
  width = 1.6,
  quietZone,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
  /** Blank margin each side, in px. Defaults to the required 10 bar widths. */
  quietZone?: number;
  className?: string;
}) {
  const ref = React.useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || !value) return;
    try {
      JsBarcode(node, value, {
        format: "CODE128",
        height,
        width,
        margin: quietZone ?? Math.max(10, Math.ceil(width * 10)),
        displayValue: true,
        fontSize: 12,
        font: "ui-monospace, SFMono-Regular, Menlo, monospace",
        textMargin: 2,
        lineColor: "#000000",
        background: "#ffffff",
      });
    } catch {
      // An unencodable value should never blank the whole document.
      node.replaceChildren();
    }
  }, [value, height, width, quietZone]);

  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />;
}
