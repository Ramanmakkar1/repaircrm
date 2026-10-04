"use client";

import { Mic, Sparkles } from "lucide-react";
import { OPEN_SHOP_ASSISTANT, type OpenShopAssistantDetail } from "@/components/assistant/assistant-events";
import { cn } from "@/components/ui/cn";

function openAssistant(detail: OpenShopAssistantDetail = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_SHOP_ASSISTANT, { detail }));
}

const PROMPTS = ["Which repairs are late?", "Find iPhone screens", "What is low in stock?"];

/**
 * The assistant, kept small: a place to start talking or typing and three
 * questions people ask every day. It opens the same assistant as the button
 * at the bottom of every screen; it is not the point of this page.
 */
export function AssistantPanel({ className }: { className?: string }) {
  return (
    <section aria-labelledby="assistant-title" className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4", className)}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="assistant-title" className="text-base font-semibold leading-tight">
            Ask Repairs helper
          </h2>
          <p className="text-sm text-muted-foreground">Repairs, stock or customers. Speak or type.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Speak to Repairs helper"
          onClick={() => openAssistant({ voice: true })}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Mic className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => openAssistant()}
          className="h-12 min-w-0 flex-1 rounded-xl border border-border px-3 text-left text-[15px] text-muted-foreground hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Type or speak…
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {PROMPTS.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => openAssistant({ prompt })}
              className="min-h-11 rounded-xl border border-border px-3 text-left text-sm font-medium hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
