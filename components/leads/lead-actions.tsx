"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
// AlertCircle is an error state, Sparkles is the AI-assisted convert flow,
// PhoneCall has no entry in the shared concept map; the verbs come from ACTIONS.
import { AlertCircle, PhoneCall, Sparkles } from "lucide-react";
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
 */
export function LeadActions({
  lead,
  matches,
  problemTypes,
  defaultSubject,
  canDelete,
}: {
  lead: LeadActionsLead;
  matches: LeadMatch[];
  problemTypes: string[];
  defaultSubject: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

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

  return (
    <>
      {/* The lead header's action row: `sm` throughout, like every other
          object page. */}
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

      <ConvertLeadDialog
        leadId={lead.id}
        open={converting}
        onOpenChange={setConverting}
        matches={matches}
        problemTypes={problemTypes}
        defaultSubject={defaultSubject}
      />

      <EditLeadDialog
        leadId={lead.id}
        values={lead.values}
        open={editing}
        onOpenChange={setEditing}
      />

      <CloseLeadDialog
        open={closing}
        onOpenChange={setClosing}
        busy={busy}
        onConfirm={(reason) =>
          run(() => closeLeadAction(lead.id, reason), "Lead closed.", () =>
            setClosing(false),
          )
        }
      />

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this lead?</DialogTitle>
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
                toast.success("Lead deleted.");
                router.push("/leads");
              }}
            >
              <ACTIONS.delete />
              Delete lead
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
}: {
  leadId: string;
  values: LeadFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      toast.success("Lead updated.");
      onOpenChange(false);
      router.refresh();
    }
    if (!state?.ok) wasOk.current = false;
  }, [state, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close this lead</DialogTitle>
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
            {busy ? "Closing…" : "Close lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
