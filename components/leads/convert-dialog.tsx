"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Mail, Phone, Sparkles, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";

import { convertLeadAction } from "@/app/(app)/leads/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "./lead-form";
import type { LeadMatch } from "./lead-state";

const CREATE = "__create__";

/**
 * The conversion dialog — where an enquiry stops being a note and becomes real
 * records.
 *
 * The matching step is the reason this is a dialog and not a button. Half of a
 * repair shop's "new" leads are people who were already customers last year,
 * and silently creating a duplicate Customer for them splits their history
 * across two rows forever. So possible matches are shown FIRST, with the reason
 * they matched, and "create a new customer" is one more option in the same list
 * rather than the default path.
 */
export function ConvertLeadDialog({
  leadId,
  open,
  onOpenChange,
  matches,
  problemTypes,
  defaultSubject,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: LeadMatch[];
  problemTypes: string[];
  defaultSubject: string;
}) {
  const router = useRouter();

  // A match, when we found one, is the safer default — creating a duplicate is
  // the expensive mistake, and linking the wrong one is visible immediately.
  const [choice, setChoice] = React.useState(() => matches[0]?.id ?? CREATE);
  const [createTicket, setCreateTicket] = React.useState(true);
  const [subject, setSubject] = React.useState(defaultSubject);
  const [problemType, setProblemType] = React.useState(problemTypes[0] ?? "Other");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData();
    formData.set("mode", choice === CREATE ? "create" : "link");
    if (choice !== CREATE) formData.set("customerId", choice);
    if (createTicket) {
      formData.set("createTicket", "on");
      formData.set("ticketSubject", subject);
      formData.set("ticketProblemType", problemType);
    }

    setBusy(true);
    const result = await convertLeadAction(leadId, formData);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(
      result.ticketId ? "Lead converted — ticket opened." : "Lead converted.",
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Convert this lead</DialogTitle>
          <DialogDescription>
            {matches.length > 0
              ? "This enquiry looks like someone you already have on file. Link it, or start a fresh account."
              : "Nobody on file matches this enquiry, so a new customer will be created."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>Customer</Label>
            <div className="flex flex-col gap-2">
              {matches.map((match) => (
                <ChoiceRow
                  key={match.id}
                  selected={choice === match.id}
                  onSelect={() => setChoice(match.id)}
                  icon={UserRound}
                  title={match.name}
                  meta={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {match.email ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="size-3.5" />
                          {match.email}
                        </span>
                      ) : null}
                      {match.phone ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="size-3.5" />
                          {match.phone}
                        </span>
                      ) : null}
                    </span>
                  }
                  badge={match.on === "email" ? "Same email" : "Same phone"}
                />
              ))}

              <ChoiceRow
                selected={choice === CREATE}
                onSelect={() => setChoice(CREATE)}
                icon={UserPlus}
                title="Create a new customer"
                meta={
                  <span>Built from this lead&rsquo;s name, email and phone.</span>
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-hover/60 p-4">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={createTicket}
                onCheckedChange={(next) => setCreateTicket(next === true)}
                className="mt-0.5"
              />
              <span className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">
                  Open a ticket now
                </span>
                <span className="text-[13px] text-muted-foreground">
                  Numbered from the shop&rsquo;s ticket sequence, same as any
                  walk-in.
                </span>
              </span>
            </label>

            {createTicket ? (
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <Field label="Subject" htmlFor="ticketSubject" required>
                  <Input
                    id="ticketSubject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={200}
                    required
                  />
                </Field>
                <Field label="Problem type" htmlFor="ticketProblemType">
                  <Select value={problemType} onValueChange={setProblemType}>
                    <SelectTrigger id="ticketProblemType">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {problemTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              <Sparkles />
              {busy ? "Converting…" : "Convert lead"}
              <ArrowRight />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function ChoiceRow({
  selected,
  onSelect,
  icon: Icon,
  title,
  meta,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: React.ReactNode;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border p-3.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-accent bg-accent-soft/60 shadow-xs"
          : "border-border-strong bg-surface hover:bg-surface-hover",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
          selected
            ? "bg-accent text-accent-foreground"
            : "bg-surface-hover text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {title}
          </span>
          {badge ? (
            <span className="shrink-0 rounded-full bg-chip-accent-bg px-2 py-0.5 text-[11.5px] font-semibold text-chip-accent-fg">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="text-[13px] text-muted-foreground">{meta}</span>
      </span>
    </button>
  );
}
