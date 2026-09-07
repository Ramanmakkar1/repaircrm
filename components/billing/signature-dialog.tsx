"use client";

import * as React from "react";
import { useActionState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { AlertCircle } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { ICONS } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE_FORM_STATE, type FormState } from "./types";
import { useDialogOpen, type ControlledDialog } from "./dialog-open";

/**
 * Captures a customer signature on a canvas and posts it as a PNG data URL.
 *
 * The pad always paints on white with a dark pen regardless of the app theme,
 * because the resulting image is embedded in a printed document — a signature
 * drawn in white-on-dark would vanish on paper.
 */
export function SignatureDialog({
  action,
  documentId,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  title,
  description,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize,
  extraFields,
}: ControlledDialog & {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  documentId: string;
  title: string;
  description: string;
  triggerLabel: string;
  triggerVariant?: ButtonProps["variant"];
  /** Detail-page action rows run at `sm`; everywhere else keeps the default. */
  triggerSize?: ButtonProps["size"];
  /** Extra hidden fields, e.g. the approve action's `approve=1`. */
  extraFields?: Record<string, string>;
}) {
  const [dataUrl, setDataUrl] = React.useState("");
  // Declared after `dataUrl` so the reset below can reach its setter.
  const { open, setOpen, controlled } = useDialogOpen({
    open: openProp,
    onOpenChange: onOpenChangeProp,
    // An empty pad every time it opens — from its own trigger or from the
    // overflow menu. Reopening onto the last customer's signature would be a
    // signature nobody gave.
    onOpen: () => setDataUrl(""),
  });
  // Submitting is what closes the pad, so the close lives in the action
  // itself rather than in an effect waiting for `state.done` to land.
  const [state, formAction] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.done) setOpen(false);
      return result;
    },
    IDLE_FORM_STATE,
  );
  const padRef = React.useRef<SignatureCanvas | null>(null);

  const clear = () => {
    padRef.current?.clear();
    setDataUrl("");
  };

  const capture = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setDataUrl("");
      return;
    }
    setDataUrl(pad.toDataURL("image/png"));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlled ? null : (
        <DialogTrigger asChild>
          <Button variant={triggerVariant} size={triggerSize}>
            <ICONS.signature /> {triggerLabel}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={documentId} />
          <input type="hidden" name="signature" value={dataUrl} />
          {Object.entries(extraFields ?? {}).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}

          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}

          <div className="rounded-lg border border-border-strong bg-white p-2 shadow-sm">
            <SignatureCanvas
              ref={padRef}
              penColor="#1c1a17"
              onEnd={capture}
              canvasProps={{
                className: "block h-[200px] w-full touch-none rounded-sm",
                "aria-label": "Signature pad",
              }}
            />
          </div>
          <p className="text-[13.5px] text-muted-foreground">
            Sign above with a finger, stylus or mouse.
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={clear}>
              Clear
            </Button>
            <SubmitButton disabled={dataUrl === ""} pendingLabel="Saving…">
              Save signature
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
