"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateSlaAction } from "@/app/(app)/settings/sla-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SLA_HOURS, MIN_SLA_HOURS, type SlaHours } from "@/lib/sla";
import { PRIORITIES, PRIORITY_META } from "@/components/tickets/ticket-meta";

/**
 * Response targets: how long each priority may sit before the job counts as
 * late.
 *
 * A new ticket with no due date typed in gets one computed from this, and the
 * SLA job stamps and emails about anything that runs past it. The hours are
 * calendar hours — a customer waiting overnight is still waiting — and the
 * card says so rather than letting anyone assume business hours.
 */
export function SlaCard({ sla }: { sla: SlaHours }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(PRIORITIES.map((p) => [p, String(sla[p])])),
  );
  const [busy, setBusy] = React.useState(false);

  const dirty = PRIORITIES.some((p) => values[p] !== String(sla[p]));

  const invalid = PRIORITIES.some((p) => {
    const hours = Number.parseInt(values[p], 10);
    return !Number.isFinite(hours) || hours < MIN_SLA_HOURS || hours > MAX_SLA_HOURS;
  });

  async function save() {
    setBusy(true);
    const result = await updateSlaAction(
      Object.fromEntries(
        PRIORITIES.map((p) => [p, Number.parseInt(values[p], 10)]),
      ) as Partial<SlaHours>,
    );
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Response targets saved.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Response targets</CardTitle>
        <CardDescription>
          How long a job of each priority may take. A new ticket with no due date
          of its own gets one this far ahead, and anything that runs past it is
          flagged as overdue.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRIORITIES.map((priority) => (
            <div key={priority} className="flex flex-col gap-2">
              <Label htmlFor={`sla-${priority}`}>
                {PRIORITY_META[priority].label}
              </Label>
              <div className="relative">
                <Input
                  id={`sla-${priority}`}
                  type="number"
                  min={MIN_SLA_HOURS}
                  max={MAX_SLA_HOURS}
                  step={1}
                  inputMode="numeric"
                  className="pr-16 tabular-nums"
                  value={values[priority]}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      [priority]: event.target.value,
                    }))
                  }
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-faint-foreground">
                  hours
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Calendar hours, not opening hours — a customer waiting overnight is
          still waiting.
        </p>
      </CardContent>

      <CardFooter className="justify-end gap-3">
        {dirty ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              setValues(
                Object.fromEntries(PRIORITIES.map((p) => [p, String(sla[p])])),
              )
            }
          >
            Discard changes
          </Button>
        ) : null}
        <Button disabled={busy || !dirty || invalid} onClick={save}>
          {busy ? "Saving…" : dirty ? "Save targets" : "Saved"}
        </Button>
      </CardFooter>
    </Card>
  );
}
