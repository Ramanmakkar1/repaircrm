"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  Clock,
  HeartHandshake,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { enableTemplateAction } from "@/app/(app)/marketing/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, IconChip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import {
  CAMPAIGN_TEMPLATES,
  CHANNEL_LABEL,
  TRIGGER_LABEL,
  delayLabel,
  type CampaignTemplate,
} from "./meta";

/**
 * The starter-template gallery.
 *
 * A shop that has never run a campaign does not want a blank form — it wants to
 * see the three follow-ups every repair shop sends, already written, with a
 * button that switches one on. That is the whole pitch of this screen, so on an
 * empty shop the gallery IS the screen ("hero"), and once campaigns exist it
 * collapses to a quiet strip above the list ("row").
 *
 * Icons cannot cross the RSC boundary as values, so templates carry an icon
 * *key* and this component owns the mapping. These three are the templates'
 * own illustrations, not app concepts — everything else here comes from
 * `components/ui/icons.ts`.
 */

const TEMPLATE_ICONS: Record<
  CampaignTemplate["icon"],
  React.ComponentType<{ className?: string }>
> = {
  "shield-check": ShieldCheck,
  "calendar-clock": CalendarClock,
  "heart-handshake": HeartHandshake,
};

function useEnable(onDone?: () => void) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function enable(template: CampaignTemplate) {
    setPendingId(template.id);
    const result = await enableTemplateAction(template.id);
    setPendingId(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${result.name} is live.`, {
      description: `Press "Sync & send due now" to queue the customers who already qualify.`,
      action: {
        label: "Open",
        onClick: () => router.push(`/marketing/${result.id}`),
      },
    });
    onDone?.();
    router.refresh();
  }

  return { enable, pendingId };
}

// ---------------------------------------------------------------------------
// Hero — the empty-shop gallery
// ---------------------------------------------------------------------------

export function TemplateGallery({ enabledNames }: { enabledNames: string[] }) {
  const { enable, pendingId } = useEnable();
  const taken = new Set(enabledNames);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CAMPAIGN_TEMPLATES.map((template) => {
        const Icon = TEMPLATE_ICONS[template.icon];
        const already = taken.has(template.name);
        const busy = pendingId === template.id;

        return (
          <Card key={template.id} interactive className="flex flex-col gap-4 p-5">
            <IconChip icon={Icon} size="lg" />

            <div className="flex flex-col gap-1.5">
              <h3 className="text-lg font-bold leading-snug tracking-tight text-foreground">
                {template.name}
              </h3>
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                {template.pitch}
              </p>
            </div>

            <div className="mt-auto flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip icon={ICONS.automation}>{TRIGGER_LABEL[template.trigger]}</Chip>
                <Chip icon={Clock}>{delayLabel(template.delayDays)}</Chip>
                <Chip icon={template.channel === "SMS" ? ICONS.message : ICONS.email}>
                  {CHANNEL_LABEL[template.channel]}
                </Chip>
              </div>

              <Button
                variant={already ? "outline" : "default"}
                className="w-full"
                disabled={already || busy}
                onClick={() => enable(template)}
              >
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : already ? (
                  <Check />
                ) : (
                  <Sparkles />
                )}
                {already ? "Already added" : "Enable"}
              </Button>
            </div>
          </Card>
        );
      })}

      {/* The escape hatch, deliberately quieter than the three presets. */}
      <Card className="flex flex-col gap-4 border-dashed border-border-strong bg-surface-hover/50 p-5 shadow-none">
        <IconChip
          icon={ACTIONS.add}
          size="lg"
          className="bg-surface text-muted-foreground"
        />
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-bold leading-snug tracking-tight text-foreground">
            Custom campaign
          </h3>
          <p className="text-[14.5px] leading-relaxed text-muted-foreground">
            Your own trigger, timing and words — email or text, written from
            scratch.
          </p>
        </div>
        <Button variant="outline" className="mt-auto w-full" asChild>
          <Link href="/marketing/new">
            <ACTIONS.add /> Start from blank
          </Link>
        </Button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row — the compact strip above an existing list
// ---------------------------------------------------------------------------

export function TemplateRow({ enabledNames }: { enabledNames: string[] }) {
  const { enable, pendingId } = useEnable();
  const taken = new Set(enabledNames);
  const remaining = CAMPAIGN_TEMPLATES.filter((t) => !taken.has(t.name));

  if (remaining.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface-hover/40 px-5 py-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-accent-soft-foreground" />
        <span className="text-[13.5px] font-bold uppercase tracking-wide text-muted-foreground">
          Add from a template
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {remaining.map((template) => {
          const Icon = TEMPLATE_ICONS[template.icon];
          const busy = pendingId === template.id;

          return (
            <button
              key={template.id}
              type="button"
              disabled={busy}
              onClick={() => enable(template)}
              className={cn(
                "rf-lift group flex items-center gap-2.5 rounded-md border border-border bg-surface py-2 pl-2.5 pr-3.5 text-left shadow-xs",
                "hover:border-accent/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                "disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-accent-soft-foreground">
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Icon className="size-4" />
                )}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-bold text-foreground">
                  {template.name}
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  {TRIGGER_LABEL[template.trigger]} · {delayLabel(template.delayDays)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
