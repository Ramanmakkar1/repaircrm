"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/cn";
import {
  channelBlockedReason,
  smsSegments,
  type SendChannel,
  type SendDocument,
  type SendPreview,
  type SendPreviewState,
  type SendRequest,
  type SendResultState,
} from "./send-types";

/**
 * THE SEND DIALOG — one component for invoices and estimates.
 *
 * ---------------------------------------------------------------------------
 * WHAT STAFF ARE ACTUALLY DOING HERE
 * ---------------------------------------------------------------------------
 * "Mark sent" was a lie with a button on it: it flipped a status and fired one
 * fixed email nobody ever saw. This replaces it with the thing a front desk
 * actually needs — pick the channels, write a line, READ WHAT THE CUSTOMER WILL
 * READ, send.
 *
 *   · The preview is rendered by the server from the REAL templates (see
 *     lib/comms/documents.ts). It is not a lookalike: the HTML in the frame is
 *     byte-for-byte what the provider is handed.
 *
 *   · A channel that cannot be used says so, in words, next to itself. Opted
 *     out is stated plainly rather than hidden — staff are entitled to know the
 *     customer asked not to be texted, and a greyed box with no reason is how
 *     a shop ends up phoning support.
 *
 *   · Resending is the same button reading "Send again", with the last send
 *     underneath it. Nothing about a resend touches money or status.
 */
export function SendDocumentDialog({
  doc,
  previewAction,
  sendAction,
  size,
}: {
  doc: SendDocument;
  previewAction: (input: SendRequest) => Promise<SendPreviewState>;
  sendAction: (input: SendRequest) => Promise<SendResultState>;
  /** Detail-page action rows run at `sm`; everywhere else keeps the default. */
  size?: ButtonProps["size"];
}) {
  const router = useRouter();

  const emailBlocked = channelBlockedReason("EMAIL", doc);
  const smsBlocked = channelBlockedReason("SMS", doc);
  const nothingAvailable = Boolean(emailBlocked) && Boolean(smsBlocked);

  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState(doc.defaultSubject);
  const [message, setMessage] = React.useState(doc.defaultMessage);
  const [emailTo, setEmailTo] = React.useState("");
  const [channels, setChannels] = React.useState({ email: true, sms: false });
  const [pane, setPane] = React.useState<SendChannel>("EMAIL");
  const [plainText, setPlainText] = React.useState(false);
  const [preview, setPreview] = React.useState<SendPreview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  /** Opens the dialog with the channels a menu item asked for. */
  function openWith(next: { email: boolean; sms: boolean }) {
    setSubject(doc.defaultSubject);
    setMessage(doc.defaultMessage);
    setEmailTo("");
    setChannels({
      email: next.email && !emailBlocked,
      sms: next.sms && !smsBlocked,
    });
    setPane(next.email && !emailBlocked ? "EMAIL" : "SMS");
    setPlainText(false);
    setOpen(true);
  }

  /**
   * Refreshes the preview from the server, debounced while staff type.
   *
   * A sequence number guards against the out-of-order responses a fast typist
   * produces — the preview must show the LATEST text, not whichever request
   * happened to come back last.
   */
  const requestId = React.useRef(0);
  React.useEffect(() => {
    if (!open) return;

    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      // Flagged after the debounce, not before it: a spinner that blinks on
      // every keystroke reads as jank rather than as progress.
      setLoadingPreview(true);
      const result = await previewAction({
        id: doc.id,
        subject,
        message,
        email: true,
        sms: true,
      });
      if (id !== requestId.current) return;

      setLoadingPreview(false);
      if (result.ok) {
        setPreview(result.preview);
        setPreviewError(null);
      } else {
        setPreview(null);
        setPreviewError(result.error);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [open, subject, message, doc.id, previewAction]);

  async function submit() {
    setSending(true);
    const result = await sendAction({
      id: doc.id,
      subject,
      message,
      email: channels.email,
      sms: channels.sms,
      emailTo,
    });
    setSending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    // One toast per channel, saying exactly what happened to it. A send where
    // the email went and the SMS was skipped is TWO different facts, and
    // collapsing them into "Sent!" is how a customer never gets told.
    for (const outcome of result.outcomes) {
      if (outcome.ok) toast.success(outcome.message);
      else toast.warning(outcome.message);
    }
    if (result.statusChanged) {
      toast.success(`${doc.label} is now marked sent.`);
    }

    setOpen(false);
    router.refresh();
  }

  const selectedCount = Number(channels.email) + Number(channels.sms);
  const smsLength = preview?.smsText.length ?? 0;

  return (
    <>
      {/* ------------------------------------------------------- trigger */}
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-stretch">
          <Button
            size={size}
            className="rounded-r-none"
            onClick={() =>
              openWith({ email: !emailBlocked, sms: Boolean(emailBlocked) })
            }
          >
            <ACTIONS.send />
            {doc.alreadySent ? "Send again" : "Send"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size={size}
                className="rounded-l-none border-l border-accent-foreground/25 px-2"
                aria-label="More send options"
              >
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Send {doc.label}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={Boolean(emailBlocked)}
                title={emailBlocked ?? undefined}
                onSelect={() => openWith({ email: true, sms: false })}
              >
                <ICONS.email className="size-4 text-muted-foreground" />
                Send by email
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={Boolean(smsBlocked)}
                title={smsBlocked ?? undefined}
                onSelect={() => openWith({ email: false, sms: true })}
              >
                <ICONS.message className="size-4 text-muted-foreground" />
                Send by SMS
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={Boolean(emailBlocked) || Boolean(smsBlocked)}
                title={emailBlocked ?? smsBlocked ?? undefined}
                onSelect={() => openWith({ email: true, sms: true })}
              >
                <ACTIONS.send className="size-4 text-muted-foreground" />
                Send both
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* The history hint. Absent rather than "Never sent" — an empty line
            says the same thing without spending a row on it. */}
        {doc.lastSentHint ? (
          <span className="pl-0.5 text-[12px] leading-none text-muted-foreground">
            {doc.lastSentHint}
          </span>
        ) : null}
      </div>

      {/* -------------------------------------------------------- dialog */}
      <Dialog open={open} onOpenChange={(next) => !sending && setOpen(next)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send {doc.label}</DialogTitle>
            <DialogDescription>
              To {doc.customerName}. You are looking at exactly what they will
              receive.
            </DialogDescription>
          </DialogHeader>

          {nothingAvailable ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                There is no way to reach {doc.customerName} — {emailBlocked}{" "}
                {smsBlocked} Add contact details or turn their opt-ins back on
                from the customer page.
              </span>
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            {/* ------------------------------------------------- compose */}
            <div className="flex flex-col gap-4">
              <ChannelRow
                icon={ICONS.email}
                label="Email"
                address={doc.email}
                checked={channels.email}
                blocked={emailBlocked}
                onChange={(value) =>
                  setChannels((c) => ({ ...c, email: value }))
                }
              />

              {channels.email ? (
                <div className="flex flex-col gap-2 pl-8">
                  <Label htmlFor="send-email-to">Send to a different address</Label>
                  <Input
                    id="send-email-to"
                    value={emailTo}
                    onChange={(event) => setEmailTo(event.target.value)}
                    placeholder={doc.email ?? "name@example.com"}
                    inputMode="email"
                  />
                  <p className="text-[12.5px] text-muted-foreground">
                    Leave blank to use the address on the customer record.
                  </p>
                </div>
              ) : null}

              <ChannelRow
                icon={ICONS.message}
                label="SMS"
                address={doc.mobile}
                checked={channels.sms}
                blocked={smsBlocked}
                onChange={(value) => setChannels((c) => ({ ...c, sms: value }))}
              />

              <div className="flex flex-col gap-2">
                <Label htmlFor="send-subject">Subject</Label>
                <Input
                  id="send-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  disabled={!channels.email}
                />
                {!channels.email ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    An SMS has no subject line.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="send-message">Message</Label>
                <Textarea
                  id="send-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  className="min-h-24"
                />
                <p className="text-[12.5px] text-muted-foreground">
                  Sits above the document summary. The totals and the link are
                  added for you.
                </p>
              </div>
            </div>

            {/* ------------------------------------------------- preview */}
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Preview
                </span>
                <div className="flex items-center gap-1.5">
                  {loadingPreview ? (
                    <Loader2 className="size-3.5 animate-spin text-faint-foreground" />
                  ) : null}
                  <PaneToggle
                    value={pane}
                    onChange={setPane}
                    showSms={channels.sms || !channels.email}
                    showEmail={channels.email || !channels.sms}
                  />
                </div>
              </div>

              {previewError ? (
                <p className="rounded-md border border-destructive/40 bg-destructive-soft px-3 py-2 text-[13.5px] font-medium text-destructive">
                  {previewError}
                </p>
              ) : null}

              {pane === "EMAIL" ? (
                <EmailPreview
                  preview={preview}
                  plainText={plainText}
                  onTogglePlainText={() => setPlainText((v) => !v)}
                />
              ) : (
                <SmsPreview text={preview?.smsText ?? null} length={smsLength} />
              )}

              {preview ? (
                <p className="flex items-start gap-1.5 break-all text-[12px] leading-snug text-muted-foreground">
                  <ACTIONS.copyLink className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {preview.linkUrl}
                    <span className="block text-faint-foreground">
                      Opens straight into their portal — no sign-in needed.
                    </span>
                  </span>
                </p>
              ) : null}

              {preview?.payOnline ? (
                <p className="flex items-center gap-1.5 rounded-md bg-chip-accent-bg px-3 py-2 text-[12.5px] font-medium text-chip-accent-fg">
                  <ACTIONS.pay className="size-3.5 shrink-0" />
                  Includes a card payment button for the outstanding balance.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={sending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={sending || selectedCount === 0}
              title={
                selectedCount === 0
                  ? "Tick email or SMS to send this."
                  : undefined
              }
            >
              {sending ? <Loader2 className="animate-spin" /> : <ACTIONS.send />}
              {sending
                ? "Sending…"
                : selectedCount === 2
                  ? "Send email + SMS"
                  : channels.sms
                    ? "Send SMS"
                    : "Send email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ChannelRow({
  icon: Icon,
  label,
  address,
  checked,
  blocked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  address: string | null;
  checked: boolean;
  blocked: string | null;
  onChange: (value: boolean) => void;
}) {
  const id = `send-channel-${label.toLowerCase()}`;
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        disabled={Boolean(blocked)}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <Label
          htmlFor={id}
          className={cn(
            "flex items-center gap-2",
            blocked && "text-muted-foreground",
          )}
        >
          <Icon className="size-4 text-muted-foreground" />
          {label}
        </Label>
        {/* The address is a chip so it reads as a destination, not a caption. */}
        {address ? (
          <span className="w-fit truncate rounded-md bg-surface-hover px-2 py-0.5 text-[12.5px] font-medium text-foreground">
            {address}
          </span>
        ) : null}
        {blocked ? (
          <span className="text-[12.5px] leading-snug text-status-overdue-fg">
            {blocked}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PaneToggle({
  value,
  onChange,
  showEmail,
  showSms,
}: {
  value: SendChannel;
  onChange: (value: SendChannel) => void;
  showEmail: boolean;
  showSms: boolean;
}) {
  const options: { key: SendChannel; label: string; visible: boolean }[] = [
    { key: "EMAIL", label: "Email", visible: showEmail },
    { key: "SMS", label: "SMS", visible: showSms },
  ];
  const visible = options.filter((option) => option.visible);
  if (visible.length < 2) return null;

  return (
    <div className="flex items-center gap-0.5 rounded-md bg-surface-hover p-0.5">
      {visible.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
            value === option.key
              ? "bg-surface text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EmailPreview({
  preview,
  plainText,
  onTogglePlainText,
}: {
  preview: SendPreview | null;
  plainText: boolean;
  onTogglePlainText: () => void;
}) {
  if (!preview) return <PreviewSkeleton />;

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-t-lg border border-b-0 border-border bg-surface-hover px-3 py-2">
        <p className="truncate text-[13px] font-semibold text-foreground">
          {preview.subject}
        </p>
      </div>

      {plainText ? (
        <pre className="-mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-b-lg border border-border bg-surface p-3 font-mono text-[12px] leading-relaxed text-muted-foreground">
          {preview.emailText}
        </pre>
      ) : (
        /* Sandboxed with no allowances at all: the frame renders the markup and
           can do nothing else — no script, no navigation, no form posts. */
        <iframe
          title="Email preview"
          srcDoc={preview.emailHtml}
          sandbox=""
          className="-mt-2 h-[300px] w-full rounded-b-lg border border-border bg-white"
        />
      )}

      <button
        type="button"
        onClick={onTogglePlainText}
        className="w-fit text-[12px] font-semibold text-accent hover:underline"
      >
        {plainText ? "Show the formatted email" : "Show the plain-text version"}
      </button>
    </div>
  );
}

function SmsPreview({ text, length }: { text: string | null; length: number }) {
  if (!text) return <PreviewSkeleton />;

  const segments = smsSegments(length);
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border border-border bg-surface-hover p-3">
        <p className="w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-accent px-3.5 py-2.5 text-[13.5px] leading-relaxed text-accent-foreground">
          {text}
        </p>
      </div>
      {/* Segments, not just characters: past 160 the carrier bills twice, and
          that is a number a shop owner has an opinion about. */}
      <p className="text-[12px] text-muted-foreground">
        {length} characters · {segments} {segments === 1 ? "segment" : "segments"}
        {segments > 1 ? " — this will be billed as multiple messages." : ""}
      </p>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-border text-[13px] text-faint-foreground">
      Rendering preview…
    </div>
  );
}
