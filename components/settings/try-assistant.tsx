"use client";

import { MessageSquareText } from "lucide-react";

import { OPEN_SHOP_ASSISTANT, type OpenShopAssistantDetail } from "@/components/assistant/assistant-events";
import { Button } from "@/components/ui/button";

/** Three things to try, each one tap: it opens the assistant with the words already typed. */
export function TryAssistant({ phrases }: { phrases: readonly string[] }) {
  function open(prompt: string) {
    const detail: OpenShopAssistantDetail = { prompt };
    window.dispatchEvent(new CustomEvent(OPEN_SHOP_ASSISTANT, { detail }));
  }
  return (
    <ul className="flex flex-col gap-2">
      {phrases.map((phrase) => (
        <li key={phrase}>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-12 w-full justify-start whitespace-normal px-4 py-2 text-left text-[15px]"
            onClick={() => open(phrase)}
          >
            <MessageSquareText aria-hidden />
            <span>&ldquo;{phrase}&rdquo;</span>
            <span className="ml-auto shrink-0 text-[14px] font-semibold text-muted-foreground">Try it</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
