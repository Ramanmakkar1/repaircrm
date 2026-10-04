"use client";

import * as React from "react";
import { ChevronDown, Package, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { catalogEntryByKey } from "@/lib/catalog/match";
import { MAX_KIND_LABEL, MAX_PROBLEM_LENGTH, suggestPictures, tidy } from "@/lib/intake-options";
import { Caption, TileFace } from "@/components/tickets/intake/tiles";
import { problemVisualFor } from "@/components/tickets/intake/flow";
import { PROBLEM_ICONS } from "@/components/tickets/intake/visuals";
import { NoPictureChoice, PictureChoice, PictureChooser } from "./picture-chooser";

export type SheetKind = "device" | "problem";

export type SheetValue = { name: string; image: string };

type Choice = { by: "auto" } | { by: "picked"; key: string };

/**
 * The sheet that adds or edits ONE box (a device or a problem): a name, a live picture suggestion
 * and a way to pick another picture. Full height on a phone (the shared dialog already turns into
 * a bottom sheet there), a centred panel on a tablet.
 *
 * The owner sees the box exactly as staff will, and Save puts it in the list. Nothing is sent to
 * the server from here; the editor does that, once, with the whole list.
 */
export function IntakeOptionSheet({
  open,
  onOpenChange,
  onCloseAutoFocus,
  kind,
  mode,
  initialName = "",
  initialImage = "",
  nameIssue,
  onSave,
  onRemove,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the cursor goes when the sheet closes. */
  onCloseAutoFocus?: (event: Event) => void;
  kind: SheetKind;
  mode: "add" | "edit";
  initialName?: string;
  /** The current picture key; "" for none. */
  initialImage?: string;
  /** In words, why this name cannot be used ("" when it can). */
  nameIssue: (name: string) => string;
  onSave: (value: SheetValue) => void;
  /** A custom device can be taken off the list from its sheet. */
  onRemove?: () => void;
  /** A quiet line under the name field. */
  note?: string;
}) {
  const isDevice = kind === "device";
  const title = mode === "add" ? (isDevice ? "Add a device" : "Add a problem") : `Edit ${initialName}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="flex max-h-[min(92dvh,52rem)] flex-col gap-0 p-0 sm:max-w-2xl max-sm:h-[92dvh]">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-[14px]">
            {isDevice
              ? "Type what it is. Your staff will see this box on step 2 of a new repair."
              : "Type the problem. Your staff will see this box on step 3 of a new repair."}
          </DialogDescription>
        </DialogHeader>
        <SheetBody
          kind={kind}
          mode={mode}
          initialName={initialName}
          initialImage={initialImage}
          nameIssue={nameIssue}
          onSave={onSave}
          onRemove={onRemove}
          note={note}
        />
      </DialogContent>
    </Dialog>
  );
}

/** The form inside the sheet. Exported so its first paint can be tested without a browser. */
export function SheetBody({
  kind,
  mode,
  initialName,
  initialImage,
  nameIssue,
  onSave,
  onRemove,
  note,
}: {
  kind: SheetKind;
  mode: "add" | "edit";
  initialName: string;
  initialImage: string;
  nameIssue: (name: string) => string;
  onSave: (value: SheetValue) => void;
  onRemove?: () => void;
  note?: string;
}) {
  const isDevice = kind === "device";
  const [name, setName] = React.useState(initialName);
  // Adding: the best suggestion follows what is typed until a picture is tapped. Editing: keep the current one.
  const [choice, setChoice] = React.useState<Choice>(mode === "add" ? { by: "auto" } : { by: "picked", key: initialImage });
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [attempted, setAttempted] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const chooserRef = React.useRef<HTMLDivElement>(null);

  const deferred = React.useDeferredValue(name);
  const suggestions = React.useMemo(() => suggestPictures(deferred, 5), [deferred]);
  const key = choice.by === "auto" ? (suggestions[0]?.key ?? "") : choice.key;
  const entry = catalogEntryByKey(key);

  const typed = tidy(name);
  const issue = nameIssue(name);
  const shownIssue = typed ? issue : attempted ? issue : "";
  const limit = isDevice ? MAX_KIND_LABEL : MAX_PROBLEM_LENGTH;

  function save(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (issue) {
      nameRef.current?.focus();
      return;
    }
    onSave({ name: typed, image: key });
  }

  // Opening the chooser brings it into view: it sits below the fold of a short screen.
  React.useEffect(() => {
    if (!pickerOpen) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chooserRef.current?.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
  }, [pickerOpen]);

  // What staff will see for this box: the picture, or the neutral icon / the standard problem icon.
  const visual = isDevice ? null : problemVisualFor(typed || "Problem", entry ? { [typed || "Problem"]: key } : {});
  const Icon = visual?.kind === "icon" ? PROBLEM_ICONS[visual.icon] : Package;
  const photo = entry?.image ?? (visual?.kind === "photo" ? visual.src : null);

  const nameId = `${kind}-sheet-name`;
  const errorId = `${kind}-sheet-error`;

  return (
    <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId} className="text-[15px]">{isDevice ? "Device name" : "Problem name"}</Label>
          <Input
            id={nameId}
            ref={nameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={limit}
            autoComplete="off"
            autoFocus
            enterKeyHint="done"
            placeholder={isDevice ? "Printer" : "Charging port"}
            aria-invalid={shownIssue ? true : undefined}
            aria-describedby={shownIssue ? errorId : undefined}
            className="h-14 text-lg"
          />
          {shownIssue ? (
            <p id={errorId} role="alert" className="text-[14px] font-medium text-destructive">{shownIssue}</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {note ?? (isDevice ? "For example Printer, Drone or E-scooter." : "For example Charging port, Cracked back or Won't turn on.")}
            </p>
          )}
        </div>

        <section aria-label="Picture" className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Picture</h3>
          <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <div className="mx-auto w-44 sm:w-full">
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                <TileFace photo={photo} icon={Icon} />
                <Caption title={typed || (isDevice ? "Device name" : "Problem name")} />
              </div>
              <p className="mt-1.5 text-center text-[13px] text-muted-foreground">What staff will see</p>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-[14px] text-muted-foreground" aria-live="polite">
                {!typed
                  ? "Type a name and we will suggest a picture."
                  : suggestions.length > 0
                    ? "Tap a picture to use it."
                    : `We have no picture for “${typed}” yet. Choose another picture below, or leave it without one.`}
              </p>
              <div role="group" aria-label="Suggested pictures" className="grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {suggestions.slice(0, 4).map((suggestion, index) => (
                  <PictureChoice
                    key={suggestion.key}
                    entry={suggestion}
                    selected={key === suggestion.key}
                    hint={index === 0 ? "Best match" : undefined}
                    onClick={() => setChoice({ by: "picked", key: suggestion.key })}
                  />
                ))}
                <NoPictureChoice
                  selected={choice.by === "picked" ? choice.key === "" : Boolean(typed) && suggestions.length === 0}
                  detail={isDevice ? undefined : "Standard icon"}
                  onClick={() => setChoice({ by: "picked", key: "" })}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-expanded={pickerOpen}
            aria-controls={`${kind}-sheet-chooser`}
            onClick={() => setPickerOpen((value) => !value)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 text-left text-[15px] font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>Choose another picture</span>
            <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground transition-transform motion-reduce:transition-none", pickerOpen && "rotate-180")} />
          </button>
          {pickerOpen ? (
            <div id={`${kind}-sheet-chooser`} ref={chooserRef} className="scroll-mt-2">
              <PictureChooser value={key} onChoose={(next) => setChoice({ by: "picked", key: next })} searchId={`${kind}-picture-search`} />
            </div>
          ) : null}
        </section>

        {onRemove ? (
          <div className="flex flex-col gap-1.5 border-t border-border pt-4">
            <Button type="button" variant="outline" className="h-12 self-start text-destructive" onClick={onRemove}>
              <Trash2 aria-hidden /> Remove this device
            </Button>
            <p className="text-[13px] text-muted-foreground">Repairs already checked in keep this device. You can undo for a few seconds.</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2.5 border-t border-border bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <DialogClose asChild>
          <Button type="button" variant="outline" className="h-12 px-5 text-base">Cancel</Button>
        </DialogClose>
        <Button type="submit" className="h-12 px-6 text-base">
          {mode === "add" ? (isDevice ? "Add device" : "Add problem") : "Save"}
        </Button>
      </div>
    </form>
  );
}
