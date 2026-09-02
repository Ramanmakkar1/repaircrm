"use client";

import * as React from "react";
import { ScanButton } from "@/components/scan/scan-button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseSerialList } from "@/lib/serials";

/**
 * A list of serial numbers, typed, pasted or scanned.
 *
 * ---------------------------------------------------------------------------
 * ONE SOURCE OF TRUTH
 * ---------------------------------------------------------------------------
 * The textarea IS the value — it is what the form posts, and it is what
 * `parseSerialList` reads. The chips underneath are a VIEW of that same text,
 * so pasting a packing slip and scanning the box one unit at a time produce
 * exactly the same result, and removing a chip removes its line. Nothing is
 * held in a second piece of state that could drift out of step with the field
 * the server actually receives.
 *
 * Scanning runs in continuous mode, because a box of twenty handsets is twenty
 * scans and nobody wants to reopen a camera twenty times. The duplicate guard
 * in the scanner stops one label being read twice as it sits in frame; the
 * de-duplication in `parseSerialList` stops the same unit being counted twice
 * however it arrived.
 */
export function SerialScanField({
  id,
  name,
  label = "Serial numbers — one per line",
  value,
  onChange,
  rows = 5,
  autoFocus,
  invalid,
  hint,
}: {
  id: string;
  /** Form field name. The textarea is what gets posted. */
  name: string;
  label?: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  autoFocus?: boolean;
  invalid?: boolean;
  /** The caller's own count line, rendered under the chips. */
  hint?: React.ReactNode;
}) {
  const serials = parseSerialList(value);

  /** Appends one scanned serial, unless the list already has it. */
  const add = (serial: string): string => {
    const clean = serial.trim();
    if (!clean) return "Nothing to add";
    if (serials.includes(clean)) return `${clean} is already on the list`;
    onChange(value.trim() === "" ? clean : `${value.replace(/\s+$/, "")}\n${clean}`);
    return `Added ${clean}`;
  };

  /** Drops one serial, by rewriting the text without its line. */
  const remove = (serial: string) => {
    onChange(serials.filter((row) => row !== serial).join("\n"));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <ScanButton
          continuous
          size="sm"
          showLabel
          label="Scan"
          title="Scan serial numbers"
          description="Scan each unit in turn — they stack up on the list."
          onScan={(hit) => add(hit.value)}
        />
      </div>

      <Textarea
        id={id}
        name={name}
        rows={rows}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={"SN-0001\nSN-0002"}
        className="font-mono text-[13px]"
        aria-invalid={invalid}
      />

      {serials.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {serials.map((serial) => (
            <li key={serial}>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-surface-hover py-1 pl-3 pr-1.5",
                  "font-mono text-[12.5px] font-semibold text-foreground",
                )}
              >
                {serial}
                <button
                  type="button"
                  onClick={() => remove(serial)}
                  aria-label={`Remove ${serial}`}
                  className="flex size-5 items-center justify-center rounded-full text-faint-foreground transition-colors hover:bg-destructive-soft hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <ACTIONS.cancel className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {hint}
    </div>
  );
}
