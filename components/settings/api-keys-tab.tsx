"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  createApiKeyAction,
  setApiKeyActiveAction,
} from "@/app/(app)/settings/api-key-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { WebhooksCard } from "./webhooks-card";
import type { ApiKeyItem, WebhookDeliveryItem, WebhookItem } from "./types";

/**
 * Settings → API keys.
 *
 * The secret is shown exactly once, in the dialog that created it, and the
 * dialog says so loudly — there is no "reveal" affordance anywhere else
 * because the server only ever stored a hash. Everything after that identifies
 * a key by its `rfk_ab12cd34…` prefix.
 *
 * Revoking deactivates rather than deletes, so `last used` survives as
 * evidence of what a compromised integration was doing.
 */
export function ApiKeysTab({
  keys,
  appUrl,
  webhooks,
  deliveries,
}: {
  keys: ApiKeyItem[];
  appUrl: string;
  webhooks: WebhookItem[];
  deliveries: WebhookDeliveryItem[];
}) {
  const [creating, setCreating] = React.useState(false);
  const [minted, setMinted] = React.useState<{ key: string; name: string } | null>(
    null,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <KeyRound /> Create key
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {keys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No API keys yet"
              hint="Create a key to let another system read your customers, tickets and invoices."
              action={
                <Button variant="outline" onClick={() => setCreating(true)}>
                  Create key
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Key</Th>
                    <Th>Created</Th>
                    <Th>Last used</Th>
                    <Th className="w-[120px] text-right">Active</Th>
                  </Tr>
                </THead>
                <TBody>
                  {keys.map((item) => (
                    <KeyRow key={item.id} item={item} />
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UsageCard appUrl={appUrl} />

      <WebhooksCard webhooks={webhooks} deliveries={deliveries} />

      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(key, name) => setMinted({ key, name })}
      />

      <RevealDialog minted={minted} onClose={() => setMinted(null)} />
    </div>
  );
}

function KeyRow({ item }: { item: ApiKeyItem }) {
  const router = useRouter();
  const [active, setActive] = React.useState(item.active);
  const [busy, setBusy] = React.useState(false);

  // The switch flips optimistically, then follows the server once
  // `router.refresh()` brings a new value down. Adjusting during render (rather
  // than in an effect) is React's own recommendation for "derived state that
  // has to follow a prop" — an effect here would render twice for nothing.
  const [serverValue, setServerValue] = React.useState(item.active);
  if (serverValue !== item.active) {
    setServerValue(item.active);
    setActive(item.active);
  }

  async function toggle(next: boolean) {
    setActive(next);
    setBusy(true);
    const result = await setApiKeyActiveAction(item.id, next);
    setBusy(false);

    if (!result.ok) {
      setActive(!next);
      toast.error(result.error);
      return;
    }
    toast.success(next ? `${item.name} reactivated.` : `${item.name} revoked.`);
    router.refresh();
  }

  return (
    <Tr>
      <Td>
        <span
          className={cn(
            "font-semibold text-foreground",
            !active && "text-muted-foreground line-through",
          )}
        >
          {item.name}
        </span>
      </Td>
      <Td>
        <code className="rounded-xs bg-surface-hover px-2 py-1 text-[12.5px] tabular-nums text-muted-foreground">
          rfk_{item.prefix}…
        </code>
      </Td>
      <Td className="text-muted-foreground">{formatDay(item.createdAt)}</Td>
      <Td className="text-muted-foreground">
        {item.lastUsedAt ? formatDay(item.lastUsedAt) : "Never"}
      </Td>
      <Td className="text-right">
        <div className="flex justify-end">
          <Switch
            checked={active}
            disabled={busy}
            onCheckedChange={toggle}
            aria-label={`${active ? "Revoke" : "Reactivate"} ${item.name}`}
          />
        </div>
      </Td>
    </Tr>
  );
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: string, name: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await createApiKeyAction(name);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onCreated(result.key, result.item.name);
    setName("");
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) {
          setName("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create an API key</DialogTitle>
          <DialogDescription>
            Name it after the system that will use it, so you know what you are
            revoking later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Accounting sync"
              maxLength={60}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setName("");
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The one and only time the plaintext key is on screen. */
function RevealDialog({
  minted,
  onClose,
}: {
  minted: { key: string; name: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={minted !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy your key now</DialogTitle>
          <DialogDescription>
            {minted ? `"${minted.name}" is ready.` : null} This is the only time
            it will be shown — RepairFlow stores a hash, not the key.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2.5 rounded-md bg-status-in-progress-bg px-4 py-3 text-[13.5px] text-status-in-progress-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            Treat it like a password. Anyone holding it can read every customer,
            ticket and invoice in this shop.
          </p>
        </div>

        {minted ? <CopyableKey value={minted.key} /> : null}

        <DialogFooter>
          <Button onClick={onClose}>Done — I&apos;ve copied it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyableKey({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Key copied to the clipboard.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions); the
      // key is selectable on screen, so say so rather than failing silently.
      toast.error("Couldn't copy — select the key and copy it manually.");
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
        aria-label="Copy API key"
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function UsageCard({ appUrl }: { appUrl: string }) {
  const base = appUrl.replace(/\/+$/, "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Using the API</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Send the key as a bearer token. Every response contains only this
          shop&apos;s data, 50 rows per page, and a key acts with owner-level
          access — it can read, create, update and delete.
        </p>

        <pre className="overflow-x-auto rounded-md border border-border bg-surface-hover p-4 text-[12.5px] leading-relaxed text-foreground">
          <code>{`curl ${base}/api/v1/customers \\
  -H "Authorization: Bearer rfk_your_key_here"`}</code>
        </pre>

        <dl className="flex flex-col gap-2 text-[13.5px]">
          <Endpoint method="GET" path="/api/v1/customers?q=nguyen" />
          <Endpoint method="POST · PATCH · DELETE" path="/api/v1/customers" />
          <Endpoint method="GET" path="/api/v1/tickets?status=New" />
          <Endpoint method="POST · PATCH · DELETE" path="/api/v1/tickets" />
          <Endpoint method="GET" path="/api/v1/invoices?status=SENT" />
          <Endpoint method="PATCH · DELETE" path="/api/v1/invoices/{id}" />
          <Endpoint method="GET · POST" path="/api/v1/payments" />
          <Endpoint method="GET · POST · PATCH" path="/api/v1/estimates" />
          <Endpoint method="GET · POST · PATCH" path="/api/v1/products" />
          <Endpoint method="GET · POST · PATCH" path="/api/v1/leads" />
          <Endpoint method="GET · POST · PATCH" path="/api/v1/appointments" />
        </dl>

        <dl className="flex flex-col gap-2 border-t border-border pt-4 text-[13.5px]">
          <Detail term="Paging">
            <code className="font-mono">?page=2</code>, or follow{" "}
            <code className="font-mono">next_cursor</code> with{" "}
            <code className="font-mono">?cursor=…</code> for a stable export.
          </Detail>
          <Detail term="Rate limit">
            600 requests per minute per key. Watch{" "}
            <code className="font-mono">X-RateLimit-Remaining</code>; a 429
            carries <code className="font-mono">Retry-After</code>.
          </Detail>
          <Detail term="Deleting">
            An invoice is <strong>voided</strong>, never removed — a numbered
            document keeps its place in the sequence.
          </Detail>
        </dl>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          The full endpoint list is served as JSON from{" "}
          <a
            href={`${base}/api/v1`}
            className="font-semibold text-accent hover:underline"
          >
            {base}/api/v1
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[132px] shrink-0 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {method}
      </dt>
      <dd className="min-w-0 truncate font-mono text-[13px] text-foreground">
        {path}
      </dd>
    </div>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[132px] shrink-0 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {term}
      </dt>
      <dd className="min-w-0 text-[13px] leading-relaxed text-muted-foreground">
        {children}
      </dd>
    </div>
  );
}

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDay(iso: string): string {
  return DAY.format(new Date(iso));
}
