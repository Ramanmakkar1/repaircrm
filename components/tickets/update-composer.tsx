"use client";

import * as React from "react";
import { useActionState } from "react";
import { Lock, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/components/ui/cn";
import { DraftReplyControls } from "@/components/ai/draft-reply";
import { postUpdateAction } from "@/app/(app)/tickets/actions";
import { EMPTY_STATE, type ActionState } from "./action-state";
import { CannedManager, type Canned } from "./canned-manager";
import { useSetOptimisticStatus } from "./ticket-status";

/**
 * One card, one submit: change the status AND leave the note explaining why.
 *
 * Splitting those into two controls is how tickets end up with a status history
 * nobody can account for — so here a status move always carries its note, and a
 * note always records the status it was written against.
 */
export function UpdateComposer({
  ticketId,
  currentStatus,
  statuses,
  cannedResponses,
  customerEmail,
  easy = false,
  fixedStatus,
  initialPublic = false,
  autoFocus = false,
  onPosted,
}: {
  ticketId: string;
  currentStatus: string;
  statuses: string[];
  cannedResponses: Canned[];
  customerEmail: string | null;
  /**
   * Easy mode: no card, no status picker (the status row on the repair screen
   * moves the status), a big two-way choice between a private note and a message
   * to the customer, and one big button.
   */
  easy?: boolean;
  /** The status this update moves the repair to; the picker is replaced by it. Used by the status sheet. */
  fixedStatus?: string;
  /** Start as a message to the customer instead of a private note. */
  initialPublic?: boolean;
  /** Put the cursor in the note on arrival (the Add note / Message customer tiles). */
  autoFocus?: boolean;
  /** Called once an update has been posted, so a sheet can close itself. */
  onPosted?: () => void;
}) {
  const [status, setStatus] = React.useState(fixedStatus ?? currentStatus);
  const [isPublic, setIsPublic] = React.useState(initialPublic);
  const [body, setBody] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [cannedValue, setCannedValue] = React.useState("none");

  /*
   * The header badge and the pipeline tracker move the instant this is
   * submitted, rather than a round trip later. The guess is set INSIDE the
   * action — `useActionState` runs it as a transition, and that is what scopes
   * the optimistic value to it: React holds the guess until the action settles
   * (by which point `revalidatePath` has already sent the real status down)
   * and drops it either way, so a refused post rolls the badge back on its own
   * with nothing here to remember to undo.
   */
  const setOptimisticStatus = useSetOptimisticStatus();

  // Clearing the composer belongs to the submit, not to an effect watching state:
  // an effect would also re-fire whenever this component re-rendered for an
  // unrelated reason, and could wipe a note the user had started retyping.
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      // From the FormData, not from the closure: this is the value actually
      // being posted, hidden input and all.
      const submitted = formData.get("status");
      if (typeof submitted === "string" && submitted) setOptimisticStatus(submitted);

      const result = await postUpdateAction(ticketId, previous, formData);
      if (result.ok) {
        setBody("");
        setSubject("");
        setCannedValue("none");
        toast.success("Update posted.");
        onPosted?.();
      }
      return result;
    },
    EMPTY_STATE,
  );

  // Re-sync when a status change lands (or another tab moved the ticket on).
  // React's documented "adjust state during render" pattern — cheaper and more
  // predictable than an effect, which would render once with the stale status.
  const [serverStatus, setServerStatus] = React.useState(currentStatus);
  if (serverStatus !== currentStatus) {
    setServerStatus(currentStatus);
    setStatus(fixedStatus ?? currentStatus);
  }

  function applyCanned(id: string) {
    setCannedValue(id);
    const canned = cannedResponses.find((c) => c.id === id);
    if (!canned) return;
    // Append rather than overwrite — losing half-typed text to a mis-click is
    // the fastest way to make people stop using canned replies.
    setBody((current) =>
      current.trim() ? `${current.trimEnd()}\n\n${canned.body}` : canned.body,
    );
    if (!subject.trim()) setSubject(canned.title);
  }

  const statusChanged = status !== currentStatus;
  // Easy mode and the status sheet move the status somewhere else (the status
  // row), so the picker is not offered a second time next to the note.
  const showStatusPicker = !easy && fixedStatus === undefined;

  const form = (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Switch/Select values live in React state, so they ride along as
          hidden inputs rather than relying on control-specific form wiring. */}
      <input type="hidden" name="isPublic" value={isPublic ? "on" : ""} />
      <input type="hidden" name="status" value={status} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        {showStatusPicker ? (
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <Label htmlFor="composer-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="composer-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
                {/* A legacy status not in the shop's current list must stay
                    selectable, or saving would silently rewrite it. */}
                {statuses.includes(currentStatus) ? null : (
                  <SelectItem value={currentStatus}>{currentStatus}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="composer-canned">Canned response</Label>
            <CannedManager responses={cannedResponses} />
          </div>
          <Select value={cannedValue} onValueChange={applyCanned}>
            <SelectTrigger id="composer-canned">
              <SelectValue placeholder="Insert…" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="none">Insert…</SelectItem>
              {cannedResponses.map((canned) => (
                <SelectItem key={canned.id} value={canned.id}>
                  {canned.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPublic ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="composer-subject">Subject</Label>
          <Input
            id="composer-subject"
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={150}
            placeholder="Update on your repair"
          />
        </div>
      ) : null}

      {/* Sits above the textarea, not beside the submit: a draft is raw
          material for the note, and it has to be obvious it lands in the
          box rather than going anywhere near the customer on its own. */}
      <DraftReplyControls
        ticketId={ticketId}
        hasExistingText={body.trim().length > 0}
        onDraft={setBody}
      />

      <Textarea
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        autoFocus={autoFocus}
        aria-label={isPublic ? "Message to customer" : "Internal note"}
        placeholder={
          isPublic
            ? "What should the customer know?"
            : "What did you find, what did you do?"
        }
      />

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2",
          easy && "flex-col items-stretch sm:flex-row sm:items-center",
        )}
      >
        <p className={cn("text-xs text-muted-foreground", easy && "text-sm")}>
          {isPublic ? (
            customerEmail ? (
              <>
                <Send className="mr-1 inline size-3" />
                Logged to the customer outbox for {customerEmail}
              </>
            ) : (
              <span className="text-status-in-progress-fg">
                This customer has no email on file — it will be recorded but
                not deliverable.
              </span>
            )
          ) : (
            <>
              <Lock className="mr-1 inline size-3" />
              Internal only — the customer never sees this.
            </>
          )}
        </p>
        <Button
          type="submit"
          size={easy ? "lg" : "sm"}
          className={easy ? "h-12 px-6 text-base" : undefined}
          disabled={pending}
        >
          {isPublic ? <ACTIONS.send /> : <ACTIONS.save />}
          {pending
            ? "Posting…"
            : statusChanged
              ? `Update to ${status}`
              : isPublic
                ? "Send update"
                : "Add note"}
        </Button>
      </div>
    </form>
  );

  if (easy) {
    // No card: the repair screen already put this section on its own tab, and a
    // card inside a tab is a box inside a box.
    return (
      <section aria-label="Add an update" className="flex flex-col gap-4">
        <div role="group" aria-label="Who is this for" className="grid grid-cols-2 gap-2">
          <ComposeChoice active={!isPublic} icon={Lock} onClick={() => setIsPublic(false)}>
            Private note
          </ComposeChoice>
          <ComposeChoice active={isPublic} icon={Send} onClick={() => setIsPublic(true)}>
            Message to customer
          </ComposeChoice>
        </div>
        {form}
      </section>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={ICONS.message}
        title="Post an update"
        action={
          <div className="flex items-center gap-2">
            <Label
              htmlFor="isPublic"
              className={cn(
                "text-xs font-medium",
                isPublic ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {isPublic ? "Public update" : "Private note"}
            </Label>
            <Switch
              id="isPublic"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              aria-label="Send this update to the customer"
            />
          </div>
        }
      />

      <CardContent>{form}</CardContent>
    </Card>
  );
}

/** One half of the private-note / message-to-customer choice: big, filled when chosen, and says so with aria-pressed. */
function ComposeChoice({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-[15px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-ring hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </button>
  );
}
