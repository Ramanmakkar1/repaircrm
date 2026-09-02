"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { saveCustomerNotesAction } from "@/app/(app)/customers/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import { Textarea } from "@/components/ui/textarea";

/**
 * Inline notes. Reads as static text until focused/clicked, then reveals Save
 * and Revert — so the card doesn't shout "form" on a page that is mostly
 * read-only, but is one click from editable.
 */
export function NotesCard({
  customerId,
  notes,
}: {
  customerId: string;
  notes: string | null;
}) {
  const router = useRouter();
  const initial = notes ?? "";
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  // Re-sync when the server sends fresh data after a save. Adjusted during
  // render rather than from an effect, so the card never shows the stale note
  // for a frame after the refresh lands.
  const [lastInitial, setLastInitial] = React.useState(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setValue(initial);
  }

  const dirty = value !== initial;

  async function save() {
    setSaving(true);
    const result = await saveCustomerNotesAction(customerId, value);
    setSaving(false);
    if (result.ok) {
      toast.success("Notes saved.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={StickyNote} size="sm" />
          <CardTitle className="truncate">Notes</CardTitle>
        </div>
        {dirty ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setValue(initial)}
              disabled={saving}
            >
              Revert
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={4}
          disabled={saving}
          aria-label="Customer notes"
          placeholder="Add a note — preferences, access codes, anything the front desk should see."
          className="min-h-28 resize-y rounded-md border-transparent bg-surface-hover px-3.5 py-3 leading-relaxed"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && dirty) {
              event.preventDefault();
              void save();
            }
          }}
        />
      </CardContent>
    </Card>
  );
}
