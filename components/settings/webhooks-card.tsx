"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  createWebhookAction,
  deleteWebhookAction,
  retryWebhookDeliveryAction,
  sendTestWebhookAction,
  setWebhookActiveAction,
} from "@/app/(app)/settings/webhook-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/components/ui/cn";
import {
  DELIVERY_STATUS_META,
  WEBHOOK_EVENT_LABEL,
  WEBHOOK_EVENTS,
  WILDCARD_EVENT,
  asDeliveryStatus,
} from "./webhook-meta";
import type { WebhookDeliveryItem, WebhookItem } from "./types";

/**
 * Settings → API keys → Webhooks.
 *
 * Sits under the API keys card because it is the other half of the same story:
 * a key is how another system reads RepairFlow, a webhook is how RepairFlow
 * tells another system something happened without being asked.
 *
 * The signing secret is shown exactly once, in the dialog that created the
 * endpoint — same rule as an API key, for the same reason: a value that is on
 * screen twice is a value in two people's screenshots.
 */

const WebhookIcon = ICONS.webhook;
const AddIcon = ACTIONS.add;
const SendIcon = ACTIONS.send;
const RetryIcon = ACTIONS.retry;
const DeleteIcon = ACTIONS.delete;
const CopyIcon = ACTIONS.copy;
const SavedIcon = ACTIONS.save;

export function WebhooksCard({
  webhooks,
  deliveries,
}: {
  webhooks: WebhookItem[];
  deliveries: WebhookDeliveryItem[];
}) {
  const [adding, setAdding] = React.useState(false);
  const [minted, setMinted] = React.useState<{ secret: string; url: string } | null>(
    null,
  );

  return (
    <>
      <Card>
        <CardHeader
          icon={WebhookIcon}
          title="Webhooks"
          description="Send an HTTP POST to your own system the moment something happens here — a ticket is created, an invoice is paid."
          action={
            <Button variant="outline" onClick={() => setAdding(true)}>
              <AddIcon aria-hidden /> Add endpoint
            </Button>
          }
        />

        <CardContent className="flex flex-col gap-5 px-0 pb-0">
          {webhooks.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                icon={WebhookIcon}
                title="No endpoints yet"
                hint="Add a URL and pick the events you care about. Deliveries are signed, retried, and listed here."
                action={
                  <Button variant="outline" onClick={() => setAdding(true)}>
                    <AddIcon aria-hidden /> Add endpoint
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th>Endpoint</Th>
                    <Th>Events</Th>
                    <Th className="w-[190px] text-right">Actions</Th>
                  </Tr>
                </THead>
                <TBody>
                  {webhooks.map((hook) => (
                    <WebhookRow key={hook.id} hook={hook} />
                  ))}
                </TBody>
              </Table>
            </div>
          )}

          {webhooks.length > 0 ? (
            <>
              <DeliveriesTable deliveries={deliveries} />
              <VerifyingSignatures />
            </>
          ) : null}
        </CardContent>
      </Card>

      <AddDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(secret, url) => setMinted({ secret, url })}
      />

      <SecretDialog minted={minted} onClose={() => setMinted(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------

function WebhookRow({ hook }: { hook: WebhookItem }) {
  const router = useRouter();
  const [active, setActive] = React.useState(hook.active);
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // Follows the server once router.refresh() brings a new value down. Adjusting
  // during render is React's own recommendation for state that has to track a
  // prop — an effect here would render twice for nothing.
  const [serverValue, setServerValue] = React.useState(hook.active);
  if (serverValue !== hook.active) {
    setServerValue(hook.active);
    setActive(hook.active);
  }

  async function toggle(next: boolean) {
    setActive(next);
    setBusy(true);
    const result = await setWebhookActiveAction(hook.id, next);
    setBusy(false);
    if (!result.ok) {
      setActive(!next);
      toast.error(result.error);
      return;
    }
    toast.success(next ? "Endpoint enabled." : "Endpoint disabled.");
    router.refresh();
  }

  async function test() {
    setBusy(true);
    setTesting(true);
    const result = await sendTestWebhookAction(hook.id);
    setBusy(false);
    setTesting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Test event sent — see the delivery below.");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const result = await deleteWebhookAction(hook.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConfirming(false);
    toast.success("Endpoint deleted.");
    router.refresh();
  }

  const everything = hook.events.includes(WILDCARD_EVENT);

  return (
    <Tr>
      <Td>
        <span
          className={cn(
            "block max-w-[280px] truncate font-mono text-[13px] text-foreground",
            !active && "text-muted-foreground line-through",
          )}
          title={hook.url}
        >
          {hook.url}
        </span>
      </Td>
      <Td>
        <span className="text-[13px] text-muted-foreground">
          {everything
            ? "All events"
            : hook.events.length <= 2
              ? hook.events.join(", ")
              : `${hook.events.length} events`}
        </span>
      </Td>
      <Td className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={test}
          >
            {testing ? <Loader2 className="animate-spin" /> : <SendIcon aria-hidden />}
            {testing ? "Sending…" : "Test"}
          </Button>
          <Switch
            checked={active}
            disabled={busy}
            onCheckedChange={toggle}
            aria-label={`${active ? "Disable" : "Enable"} ${hook.url}`}
          />
          {/*
            Icon-only because it repeats on every row — so it carries both an
            aria-label and a tooltip, and it asks before it fires: an endpoint
            is somebody's integration, and there is no undo.
          */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Delete ${hook.url}`}
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="rounded-sm p-1.5 text-faint-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              >
                <DeleteIcon className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Delete endpoint</TooltipContent>
          </Tooltip>
        </div>
      </Td>

      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirming(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this endpoint?</DialogTitle>
            <DialogDescription>
              RepairFlow will stop posting events to{" "}
              <span className="break-all font-mono text-foreground">
                {hook.url}
              </span>
              . Its signing secret is destroyed with it, so re-adding the URL
              means re-configuring the receiving end.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={remove}>
              {busy ? <Loader2 className="animate-spin" /> : <DeleteIcon aria-hidden />}
              {busy ? "Deleting…" : "Delete endpoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tr>
  );
}

// ---------------------------------------------------------------------------

function DeliveriesTable({ deliveries }: { deliveries: WebhookDeliveryItem[] }) {
  if (deliveries.length === 0) {
    return (
      <div className="px-6 pb-6">
        <EmptyState
          icon={SendIcon}
          title="No deliveries yet"
          hint="Nothing has been posted to your endpoints. Press Test on one of them to send a signed ping and it will appear here."
          className="rounded-lg border border-dashed border-border py-10"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Recent deliveries
      </h3>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <Tr>
              <Th>Event</Th>
              <Th>Status</Th>
              <Th>Attempts</Th>
              <Th>When</Th>
              <Th className="w-[100px] text-right" />
            </Tr>
          </THead>
          <TBody>
            {deliveries.map((delivery) => (
              <DeliveryRow key={delivery.id} delivery={delivery} />
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

function DeliveryRow({ delivery }: { delivery: WebhookDeliveryItem }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const status = DELIVERY_STATUS_META[asDeliveryStatus(delivery.status)];

  async function retry() {
    setBusy(true);
    const result = await retryWebhookDeliveryAction(delivery.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Delivery retried.");
    router.refresh();
  }

  return (
    <Tr>
      <Td>
        <code className="font-mono text-[12.5px] text-foreground">
          {delivery.event}
        </code>
      </Td>
      <Td>
        <span className="flex items-center gap-2">
          {/* The HTTP code rides inside the pill: it is the same fact. */}
          <StatusPill
            size="sm"
            tone={status.tone}
            label={
              delivery.responseCode
                ? `${status.label} · ${delivery.responseCode}`
                : status.label
            }
          />
          {delivery.lastError ? (
            <span
              className="max-w-[200px] truncate text-[12px] text-muted-foreground"
              title={delivery.lastError}
            >
              {delivery.lastError}
            </span>
          ) : null}
        </span>
      </Td>
      <Td className="tabular-nums text-muted-foreground">{delivery.attempts}</Td>
      <Td className="text-muted-foreground">
        {formatWhen(delivery.lastAttemptAt ?? delivery.createdAt)}
      </Td>
      <Td className="text-right">
        {delivery.status === "delivered" ? null : (
          <Button variant="ghost" size="sm" disabled={busy} onClick={retry}>
            {busy ? <Loader2 className="animate-spin" /> : <RetryIcon aria-hidden />}
            {busy ? "Retrying…" : "Retry"}
          </Button>
        )}
      </Td>
    </Tr>
  );
}

// ---------------------------------------------------------------------------

/**
 * The consumer-side snippet.
 *
 * Deliberately shown next to the endpoints rather than buried in docs: the
 * commonest webhook bug is verifying a re-serialised body, and the only cure is
 * putting "use the RAW body" where the person wiring it up will read it.
 */
function VerifyingSignatures() {
  return (
    <div className="flex flex-col gap-3 border-t border-border px-6 py-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Verifying signatures
      </h3>
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        Every request carries{" "}
        <code className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
          X-RepairFlow-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;
        </code>
        . Recompute it over the <strong>raw</strong> request body — parsing and
        re-stringifying the JSON changes the bytes and the digest will not match.
      </p>
      <pre className="overflow-x-auto rounded-md border border-border bg-surface-hover p-4 text-[12.5px] leading-relaxed text-foreground">
        <code>{`import crypto from "node:crypto";

function verify(rawBody, header, secret) {
  const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
  // Reject anything older than five minutes so a captured
  // request cannot be replayed tomorrow.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(v1, "hex"),
    Buffer.from(expected, "hex"),
  );
}`}</code>
      </pre>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Answer <strong>2xx</strong> to acknowledge. Anything else is retried
        after 1m, 5m, 30m, 2h and 12h, then marked failed.{" "}
        <code className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
          X-RepairFlow-Delivery
        </code>{" "}
        is stable across retries — use it to dedupe.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AddDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (secret: string, url: string) => void;
}) {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [everything, setEverything] = React.useState(true);
  const [events, setEvents] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setUrl("");
    setEverything(true);
    setEvents([]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await createWebhookAction(
      url,
      everything ? [WILDCARD_EVENT] : events,
    );
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onCreated(result.secret, result.item.url);
    reset();
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a webhook endpoint</DialogTitle>
          <DialogDescription>
            We will POST a signed JSON body to this URL whenever one of the
            chosen events happens.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input
              id="webhook-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/hooks/repairflow"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-3">
            <Label>Events</Label>

            <label className="flex items-start gap-2.5 text-[14px]">
              <Checkbox
                checked={everything}
                onCheckedChange={(next) => setEverything(next === true)}
                className="mt-0.5"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-foreground">All events</span>
                <span className="text-[13px] text-muted-foreground">
                  Including any added to RepairFlow later.
                </span>
              </span>
            </label>

            {everything ? null : (
              <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-border bg-surface-hover p-3 sm:grid-cols-2">
                {WEBHOOK_EVENTS.map((name) => (
                  <label
                    key={name}
                    className="flex items-center gap-2.5 text-[13.5px]"
                  >
                    <Checkbox
                      checked={events.includes(name)}
                      onCheckedChange={(next) =>
                        setEvents((current) =>
                          next === true
                            ? [...current, name]
                            : current.filter((event) => event !== name),
                        )
                      }
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-foreground">
                        {WEBHOOK_EVENT_LABEL[name] ?? name}
                      </span>
                      <span className="truncate font-mono text-[11.5px] text-faint-foreground">
                        {name}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <AddIcon aria-hidden />}
              {busy ? "Adding…" : "Add endpoint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The one and only time the signing secret is on screen. */
function SecretDialog({
  minted,
  onClose,
}: {
  minted: { secret: string; url: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={minted !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy your signing secret</DialogTitle>
          <DialogDescription>
            {minted ? `${minted.url} is live.` : null} This is the only time the
            secret will be shown.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2.5 rounded-md bg-status-in-progress-bg px-4 py-3 text-[13.5px] text-status-in-progress-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            Your endpoint needs it to verify that a delivery really came from
            RepairFlow. Without the check, anyone who learns your URL can post
            anything to it.
          </p>
        </div>

        {minted ? <CopyableSecret value={minted.secret} /> : null}

        <DialogFooter>
          <Button onClick={onClose}>Done — I&apos;ve copied it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyableSecret({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Secret copied to the clipboard.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the secret and copy it manually.");
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-hover p-2">
      <code className="min-w-0 flex-1 select-all break-all px-2 text-[13px] leading-relaxed text-foreground">
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-label="Copy signing secret"
      >
        {copied ? <SavedIcon aria-hidden /> : <CopyIcon aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatWhen(iso: string): string {
  return WHEN.format(new Date(iso));
}
