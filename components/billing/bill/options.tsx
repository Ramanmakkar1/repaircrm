"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The fields the old form kept under "Due date, tax, and printed notes": the
 * due date (or expiry) and the notes printed for the customer. Controlled by
 * the builder, which posts them as `date` and `notes`; these inputs carry no
 * name of their own. Used in the panel's "More options" and on the Review step,
 * so each caller passes its own idPrefix.
 */
export function OptionFields({
  idPrefix,
  dateLabel,
  dateHint,
  date,
  notes,
  onDate,
  onNotes,
}: {
  idPrefix: string;
  dateLabel: string;
  dateHint: string;
  date: string;
  notes: string;
  onDate: (value: string) => void;
  onNotes: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-date`} className="text-[15px]">{dateLabel}</Label>
        <Input id={`${idPrefix}-date`} type="date" value={date} onChange={(event) => onDate(event.target.value)} className="h-12 text-base" />
        <p className="text-[13px] text-muted-foreground">{dateHint}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-notes`} className="text-[15px]">Notes</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={(event) => onNotes(event.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Shown to the customer on the printed copy."
          className="text-base"
        />
      </div>
    </div>
  );
}
