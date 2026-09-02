"use client";

import * as React from "react";
import { Check, Code2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";

/**
 * The copy-paste widget the shop drops onto their own website.
 *
 * It posts with `fetch` rather than a plain form submit for one reason: a bare
 * `<form method="post">` would navigate the visitor away to a page of raw JSON.
 * The endpoint answers 201 and nothing else by design, so the swap-in thank-you
 * has to happen on the shop's own page.
 *
 * The hidden `website` input is the honeypot the endpoint checks. It is off
 * screen rather than `display:none` because some bots skip hidden inputs, and
 * `tabindex="-1"` + `aria-hidden` keep it away from keyboards and screen
 * readers.
 */
export function EmbedSnippet({ shopSlug, endpoint }: { shopSlug: string; endpoint: string }) {
  const [copied, setCopied] = React.useState(false);

  const snippet = buildSnippet(shopSlug, endpoint);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Form snippet copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the code and copy it manually.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={Code2} size="sm" />
          <div className="flex min-w-0 flex-col">
            <CardTitle className="truncate">Put this on your website</CardTitle>
            <p className="text-[13px] text-muted-foreground">
              Every submission lands in this inbox as a new lead.
            </p>
          </div>
        </div>
        <Button size="sm" variant="soft" onClick={copy}>
          {copied ? <Check /> : <ACTIONS.copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <pre className="max-h-80 overflow-auto rounded-b-lg bg-surface-hover/70 px-5 py-4 text-[12.5px] leading-relaxed text-muted-foreground">
          <code>{snippet}</code>
        </pre>
      </CardContent>
    </Card>
  );
}

function buildSnippet(shopSlug: string, endpoint: string): string {
  return `<!-- RepairFlow lead capture -->
<form id="rf-lead-form">
  <input name="name" placeholder="Your name" required />
  <input name="phone" type="tel" placeholder="Phone" />
  <input name="email" type="email" placeholder="Email" />
  <textarea name="message" placeholder="What needs fixing?"></textarea>

  <!-- honeypot: leave this exactly as it is -->
  <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true"
         style="position:absolute;left:-9999px" />

  <button type="submit">Request a quote</button>
  <p id="rf-lead-done" hidden>Thanks — we'll be in touch shortly.</p>
</form>

<script>
document.getElementById('rf-lead-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  var form = event.target;
  var body = Object.fromEntries(new FormData(form).entries());
  body.shop = '${shopSlug}';
  body.source = 'Website';

  var response = await fetch('${endpoint}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (response.ok) {
    form.reset();
    document.getElementById('rf-lead-done').hidden = false;
  } else {
    alert('Sorry, that did not go through. Please call us instead.');
  }
});
</script>`;
}
