"use client";

import * as React from "react";
import JsBarcode from "jsbarcode";

/**
 * Renders a Code128 barcode of the document number into an inline SVG.
 *
 * SVG (rather than canvas) so the printed output is vector — a canvas barcode
 * prints at screen resolution and scanners struggle with it. Drawing happens in
 * an effect because JsBarcode mutates a live DOM node.
 */
export function Barcode({
  value,
  height = 44,
  width = 1.6,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
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
        margin: 0,
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
  }, [value, height, width]);

  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />;
}
