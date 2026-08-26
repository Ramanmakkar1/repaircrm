"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { saveCustomerNotesAction } from "@/app/(app)/customers/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Re-sync when the server sends fresh data after a save.
  React.useEffect(() => setValue(initial), [initial]);

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
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5">
          <StickyNote className="size-3.5 text-muted-foreground" />
          Notes
        </CardTitle>
        {dirty ? (
          <div className="flex items-center gap-1.5">
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
          className="resize-y border-transparent bg-transparent px-0 py-0 focus-visible:border-transparent focus-visible:ring-0"
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
