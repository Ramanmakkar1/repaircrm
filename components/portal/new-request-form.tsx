"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Loader2 } from "lucide-react";

import { ACTIONS } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

const SendIcon = ACTIONS.send;
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPortalTicketAction } from "@/app/portal/tickets/new/actions";

/**
 * The portal's request form. Three questions, big controls, one button — the
 * same voice as the rest of the portal, which is written for someone anxious
 * about their laptop rather than someone reading a manual.
 *
 * Native `<select>` rather than the Radix one: the portal is overwhelmingly
 * opened on a phone, where the OS picker is faster and never traps focus.
 */

const NEW_DEVICE = "new";

export type PortalDevice = { id: string; label: string; type: string };

export function NewRequestForm({
  devices,
  problemTypes,
}: {
  devices: PortalDevice[];
  problemTypes: string[];
}) {
  const router = useRouter();
  const [assetId, setAssetId] = React.useState(
    devices.length > 0 ? devices[0].id : NEW_DEVICE,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ id: string; number: number } | null>(
    null,
  );

  async function submit(formData: FormData) {
    setBusy(true);
    const result = await createPortalTicketAction(formData);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setCreated({ id: result.ticketId, number: result.ticketNumber });
    router.refresh();
  }

  if (created) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm">
        <span className="flex size-14 items-center justify-center rounded-full bg-status-resolved-bg">
          <CheckCircle2 className="size-7 text-status-resolved-fg" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-bold tracking-tight">Request sent</h2>
          <p className="text-[15px] text-muted-foreground">
            It&rsquo;s repair{" "}
            <span className="font-mono font-semibold text-foreground">
              #{created.number}
            </span>
            . You&rsquo;ll see every update on its page.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => router.push(`/portal/tickets/${created.id}`)}
        >
          Open repair #{created.number}
        </Button>
      </div>
    );
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface px-5 py-6 shadow-sm sm:px-6"
    >
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assetId">Which device?</Label>
        <select
          id="assetId"
          name="assetId"
          value={assetId}
          onChange={(event) => setAssetId(event.target.value)}
          className="h-11 w-full rounded-md border border-border-strong bg-surface px-3.5 text-[15px] text-foreground shadow-xs outline-none transition-colors focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20"
        >
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.label}
            </option>
          ))}
          <option value={NEW_DEVICE}>Something else…</option>
        </select>
      </div>

      {assetId === NEW_DEVICE ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deviceType">What is it?</Label>
          <Input
            id="deviceType"
            name="deviceType"
            required
            maxLength={60}
            placeholder="Laptop, phone, tablet…"
            className="h-11 text-[15px]"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="problemType">Type of job</Label>
        <select
          id="problemType"
          name="problemType"
          required
          defaultValue=""
          className="h-11 w-full rounded-md border border-border-strong bg-surface px-3.5 text-[15px] text-foreground shadow-xs outline-none transition-colors focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20"
        >
          <option value="" disabled>
            Choose one…
          </option>
          {problemTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">What&rsquo;s happening?</Label>
        <Textarea
          id="description"
          name="description"
          required
          rows={5}
          maxLength={4000}
          placeholder="It won't charge unless I hold the cable at an angle."
          className="text-[15px]"
        />
        <p className="text-[12.5px] text-muted-foreground">
          When it started, what you&rsquo;ve already tried, anything unusual.
        </p>
      </div>

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <SendIcon aria-hidden />}
        {busy ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
