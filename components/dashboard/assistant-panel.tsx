"use client";

import Link from "next/link";
import { Mic, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { OPEN_SHOP_ASSISTANT, type OpenShopAssistantDetail } from "@/components/assistant/assistant-events";

function openAssistant(detail: OpenShopAssistantDetail = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_SHOP_ASSISTANT, { detail }));
}

export function AssistantPanel({ overdueCount }: { overdueCount: number }) {
  return (
    <Card className="flex flex-col gap-3 p-5 shadow-none">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5 text-accent-soft-foreground" aria-hidden />Ask Repairs helper</h2>
      <p className="text-xs text-muted-foreground">Ask about repairs, stock or customers.</p>
      <div className="flex items-center gap-3 rounded-lg border border-border p-1.5">
        <button type="button" aria-label="Speak to Repairs helper" onClick={() => openAssistant({ voice: true })} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#006aff] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><Mic className="size-5" aria-hidden /></button>
        <button type="button" onClick={() => openAssistant()} className="h-10 min-w-0 flex-1 rounded-md text-left text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Type or speak…</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => openAssistant({ prompt: "Which repairs are late?" })} className="min-h-8 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Overdue repairs</button>
        <button type="button" onClick={() => openAssistant({ prompt: "Find iPhone screens" })} className="min-h-8 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Find iPhone screens</button>
      </div>
      <Link href="/tickets?due=overdue" className="rounded-md border border-border p-2 text-sm text-accent-soft-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="mb-1 block text-xs text-muted-foreground">From your repair queue</span>
        {overdueCount === 0 ? "All promised dates are on track" : `${overdueCount} repair${overdueCount === 1 ? "" : "s"} need an overdue review →`}
      </Link>
      <p className="text-xs text-muted-foreground">Review your words before sending.</p>
    </Card>
  );
}
