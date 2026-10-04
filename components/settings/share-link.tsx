"use client";

import * as React from "react";
import { Check, ExternalLink, Link2, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTIONS } from "@/components/ui/icons";

/**
 * A link a shop hands to customers, as buttons instead of a raw address:
 * Copy link, Show QR code, Print sign, Open. The address itself is shown in
 * the QR window (people sometimes need to read it out), never as a monospace
 * box to select by hand.
 */

const BUTTON = "h-12 px-4 text-[15px]";

/** Escapes text for the little HTML document the printed sign is made of. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The printable sign: a big heading, the QR code and one line. Black on white, nothing else. */
export function signHtml({ title, line, qrDataUrl, url }: { title: string; line: string; qrDataUrl: string; url: string }): string {
  const safeQr = qrDataUrl.startsWith("data:image/") ? qrDataUrl : "";
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    `<title>${escapeHtml(title)}</title>`,
    "<style>@page{margin:18mm}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:black;background:white;text-align:center}",
    "h1{font-size:44px;margin:24px 0 8px}p{font-size:22px;margin:8px 0}img{width:340px;height:340px;margin:24px auto;display:block}.url{font-size:16px;color:dimgray;word-break:break-all}</style>",
    "</head><body>",
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(line)}</p>`,
    safeQr ? `<img alt="" src="${escapeHtml(safeQr)}">` : "",
    `<p class="url">${escapeHtml(url)}</p>`,
    "</body></html>",
  ].join("");
}

/** Prints the sign from a hidden frame, so no new window or tab opens. */
function printSign(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) return;
    const cleanUp = () => window.setTimeout(() => frame.remove(), 500);
    view.addEventListener("afterprint", cleanUp, { once: true });
    view.focus();
    view.print();
    // Some browsers never fire afterprint for a frame; tidy up anyway.
    window.setTimeout(() => frame.isConnected && frame.remove(), 60_000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

export function ShareLinkActions({
  url,
  qrDataUrl,
  linkName = "link",
  signTitle,
  signLine,
  fileName,
  showOpen = true,
  className,
}: {
  url: string;
  /** PNG data URL rendered on the server; empty to leave the QR buttons out. */
  qrDataUrl: string;
  /** What the link is called in the button names ("shop link", "check-in link"). */
  linkName?: string;
  signTitle: string;
  signLine: string;
  /** For the downloaded QR picture. */
  fileName: string;
  showOpen?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [qrOpen, setQrOpen] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(`Your ${linkName} is copied. Paste it wherever you need it.`);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy. Open the QR code window to see the link and copy it from there.");
      setQrOpen(true);
    }
  }

  const print = () => printSign(signHtml({ title: signTitle, line: signLine, qrDataUrl, url }));

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button type="button" variant="outline" className={BUTTON} onClick={copy}>
        {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
        {copied ? "Copied" : "Copy link"}
        <span className="sr-only"> ({linkName})</span>
      </Button>
      {qrDataUrl ? (
        <>
          <Button type="button" variant="outline" className={BUTTON} onClick={() => setQrOpen(true)}>
            <QrCode aria-hidden /> Show QR code
          </Button>
          <Button type="button" variant="outline" className={BUTTON} onClick={print}>
            <Printer aria-hidden /> Print sign
          </Button>
        </>
      ) : null}
      {showOpen ? (
        <Button asChild variant="ghost" className={BUTTON}>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden /> Open page
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      ) : null}

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Scan to open your {linkName}</DialogTitle>
            <DialogDescription className="text-[14px]">
              Customers point their phone camera at it. Print it as a sign for the counter or the window.
            </DialogDescription>
          </DialogHeader>
          {qrDataUrl ? (
            // A data URL rendered on the server; next/image cannot optimise one.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={`QR code for your ${linkName}`} className="mx-auto size-64 rounded-xl border border-border bg-white p-2" />
          ) : null}
          <p className="text-center text-[14px] text-muted-foreground [overflow-wrap:anywhere]">
            Or type: <span className="font-medium text-foreground">{url.replace(/^https?:\/\//, "")}</span>
          </p>
          <DialogFooter className="flex-wrap gap-2">
            <Button asChild variant="outline" className={BUTTON}>
              <a href={qrDataUrl} download={fileName}>
                <ACTIONS.download aria-hidden /> Save picture
              </a>
            </Button>
            <Button type="button" className={BUTTON} onClick={print}>
              <Printer aria-hidden /> Print sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
