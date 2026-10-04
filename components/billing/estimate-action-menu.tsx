"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACTIONS } from "@/components/ui/icons";
import { SignatureDialog } from "./signature-dialog";
import { TILE_CLASS } from "./tile-style";

/**
 * THE ESTIMATE HEADER'S SECONDARY ACTIONS, BEHIND ONE "MORE".
 *
 * Easy mode's estimate header shows one big black button chosen by status
 * (Send, or Convert to invoice once it is approved). Print, Edit, Approve,
 * Approve and sign, Decline and Convert used to sit beside it as a row of
 * outline buttons; they live here now, in the same fixed order, the way the
 * invoice header's menu already works (see invoice-action-menu.tsx).
 *
 * NOTHING HERE CHANGES WHAT AN ACTION DOES. Each state change is the very
 * server action the button used to post. A menu closes the instant you choose,
 * and Radix unmounts its content with it, so a form living inside an item would
 * be torn down before it could submit. The forms therefore sit beside the menu,
 * always mounted, and an item's only job is to submit its form. The signature
 * pad is a self-contained dialog and is driven the same way the invoice menu
 * drives its dialogs (see dialog-open.ts).
 */

type FormAction = (formData: FormData) => Promise<void>;
type SignatureAction = React.ComponentProps<typeof SignatureDialog>["action"];

type FormKey = "approve" | "decline" | "convert";

export function EstimateActionMenu({
  estimateId,
  estimateNumber,
  customerName,
  printHref,
  editHref,
  approve,
  approveWithSignature,
  decline,
  convert,
  large = false,
  tile = false,
}: {
  estimateId: string;
  estimateNumber: number;
  customerName: string;
  printHref: string;
  /** Null once the estimate has been converted and is frozen. */
  editHref: string | null;
  approve: { action: FormAction } | null;
  approveWithSignature: { action: SignatureAction } | null;
  decline: { action: FormAction } | null;
  convert: { action: FormAction } | null;
  /** Easy mode: a labelled 48px "More" button and 48px rows. */
  large?: boolean;
  /** The POS-style bill screen: "More" is one of the quick tiles. Same menu, same items. */
  tile?: boolean;
}) {
  const [signing, setSigning] = React.useState(false);
  const uid = React.useId();
  const formId = (key: FormKey) => `${uid}-${key}`;
  // Looked up in the event handler, never during render.
  const submits = (key: FormKey) => () => {
    const form = document.getElementById(formId(key));
    if (form instanceof HTMLFormElement) form.requestSubmit();
  };

  const hasStateChange = Boolean(approve || approveWithSignature || decline || convert);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {tile ? (
            <button type="button" className={TILE_CLASS} aria-label="More estimate actions">
              <ACTIONS.more aria-hidden />
              More
            </button>
          ) : large ? (
            <Button variant="outline" className="h-12 px-5 text-base" aria-label="More estimate actions">
              <ACTIONS.more /> More
            </Button>
          ) : (
            <Button variant="outline" size="icon" className="size-8" aria-label="More estimate actions">
              <ACTIONS.more className="size-4" />
            </Button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className={cn(
            "min-w-[13rem]",
            (large || tile) && "min-w-60 [&_[role=menuitem]]:min-h-12 [&_[role=menuitem]]:text-base",
          )}
        >
          <DropdownMenuItem asChild>
            <Link href={printHref} target="_blank">
              <ACTIONS.print className="size-4 text-muted-foreground" />
              Print
            </Link>
          </DropdownMenuItem>

          {editHref ? (
            <DropdownMenuItem asChild>
              <Link href={editHref}>
                <ACTIONS.edit className="size-4 text-muted-foreground" />
                Edit
              </Link>
            </DropdownMenuItem>
          ) : null}

          {hasStateChange ? <DropdownMenuSeparator /> : null}

          {approve ? (
            <DropdownMenuItem onSelect={submits("approve")}>
              <ACTIONS.approve className="size-4 text-muted-foreground" />
              Approve
            </DropdownMenuItem>
          ) : null}

          {approveWithSignature ? (
            <DropdownMenuItem
              onSelect={(event) => {
                // Keep the menu from closing on its own timing so the dialog takes focus cleanly.
                event.preventDefault();
                setSigning(true);
              }}
            >
              <ACTIONS.approve className="size-4 text-muted-foreground" />
              Approve + sign
            </DropdownMenuItem>
          ) : null}

          {convert ? (
            <DropdownMenuItem onSelect={submits("convert")}>
              <ACTIONS.convert className="size-4 text-muted-foreground" />
              Convert to invoice
            </DropdownMenuItem>
          ) : null}

          {decline ? (
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive-soft"
              onSelect={submits("decline")}
            >
              <ACTIONS.decline className="size-4" />
              Decline
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ----------------------------------------- the forms the items submit */}

      {(
        [
          ["approve", approve],
          ["decline", decline],
          ["convert", convert],
        ] as const
      ).map(([key, entry]) =>
        entry ? (
          <form key={key} id={formId(key)} action={entry.action} hidden>
            <input type="hidden" name="id" value={estimateId} />
          </form>
        ) : null,
      )}

      {approveWithSignature ? (
        <SignatureDialog
          open={signing}
          onOpenChange={setSigning}
          action={approveWithSignature.action}
          documentId={estimateId}
          title="Approve with signature"
          description={`Have ${customerName} sign to authorise the work on estimate #${estimateNumber}.`}
          triggerLabel="Approve + sign"
        />
      ) : null}
    </>
  );
}
