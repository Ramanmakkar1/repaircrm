"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
// AlertCircle is an error state, Sparkles is the AI-assisted convert flow,
// PhoneCall has no entry in the shared concept map; the verbs come from ACTIONS.
import { AlertCircle, PhoneCall, Sparkles, UserPlus, Wrench } from "lucide-react";
import { toast } from "sonner";

import {
  closeLeadAction,
  deleteLeadAction,
  markContactedAction,
  reopenLeadAction,
  updateLeadAction,
} from "@/app/(app)/leads/actions";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ConvertLeadDialog } from "./convert-dialog";
import { LeadFields, type LeadFormValues } from "./lead-form";
import { EMPTY_LEAD_STATE, type LeadFormState, type LeadMatch } from "./lead-state";

export type LeadActionsLead = {
  id: string;
  status: string;
  values: LeadFormValues;
};

/**
 * The row of things you can do to a lead, and the three dialogs behind it.
 *
 * Which buttons exist is driven entirely by status: a converted lead has
 * nothing left to do but be read, and a closed one only offers "reopen". That
 * keeps the destructive/irreversible moves off screen except where they make
 * sense.
 *
 * Easy mode (`easy`) says "enquiry" and offers ONE big next step: "Start a
 * repair" (it makes them a customer and opens the repair in one go, then takes
 * you to it). "Mark as called" sits beside it; Edit, Close and Delete wait
 * behind "More".
 */
export function LeadActions({
  lead,
  matches,
  problemTypes,
  defaultSubject,
  canDelete,
  easy = false,
}: {
  lead: LeadActionsLead;
  matches: LeadMatch[];
  problemTypes: string[];
  defaultSubject: string;
  canDelete: boolean;
  easy?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  /** Easy mode's "Save as a customer only" opens the same dialog without a repair. */
  const [withRepair, setWithRepair] = React.useState(true);
  const [deleting, setDeleting] = React.useState(false);
  const noun = easy ? "Enquiry" : "Lead";

  const isOpen = lead.status === "NEW" || lead.status === "CONTACTED";
  const isClosed = lead.status === "CLOSED";
  const isConverted = lead.status === "CONVERTED";

  async function run(
    work: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
    done?: () => void,
  ) {
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(success);
    done?.();
    router.refresh();
  }

  const startConvert = (repair: boolean) => {
    setWithRepair(repair);
    setConverting(true);
  };

  const easyRow = (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
      {isOpen ? (
        <Button size="lg" className="h-14 px-6 text-base [&_svg]:size-5" onClick={() => startConvert(true)} disabled={busy}>
          <Wrench />
          Start a repair
        </Button>
      ) : null}
      {isClosed ? (
        <Button
          size="lg"
          className="h-14 px-6 text-base [&_svg]:size-5"
          disabled={busy}
          onClick={() => run(() => reopenLeadAction(lead.id), "Enquiry reopened.")}
        >
          <ACTIONS.reopen />
          Reopen enquiry
        </Button>
      ) : null}
      <div className="flex gap-2">
        {lead.status === "NEW" ? (
          <Button
            variant="outline"
            className="h-14 flex-1 px-5 text-base [&_svg]:size-5"
            disabled={busy}
            onClick={() => run(() => markContactedAction(lead.id), "Marked as called.")}
          >
            <PhoneCall />
            Mark as called
          </Button>
        ) : null}
        {!isConverted ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-14 flex-1 px-5 text-base [&_svg]:size-5" disabled={busy} aria-label="More for this enquiry">
                <ACTIONS.more />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem className="min-h-12 text-[15px]" onSelect={() => setEditing(true)}>
                <ACTIONS.edit className="size-4 text-muted-foreground" />
                Edit details
              </DropdownMenuItem>
              {isOpen ? (
                <DropdownMenuItem className="min-h-12 text-[15px]" onSelect={() => startConvert(false)}>
                  <UserPlus className="size-4 text-muted-foreground" />
                  Save as a customer only
                </DropdownMenuItem>
              ) : null}
              {isOpen ? (
                <DropdownMenuItem className="min-h-12 text-[15px]" onSelect={() => setClosing(true)}>
                  <ACTIONS.archive className="size-4 text-muted-foreground" />
                  Close enquiry
                </DropdownMenuItem>
              ) : null}
              {canDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="min-h-12 text-[15px] text-destructive focus:bg-destructive-soft"
                    onSelect={(event) => {
                      event.preventDefault();
                      setDeleting(true);
                    }}
                  >
                    <ACTIONS.delete className="size-4" />
                    Delete enquiry
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {easy ? easyRow : null}
      {/* The lead header's action row: `sm` throughout, like every other
          object page. */}
      {easy ? null : (
      <div className="flex flex-wrap items-center gap-2">
        {isOpen ? (
          <>
            <Button size="sm" onClick={() => setConverting(true)} disabled={busy}>
              <Sparkles />
              Convert
            </Button>
            {lead.status === "NEW" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => markContactedAction(lead.id), "Marked as contacted.")
                }
              >
                <PhoneCall />
                Mark contacted
              </Button>
            ) : null}
          </>
        ) : null}

        {!isConverted ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={busy}
          >
            <ACTIONS.edit />
            Edit
          </Button>
        ) : null}

        {isOpen ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setClosing(true)}
            disabled={busy}
          >
            <ACTIONS.archive />
            Close
          </Button>
        ) : null}

        {isClosed ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => run(() => reopenLeadAction(lead.id), "Lead reopened.")}
          >
            <ACTIONS.reopen />
            Reopen
          </Button>
        ) : null}

        {canDelete && !isConverted ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
            onClick={() => setDeleting(true)}
            disabled={busy}
          >
            <ACTIONS.delete />
            Delete
          </Button>
        ) : null}
      </div>
      )}

      <ConvertLeadDialog
        // Remounted per opening, so "Start a repair" and "customer only" each start from their own default.
        key={`${converting}-${withRepair}`}
        leadId={lead.id}
        open={converting}
        onOpenChange={setConverting}
        matches={matches}
        problemTypes={problemTypes}
        defaultSubject={defaultSubject}
        easy={easy}
        startWithRepair={withRepair}
      />

      <EditLeadDialog
        leadId={lead.id}
        values={lead.values}
        open={editing}
        onOpenChange={setEditing}
        noun={noun}
      />

      <CloseLeadDialog
        open={closing}
        onOpenChange={setClosing}
        busy={busy}
        noun={noun}
        onConfirm={(reason) =>
          run(() => closeLeadAction(lead.id, reason), `${noun} closed.`, () =>
            setClosing(false),
          )
        }
      />

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {noun.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              This is the only record of the enquiry — once it&rsquo;s gone there
              is nothing to go back to. Closing it instead keeps the history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(false)} disabled={busy}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await deleteLeadAction(lead.id);
                setBusy(false);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(`${noun} deleted.`);
                router.push("/leads");
              }}
            >
              <ACTIONS.delete />
              Delete {noun.toLowerCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

function EditLeadDialog({
  leadId,
  values: initial,
  open,
  onOpenChange,
  noun = "Lead",
}: {
  leadId: string;
  values: LeadFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noun?: string;
}) {
  const router = useRouter();
  const update = updateLeadAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState<LeadFormState, FormData>(
    update,
    EMPTY_LEAD_STATE,
  );
  const [values, setValues] = React.useState<LeadFormValues>(initial);

  const set = React.useCallback(
    <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  // The action reports success in its state rather than redirecting, so the
  // dialog closes from an effect instead of from the submit handler.
  const wasOk = React.useRef(false);
  React.useEffect(() => {
    if (state?.ok && !wasOk.current) {
      wasOk.current = true;
      toast.success(`${noun} updated.`);
      onOpenChange(false);
      router.refresh();
    }
    if (!state?.ok) wasOk.current = false;
  }, [state, onOpenChange, router, noun]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {noun.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Fix a mistyped number or add what they told you on the phone.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-5">
          {state?.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}

          <LeadFields
            values={values}
            onChange={set}
            errors={state?.fieldErrors ?? {}}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <ACTIONS.save />
            {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseLeadDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
  noun = "Lead",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: (reason: string) => void;
  noun?: string;
}) {
  const [reason, setReason] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close this {noun.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Optional — whatever you write is appended to the enquiry, not
            instead of it.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          placeholder="Went elsewhere · No answer after 3 calls · Out of our range"
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(reason)} disabled={busy}>
            <ACTIONS.archive />
            {busy ? "Closing…" : `Close ${noun.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
