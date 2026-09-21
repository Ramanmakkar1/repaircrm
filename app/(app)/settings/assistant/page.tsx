import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { aiDriverName, aiEnabled, sttDriverName, sttEnabled } from "@/lib/ai/config";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Assistant setup · RepairPilot" };

export default async function AssistantSetupPage() {
  const { role } = await requireUser();
  return <div className="mx-auto flex max-w-3xl flex-col gap-5">
    <PageHeader title="Assistant setup" description="Speak or type to work with your shop." />
    <Card><CardContent className="space-y-4 p-5">
      <div><h2 className="font-semibold">AI commands</h2><p>{aiEnabled() ? `Provider selected: ${aiDriverName()}. A successful request confirms the connection.` : "No AI provider is selected."}</p></div>
      <div><h2 className="font-semibold">Voice input</h2><p>{sttEnabled() ? `Cloud transcription selected: ${sttDriverName()}.` : "Uses your browser's speech recognition where supported. Typing is always available."}</p></div>
      <p className="text-sm text-muted-foreground">Press the microphone, speak, and review the transcript before sending. Shop commands can change products and stock; product removal requires confirmation.</p>
      {role === "OWNER" ? <div className="space-y-3 border-t pt-4 text-sm">
        <h2 className="font-semibold">Connect your provider</h2>
        <p>Your server administrator selects the provider and stores its key privately. Keys are never entered into customer forms or returned to this page.</p>
        <p>Text: set <code>AI_DRIVER</code>, the provider&apos;s API key, and optionally <code>AI_MODEL</code>. Supported drivers: anthropic, openai, groq, glm, deepseek, openrouter, custom, or ollama.</p>
        <p>Cloud voice: set <code>STT_DRIVER</code> to openai, groq, or custom and configure that provider&apos;s key. Leave it off to use browser dictation. Requests go to the selected service; its usage charges and data handling apply.</p>
        <p>Changes take effect after updating the deployment environment. No provider is enabled by this screen.</p>
      </div> : <p>Ask your shop owner to finish connecting the assistant.</p>}
    </CardContent></Card>
    <Link className="underline" href="/settings">Back to settings</Link>
  </div>;
}
