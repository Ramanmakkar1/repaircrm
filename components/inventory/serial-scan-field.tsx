"use client";

import * as React from "react";
import { ScanBarcode } from "lucide-react";

import { ScanButton } from "@/components/scan/scan-button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseSerialList } from "@/lib/serials";
import { serialCountWords } from "./stock-words";

/**
 * A list of serial numbers, scanned one unit at a time or pasted from a packing slip.
 *
 * ---------------------------------------------------------------------------
 * ONE SOURCE OF TRUTH
 * ---------------------------------------------------------------------------
 * The value is newline-separated text, the same text `parseSerialList` reads
 * and the hidden field posts under `name`. The big scan box, the camera, the
 * "Paste a list" box and the chips are all views of that one string, so
 * scanning a box unit by unit and pasting a slip produce exactly the same
 * result, and removing a chip removes its line.
 *
 * The big box is where a barcode gun types (a gun is a keyboard that presses
 * Enter): each Enter adds one serial and never submits the form. The camera
 * button only appears on a device that has a camera, and stays open for the
 * next unit. With `target` set, a counter says "2 of 5 scanned" in words.
 */
export function SerialScanField({
  id,
  name,
  label = "Serial numbers",
  value,
  onChange,
  autoFocus,
  invalid,
  hint,
  target,
}: {
  id: string;
  /** Form field name: a hidden input carries the list. */
  name: string;
  label?: string;
  value: string;
  onChange: (next: string) => void;
  /** Kept for callers that sized the old box; the paste box sizes itself. */
  rows?: number;
  autoFocus?: boolean;
  invalid?: boolean;
  /** The caller's own line under the list. */
  hint?: React.ReactNode;
  /** How many units should be scanned: shows "2 of 5 scanned". */
  target?: number;
}) {
  const serials = parseSerialList(value);
  const [draft, setDraft] = React.useState("");
  const [note, setNote] = React.useState<string | null>(null);

  /** Appends one serial, unless the list already has it. Says what happened. */
  const add = (raw: string): string => {
    const clean = raw.trim();
    if (!clean) return "Nothing to add";
    if (serials.includes(clean)) {
      const message = `${clean} is already on the list`;
      setNote(message);
      return message;
    }
    onChange(value.trim() === "" ? clean : `${value.replace(/\s+$/, "")}\n${clean}`);
    const message = `Added ${clean}`;
    setNote(message);
    return message;
  };

  /** Drops one serial, by rewriting the text without its line. */
  const remove = (serial: string) => {
    onChange(serials.filter((row) => row !== serial).join("\n"));
    setNote(`Removed ${serial}`);
  };

  const counter = target != null ? serialCountWords(serials.length, target) : null;
  const complete = target != null && serials.length === target;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={value} />

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Label htmlFor={id} className="text-base font-semibold">
          {label}
        </Label>
        {counter ? (
          <span
            className={cn(
              "rf-num text-base font-semibold tabular-nums",
              invalid && !complete ? "text-destructive" : complete ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {counter}
          </span>
        ) : null}
      </div>

      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <ScanBarcode aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
          <input
            id={id}
            value={draft}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={invalid || undefined}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              // A gun presses Enter after every code: that adds one unit, it never saves the form.
              event.preventDefault();
              add(draft);
              setDraft("");
            }}
            onBlur={() => {
              // A typed serial left in the box when the person taps away still counts.
              if (draft.trim()) {
                add(draft);
                setDraft("");
              }
            }}
            placeholder="Scan or type a serial, then Enter"
            className={cn(
              "h-14 w-full rounded-xl border bg-surface pl-12 pr-4 font-mono text-base text-foreground outline-none transition-colors",
              "placeholder:font-sans placeholder:text-muted-foreground",
              "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30",
              invalid ? "border-destructive/60" : "border-border-strong",
            )}
          />
        </div>
        <ScanButton
          continuous
          showLabel
          size="lg"
          variant="outline"
          className="h-14 shrink-0 gap-2 rounded-xl px-4"
          labelClassName="hidden sm:inline"
          label="Camera"
          title="Scan serial numbers"
          description="Scan each unit in turn. They stack up on the list."
          onScan={(hit) => add(hit.value)}
        />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {note ?? ""}
      </p>

      {serials.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Scanned serial numbers">
          {serials.map((serial) => (
            <li key={serial}>
              <span className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border bg-surface-hover py-1 pl-3 pr-1 font-mono text-[14px] font-semibold text-foreground">
                {serial}
                <button
                  type="button"
                  onClick={() => remove(serial)}
                  aria-label={`Remove ${serial}`}
                  className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <ACTIONS.cancel className="size-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="group rounded-xl border border-border">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-[15px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          Paste a list instead
        </summary>
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <Label htmlFor={`${id}-paste`} className="text-[14px] text-muted-foreground">
            One serial per line, straight from the packing slip
          </Label>
          <Textarea
            id={`${id}-paste`}
            rows={5}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={"SN-0001\nSN-0002"}
            className="font-mono text-[15px]"
          />
        </div>
      </details>

      {hint}
    </div>
  );
}
