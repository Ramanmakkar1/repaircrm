"use client";

import * as React from "react";
import { Check, ExternalLink, Inbox, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ACTIONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  connectSplitformsAction,
  resetSplitformsLinkAction,
  saveSplitformsSecretAction,
  type SplitformsActionResult,
} from "@/app/(app)/leads/splitforms-actions";
import { SPLITFORMS_SIGNUP_URL } from "@/lib/splitforms";

/**
 * "Get website leads with Splitforms" — the recommended way to capture leads.
 *
 * Splitforms does the form (spam filtering, uploads, alerts, auto-replies);
 * RepairPilot gets every submission as a lead through one pasted webhook link.
 * Three steps, each one line, because the person doing this is a shop owner
 * with a website builder open in the other tab, not a developer.
 */
export function SplitformsCard({
  isOwner,
  webhookUrl,
  hasSecret,
  lastLeadLabel,
}: {
  isOwner: boolean;
  /** Null until the owner creates the link. */
  webhookUrl: string | null;
  hasSecret: boolean;
  /** "2 hours ago", pre-formatted on the server; null before the first lead. */
  lastLeadLabel: string | null;
}) {
  const [pending, start] = React.useTransition();
  const [copied, setCopied] = React.useState(false);
  const [secret, setSecret] = React.useState("");

  const run = (action: () => Promise<SplitformsActionResult>, after?: () => void) =>
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        after?.();
      } else toast.error(result.error);
    });

  async function copy() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast.success("Link copied — paste it into your Splitforms webhook.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <Card>
      <CardHeader
        icon={Inbox}
        title="Get website leads with Splitforms"
        description="Build your website form on Splitforms — spam filtering, email alerts and auto-replies included — and every enquiry lands here as a lead."
        action={
          lastLeadLabel ? (
            <span className="flex items-center gap-1.5 rounded-md bg-status-resolved-bg px-2.5 py-1 text-[12.5px] font-semibold text-status-resolved-fg">
              <Check className="size-3.5" /> Connected · last lead {lastLeadLabel}
            </span>
          ) : webhookUrl ? (
            <span className="rounded-md bg-status-waiting-bg px-2.5 py-1 text-[12.5px] font-semibold text-status-waiting-fg">
              Waiting for the first lead
            </span>
          ) : null
        }
      />
      <CardContent className="flex flex-col gap-4">
        <ol className="flex flex-col gap-3 text-[14px] leading-relaxed text-foreground">
          <li className="flex gap-3">
            <Step n={1} />
            <span>
              Make your form on Splitforms (free to start).{" "}
              <a
                href={SPLITFORMS_SIGNUP_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
              >
                Open Splitforms <ExternalLink className="size-3.5" />
              </a>
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span>In your Splitforms form, open <b>Webhooks</b> and paste this link:</span>
              {webhookUrl ? (
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-hover px-3 py-2 text-[12.5px] text-muted-foreground">
                    {webhookUrl}
                  </code>
                  <Button size="sm" variant="soft" onClick={copy} className="shrink-0">
                    {copied ? <Check /> : <ACTIONS.copy />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              ) : isOwner ? (
                <Button
                  size="sm"
                  className="w-fit"
                  disabled={pending}
                  onClick={() => run(() => connectSplitformsAction())}
                >
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Create my link
                </Button>
              ) : (
                <span className="text-[13.5px] text-muted-foreground">Ask the shop owner to create the link.</span>
              )}
            </div>
          </li>
          <li className="flex gap-3">
            <Step n={3} />
            <span>Send a test from your website. It shows up in this list within a few seconds.</span>
          </li>
        </ol>

        {webhookUrl && isOwner ? (
          <details className="group rounded-md border border-border px-3.5 py-2.5 text-[13.5px]">
            <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">
              Extra security (optional)
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-muted-foreground">
                Paste the webhook&rsquo;s <b>signing secret</b> from Splitforms and RepairPilot will only accept
                requests Splitforms signed. {hasSecret ? "A secret is saved." : ""}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={hasSecret ? "Paste a new secret, or leave empty to remove" : "Signing secret"}
                  autoComplete="off"
                  className="sm:flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => saveSplitformsSecretAction(secret), () => setSecret(""))}
                >
                  Save
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-fit text-muted-foreground"
                disabled={pending}
                onClick={() => run(() => resetSplitformsLinkAction())}
              >
                <RefreshCw /> Make a new link (the old one stops working)
              </Button>
            </div>
          </details>
        ) : null}

        <p className="text-[12.5px] text-muted-foreground">
          Webhooks are part of Splitforms&rsquo; paid plans.{" "}
          <a href={SPLITFORMS_SIGNUP_URL} target="_blank" rel="noopener" className="underline underline-offset-2">
            Powered by Splitforms
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-foreground">
      {n}
    </span>
  );
}
