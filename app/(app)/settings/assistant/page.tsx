import { Mic, Sparkles } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { aiDriverName, aiEnabled, sttDriverName, sttEnabled } from "@/lib/ai/config";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTile } from "@/components/settings/status-tile";
import { TechnicalDetails } from "@/components/settings/technical-details";
import { TryAssistant } from "@/components/settings/try-assistant";

export const metadata = { title: "Assistant · Repairs helper" };

const PHRASES = ["What is low on stock?", "Which repairs are ready for pickup?", "Find customer Maria"] as const;

/**
 * The shop assistant, explained for an owner: is it ready (one word), is
 * voice ready (one word), three things to try (one tap each), and the
 * provider instructions folded away for whoever installed Repairs helper.
 *
 * The shell's Back already leads out of here, so the page has no second one.
 */
export default async function AssistantSetupPage() {
  const { role } = await requireUser();
  const ai = aiEnabled();
  const cloudVoice = sttEnabled();
  const owner = role === "OWNER";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader title="Assistant" description="Ask the shop a question by typing or talking. Tap Ask at the bottom of any screen." />

      <StatusTile
        icon={Sparkles}
        title="Questions and commands"
        state={ai ? "Ready" : "Quick answers only"}
        tone={ai ? "success" : "neutral"}
        detail={
          ai
            ? "Ask in your own words: look things up, or tell it to change stock and products (it asks before removing anything)."
            : owner
              ? "Common lookups work now (low stock, today's appointments, find a customer). For questions in your own words, ask your installer to connect an AI service."
              : "Common lookups work now (low stock, today's appointments, find a customer). Your shop owner can switch on the rest."
        }
      />

      <StatusTile
        icon={Mic}
        title="Talking instead of typing"
        state="Ready"
        tone="success"
        detail={
          cloudVoice
            ? "Press the microphone and speak; your words appear for you to check before sending. Works in English, Hindi, Punjabi, Chinese and Filipino."
            : "Press the microphone and speak; this device writes down what you say for you to check before sending. Typing always works too."
        }
      />

      <section aria-labelledby="try-it" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 id="try-it" className="text-lg font-semibold">Try it</h2>
        <TryAssistant phrases={PHRASES} />
      </section>

      {owner ? (
        <TechnicalDetails>
          <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-muted-foreground">
            <p>
              Text questions use {ai ? <>the <strong className="text-foreground">{aiDriverName()}</strong> provider</> : "no AI provider yet"}; quick answers use the shop&apos;s own records and need none.
              Voice uses {cloudVoice ? <>cloud transcription (<strong className="text-foreground">{sttDriverName()}</strong>)</> : "the browser's own speech recognition"}.
            </p>
            <p>
              The provider and its key are set on the server and never typed into this screen. Text: set <code className="font-mono text-foreground">AI_DRIVER</code>, the provider&apos;s API key, and optionally <code className="font-mono text-foreground">AI_MODEL</code>. Supported drivers: anthropic, openai, groq, glm, deepseek, openrouter, custom, or ollama.
            </p>
            <p>
              Cloud voice: set <code className="font-mono text-foreground">STT_DRIVER</code> to openai, groq, or custom and configure that provider&apos;s key. Leave it off to use browser dictation. Requests go to the selected service; its usage charges and data handling apply, and cloud transcription uses the voice allowance even when the lookup needs no AI.
            </p>
            <p>Changes take effect after the server is restarted with the new settings.</p>
          </div>
        </TechnicalDetails>
      ) : null}
    </div>
  );
}
