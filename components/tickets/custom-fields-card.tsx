"use client";

import * as React from "react";
import { useActionState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveCustomFieldsAction } from "@/app/(app)/tickets/actions";
import { EMPTY_STATE, type ActionState } from "./action-state";

type Row = { key: string; value: string };

/**
 * Free-form key/value data on a ticket ("Loaner issued", "Passcode verified").
 *
 * Kept intentionally schemaless for this wave: shops each want a different set
 * and a Settings-defined schema can be layered on later without migrating the
 * data, since it already lives in `Ticket.customFields`.
 */
export function CustomFieldsCard({
  ticketId,
  fields,
}: {
  ticketId: string;
  fields: Record<string, string>;
}) {
  const entries = Object.entries(fields);
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<Row[]>(() =>
    entries.length > 0
      ? entries.map(([key, value]) => ({ key, value }))
      : [{ key: "", value: "" }],
  );

  // Part of the submit, not an effect watching `state` — see the note in
  // update-composer.tsx for why that distinction matters here.
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await saveCustomFieldsAction(ticketId, previous, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Fields saved");
      }
      return result;
    },
    EMPTY_STATE,
  );

  // Re-seed the editor from the server whenever it's reopened, so a cancelled
  // edit doesn't leave stale rows behind.
  function handleOpenChange(next: boolean) {
    if (next) {
      setRows(
        entries.length > 0
          ? entries.map(([key, value]) => ({ key, value }))
          : [{ key: "", value: "" }],
      );
    }
    setOpen(next);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Custom fields</CardTitle>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Pencil className="size-3.5" />
              Edit fields
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Custom fields</DialogTitle>
              <DialogDescription>
                Anything this shop tracks that the standard ticket doesn&apos;t.
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="flex flex-col gap-3">
              {state.error ? (
                <p role="alert" className="text-xs text-destructive">
                  {state.error}
                </p>
              ) : null}

              <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                {rows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      name="fieldKey"
                      value={row.key}
                      placeholder="Field name"
                      aria-label={`Field ${index + 1} name`}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((r, i) =>
                            i === index ? { ...r, key: event.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Input
                      name="fieldValue"
                      value={row.value}
                      placeholder="Value"
                      aria-label={`Field ${index + 1} value`}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((r, i) =>
                            i === index ? { ...r, value: event.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove field ${index + 1}`}
                      className="shrink-0 text-faint-foreground hover:text-destructive"
                      onClick={() =>
                        setRows((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  setRows((current) => [...current, { key: "", value: "" }])
                }
              >
                <Plus className="size-3.5" />
                Add field
              </Button>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Saving…" : "Save fields"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No custom fields set.</p>
        ) : (
          <dl className="flex flex-col divide-y divide-border">
            {entries.map(([key, value]) => (
              <div
                key={key}
                className="flex items-start justify-between gap-3 py-1.5 text-[13px] first:pt-0 last:pb-0"
              >
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="text-right font-medium text-foreground">
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
