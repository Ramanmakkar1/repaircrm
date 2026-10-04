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
  easy = false,
  startWithRepair = true,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: LeadMatch[];
  problemTypes: string[];
  defaultSubject: string;
  /** Easy mode: plain words ("Start a repair"), big targets, and on success it opens the new repair. */
  easy?: boolean;
  /** Whether "open a repair" starts ticked. */
  startWithRepair?: boolean;
}) {
  const router = useRouter();

  // A match, when we found one, is the safer default — creating a duplicate is
  // the expensive mistake, and linking the wrong one is visible immediately.
  const [choice, setChoice] = React.useState(() => matches[0]?.id ?? CREATE);
  const [createTicket, setCreateTicket] = React.useState(startWithRepair);
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

    if (easy) {
      toast.success(result.ticketId ? "Repair started." : "Saved as a customer.");
      onOpenChange(false);
      // The next thing to do is on the repair itself: go there.
      if (result.ticketId) router.push(`/tickets/${result.ticketId}`);
      else router.refresh();
      return;
    }

    toast.success(
      result.ticketId ? "Lead converted — ticket opened." : "Lead converted.",
    );
    onOpenChange(false);
    router.refresh();
  }

  const words = easy
    ? {
        title: createTicket ? "Start a repair" : "Save as a customer",
        description:
          matches.length > 0
            ? "They look like someone you already have. Pick them, or make a new customer."
            : "Nobody on file matches, so they become a new customer.",
        customer: "Who is it?",
        create: "New customer",
        createMeta: "Made from this enquiry's name, phone and email.",
        ticket: "Start the repair now",
        ticketMeta: "Numbered like any walk-in. You can add the device on the repair.",
        subject: "What's wrong",
        problem: "Kind of repair",
        submit: createTicket ? "Start the repair" : "Save customer",
        busy: "Saving…",
      }
    : {
        title: "Convert this lead",
        description:
          matches.length > 0
            ? "This enquiry looks like someone you already have on file. Link it, or start a fresh account."
            : "Nobody on file matches this enquiry, so a new customer will be created.",
        customer: "Customer",
        create: "Create a new customer",
        createMeta: "Built from this lead\u2019s name, email and phone.",
        ticket: "Open a ticket now",
        ticketMeta: "Numbered from the shop\u2019s ticket sequence, same as any walk-in.",
        subject: "Subject",
        problem: "Problem type",
        submit: "Convert lead",
        busy: "Converting…",
      };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className={easy ? "text-xl" : undefined}>{words.title}</DialogTitle>
          <DialogDescription>{words.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>{words.customer}</Label>
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
                  big={easy}
                />
              ))}

              <ChoiceRow
                selected={choice === CREATE}
                onSelect={() => setChoice(CREATE)}
                icon={UserPlus}
                title={words.create}
                meta={<span>{words.createMeta}</span>}
                big={easy}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-hover/60 p-4">
            <label className={cn("flex items-start gap-3", easy && "min-h-12 items-center")}>
              <Checkbox
                checked={createTicket}
                onCheckedChange={(next) => setCreateTicket(next === true)}
                className={cn("mt-0.5", easy && "mt-0 size-6")}
              />
              <span className="flex flex-col gap-1">
                <span className={cn("font-semibold text-foreground", easy ? "text-base" : "text-sm")}>
                  {words.ticket}
                </span>
                <span className="text-[13px] text-muted-foreground">{words.ticketMeta}</span>
              </span>
            </label>

            {createTicket ? (
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <Field label={words.subject} htmlFor="ticketSubject" required>
                  <Input
                    id="ticketSubject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={200}
                    required
                    className={easy ? "h-12 text-base" : undefined}
                  />
                </Field>
                <Field label={words.problem} htmlFor="ticketProblemType">
                  <Select value={problemType} onValueChange={setProblemType}>
                    <SelectTrigger id="ticketProblemType" className={easy ? "h-12 text-base" : undefined}>
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
              className={easy ? "h-12 px-5 text-base" : undefined}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className={easy ? "h-12 px-6 text-base" : undefined}>
              {easy ? null : <Sparkles />}
              {busy ? words.busy : words.submit}
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
  big = false,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: React.ReactNode;
  badge?: string;
  /** Easy mode: a 56px+ row with rounder corners. */
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 border p-3.5 text-left transition-colors",
        big ? "min-h-16 rounded-xl" : "rounded-md",
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
