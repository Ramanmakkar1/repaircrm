"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, Package, Pencil, Plus, RotateCcw, Trash2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { saveIntakeOptionsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { DEFAULT_PROBLEM_TYPES } from "@/components/tickets/ticket-meta";
import { Caption, TileFace } from "@/components/tickets/intake/tiles";
import { problemVisualFor } from "@/components/tickets/intake/flow";
import { PROBLEM_ICONS } from "@/components/tickets/intake/visuals";
import {
  FIRST_SCREEN_BOXES,
  FIRST_SCREEN_KINDS,
  MAX_DEVICE_KINDS,
  MAX_PROBLEMS,
  addDeviceKind,
  addProblem,
  canMoveDevice,
  canMoveProblem,
  checklistsOn,
  checklistsWithoutProblem,
  deviceNameIssue,
  isBuiltInKind,
  isOtherKind,
  kindPicture,
  moveDeviceKind,
  moveProblem,
  problemNameIssue,
  removeChecklistNote,
  removeDeviceKind,
  removeProblem,
  renameChecklistNote,
  renamesBetween,
  resetChecklistNote,
  restoreDeviceKind,
  restoreProblem,
  setDeviceHidden,
  updateDeviceKind,
  updateProblem,
  visibleDeviceKinds,
  type ChecklistLink,
  type DeviceKind,
  type ProblemRename,
  type SaveIntakeOptions,
  type SaveIntakeOptionsInput,
  type SaveIntakeOptionsResult,
} from "@/lib/intake-options";
import { IntakeOptionSheet, type SheetValue } from "./intake-option-sheet";

type Lists = { kinds: DeviceKind[]; problems: string[]; pictures: Record<string, string> };

type Status = { state: "idle" | "saving" | "saved" } | { state: "error"; message: string };

type SheetTarget = { kind: "device" | "problem"; mode: "add" | "edit"; id?: string };

type Saved = Extract<SaveIntakeOptionsResult, { ok: true }>;


/**
 * "Your devices and your problems": the boxes staff tap on the New repair screen, drawn the way
 * staff see them. Every change (add, rename, re-picture, hide, move, remove, reset) is applied at
 * once and saved with the one server action, whole list at a time, in order. If the server says
 * no, the list goes back to how it was and the reason is shown in words.
 *
 * A checklist is tied to a problem by its name, so a rename is sent along with the list (`renamed`)
 * and the server moves the checklists with it. The sheet, the Remove toast and the reset dialog say
 * which checklists a change touches, so nothing stops attaching without the owner being told.
 */
export function IntakeOptionsEditor({
  deviceKinds,
  problemTypes,
  problemPictures,
  checklists = [],
  onProblemTypesChange,
  save = saveIntakeOptionsAction,
}: {
  deviceKinds: readonly DeviceKind[];
  problemTypes: string[];
  problemPictures: Record<string, string>;
  /** The shop's checklists (name and problem), so a change to a problem can say what it does to them. */
  checklists?: readonly ChecklistLink[];
  /** The Workflow tab keeps the problem list for its own Save button (statuses). */
  onProblemTypesChange?: (problems: string[]) => void;
  save?: SaveIntakeOptions;
}) {
  const initial: Lists = { kinds: [...deviceKinds], problems: problemTypes, pictures: problemPictures };
  const [lists, setLists] = React.useState<Lists>(initial);
  // The lists as they are right now, for an Undo pressed after other changes were made.
  const current = React.useRef<Lists>(initial);
  React.useEffect(() => {
    current.current = lists;
  }, [lists]);
  const confirmed = React.useRef<Lists>(initial);
  const latest = React.useRef(0);
  const [status, setStatus] = React.useState<Status>({ state: "idle" });
  const [sheet, setSheet] = React.useState<SheetTarget | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [resetting, setResetting] = React.useState<"devices" | "problems" | null>(null);
  // The button that opened a dialog gets the cursor back when it closes (there is no Trigger to do it for us).
  // When that button has gone (its box was just removed), the cursor goes to the box that took its
  // place, or to "Add a device", never to the page body.
  const opener = React.useRef<HTMLElement | null>(null);
  const fallback = React.useRef<string | null>(null);
  const rememberOpener = (element: HTMLElement) => {
    opener.current = element;
    fallback.current = null;
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) {
      opener.current.focus();
      return;
    }
    focusFirst(fallback.current);
  };

  /** Show `next` now, save it, and either keep it (the server's own tidied copy) or put the old list back. */
  async function commit(next: Lists, input: SaveIntakeOptionsInput, message?: string | ((saved: Saved) => string)): Promise<boolean> {
    const mine = ++latest.current;
    setLists(next);
    setStatus({ state: "saving" });
    let result: Awaited<ReturnType<SaveIntakeOptions>>;
    try {
      result = await save(input);
    } catch {
      result = { ok: false, error: "We could not reach the server. Check your connection and try again." };
    }
    if (!result.ok) {
      if (mine === latest.current) {
        setLists(confirmed.current);
        setStatus({ state: "error", message: result.error });
      }
      toast.error(result.error);
      return false;
    }
    const server: Lists = { kinds: result.deviceKinds, problems: result.problemTypes, pictures: result.problemPictures };
    confirmed.current = server;
    onProblemTypesChange?.(server.problems);
    if (mine === latest.current) {
      setLists(server);
      setStatus({ state: "saved" });
    }
    if (message) toast.success(typeof message === "function" ? message(result) : message);
    return true;
  }

  const saveDevices = (kinds: DeviceKind[], message?: string) => commit({ ...current.current, kinds }, { deviceKinds: kinds }, message);
  const saveProblems = (value: { problems: string[]; pictures: Record<string, string> }, message?: string | ((saved: Saved) => string), renamed: ProblemRename[] = []) =>
    commit({ ...current.current, ...value }, { problemTypes: value.problems, problemPictures: value.pictures, ...(renamed.length > 0 ? { renamed } : {}) }, message);

  function openSheet(target: SheetTarget, element: HTMLElement) {
    rememberOpener(element);
    setSheet(target);
    setSheetOpen(true);
  }

  // ---- devices
  const kindById = (id?: string) => lists.kinds.find((kind) => kind.id === id);

  function saveDeviceSheet(value: SheetValue) {
    if (!sheet) return;
    const result =
      sheet.mode === "add"
        ? addDeviceKind(lists.kinds, { label: value.name, image: value.image })
        : updateDeviceKind(lists.kinds, sheet.id ?? "", { label: value.name, image: value.image });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSheetOpen(false);
    void saveDevices(result.value, sheet.mode === "add" ? `${value.name} added. Staff will see it on the next repair.` : `${value.name} saved.`);
  }

  function removeDevice(kind: DeviceKind) {
    const before = lists.kinds;
    const index = before.findIndex((item) => item.id === kind.id);
    // The Edit button that opened the sheet goes with the box: send the cursor to the box that
    // takes its place (or the one before it), else to "Add a device".
    const neighbour = before[index + 1] ?? before[index - 1];
    opener.current = null;
    fallback.current = neighbour ? `[data-option-id="device:${neighbour.id}"] button:not([disabled])` : `[data-add-tile="device"]`;
    setSheetOpen(false);
    void saveDevices(removeDeviceKind(before, kind.id)).then((ok) => {
      if (!ok) return;
      toastWithUndo({
        message: `${kind.label} removed`,
        description: "Repairs already checked in keep it.",
        // Back where it was, in the list as it is now: moves made since are kept.
        undo: async () => {
          if (!(await saveDevices(restoreDeviceKind(current.current.kinds, kind, index)))) throw new Error("Could not put it back.");
        },
      });
    });
  }

  // ---- problems
  function saveProblemSheet(value: SheetValue) {
    if (!sheet) return;
    const state = { problems: lists.problems, pictures: lists.pictures };
    const result = sheet.mode === "add" ? addProblem(state, { name: value.name, image: value.image }) : updateProblem(state, sheet.id ?? "", { name: value.name, image: value.image });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSheetOpen(false);
    if (sheet.mode === "add") {
      void saveProblems(result.value, `${value.name} added. Staff will see it on the next repair.`);
      return;
    }
    // Same place in the list, new name: the checklists tied to the old name move with it.
    void saveProblems(
      result.value,
      (saved) =>
        `${value.name} saved.${saved.checklistsMoved ? ` ${saved.checklistsMoved === 1 ? "Its checklist follows" : `Its ${saved.checklistsMoved} checklists follow`} the new name.` : ""}`,
      renamesBetween(lists.problems, result.value.problems),
    );
  }

  function removeProblemBox(name: string) {
    const before = { problems: lists.problems, pictures: lists.pictures };
    const result = removeProblem(before, name);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const index = before.problems.indexOf(name);
    const picture = before.pictures[name];
    const neighbour = before.problems[index + 1] ?? before.problems[index - 1];
    const tied = checklistsOn(checklists, name);
    void saveProblems(result.value).then((ok) => {
      if (!ok) return;
      toastWithUndo({
        message: `${name} removed`,
        description: tied.length > 0 ? removeChecklistNote(tied) : "Repairs already checked in keep their wording.",
        // Back where it was, with its picture, in the list as it is now.
        undo: async () => {
          if (!(await saveProblems(restoreProblem(current.current, name, picture, index)))) throw new Error("Could not put it back.");
        },
      });
    });
    // The Remove button pressed has gone with its box: keep the cursor in the list.
    focusFirst(neighbour ? `[data-option-id="problem:${cssEscape(neighbour)}"] button:not([disabled])` : `[data-add-tile="problem"]`, true);
  }

  async function reset(which: "devices" | "problems") {
    setResetting(null);
    const mine = ++latest.current;
    setStatus({ state: "saving" });
    let result: Awaited<ReturnType<SaveIntakeOptions>>;
    try {
      result = await save({ reset: [which] });
    } catch {
      result = { ok: false, error: "We could not reach the server. Check your connection and try again." };
    }
    if (!result.ok) {
      setStatus({ state: "error", message: result.error });
      toast.error(result.error);
      return;
    }
    const server: Lists = { kinds: result.deviceKinds, problems: result.problemTypes, pictures: result.problemPictures };
    confirmed.current = server;
    onProblemTypesChange?.(server.problems);
    if (mine === latest.current) {
      setLists(server);
      setStatus({ state: "saved" });
    }
    toast.success(which === "devices" ? "Devices are back to the standard list." : "Problems are back to the standard list.");
  }

  const editingKind = sheet?.kind === "device" ? kindById(sheet.id) : undefined;
  // What a reset of the problems would leave without a problem to attach to.
  const strandedByReset = checklistsWithoutProblem(checklists, DEFAULT_PROBLEM_TYPES);
  const problemSheetNote = sheet?.kind === "problem" && sheet.mode === "edit" ? renameChecklistNote(checklistsOn(checklists, sheet.id ?? "")) : "";
  const visibleCount = visibleDeviceKinds(lists.kinds).length;
  const devicesFull = lists.kinds.length >= MAX_DEVICE_KINDS;
  const problemsFull = lists.problems.length >= MAX_PROBLEMS;

  return (
    <section aria-labelledby="intake-options-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 id="intake-options-title" className="text-lg font-semibold tracking-tight">Your devices and your problems</h3>
        <p className="text-[15px] text-muted-foreground">
          These are the boxes your staff tap when they check a repair in. Change them here and the New repair screen changes too.
          Your changes save as you make them.
        </p>
        <p role="status" aria-live="polite" className="flex min-h-6 items-center gap-1.5 text-[14px] font-medium">
          {status.state === "saving" ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> Saving…</span>
          ) : status.state === "saved" ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Check aria-hidden className="size-4" strokeWidth={3} /> All changes saved</span>
          ) : status.state === "error" ? (
            <span className="text-destructive">That was not saved, so the list is back to how it was. {status.message}</span>
          ) : null}
        </p>
      </div>

      <Card>
        <CardHeader
          title="Devices you repair"
          description="Step 2 of a new repair: “What are we fixing?”"
          action={
            <Button type="button" variant="outline" className="h-12" onClick={(event) => {
                rememberOpener(event.currentTarget);
                setResetting("devices");
              }}>
              <RotateCcw aria-hidden /> Reset to the standard list
            </Button>
          }
        />
        <CardContent className="flex flex-col gap-3">
          <ul role="list" aria-label="Devices you repair" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {lists.kinds.map((kind) => {
              const picture = kindPicture(kind);
              const other = isOtherKind(kind);
              return (
                <OptionTile key={kind.id} optionId={`device:${kind.id}`} title={kind.label} photo={picture?.image ?? null} icon={Package} hidden={Boolean(kind.hidden)}>
                  {other ? (
                    <>
                      <TileButton icon={Pencil} label={`Edit ${kind.label}`} onClick={(event) => openSheet({ kind: "device", mode: "edit", id: kind.id }, event.currentTarget)}>Edit</TileButton>
                      <p className="flex min-h-12 items-center px-1 text-[13px] text-muted-foreground">Always last</p>
                    </>
                  ) : (
                    <>
                      <TileButton icon={ArrowLeft} label={`Move ${kind.label} earlier`} disabled={!canMoveDevice(lists.kinds, kind.id, -1)} onClick={() => void saveDevices(moveDeviceKind(lists.kinds, kind.id, -1))}>Earlier</TileButton>
                      <TileButton icon={ArrowRight} label={`Move ${kind.label} later`} disabled={!canMoveDevice(lists.kinds, kind.id, 1)} onClick={() => void saveDevices(moveDeviceKind(lists.kinds, kind.id, 1))}>Later</TileButton>
                      <TileButton icon={Pencil} label={`Edit ${kind.label}`} onClick={(event) => openSheet({ kind: "device", mode: "edit", id: kind.id }, event.currentTarget)}>Edit</TileButton>
                      <TileButton
                        icon={kind.hidden ? Eye : EyeOff}
                        label={kind.hidden ? `Show ${kind.label} to staff` : `Hide ${kind.label} from staff`}
                        onClick={() => void saveDevices(setDeviceHidden(lists.kinds, kind.id, !kind.hidden))}
                      >
                        {kind.hidden ? "Show" : "Hide"}
                      </TileButton>
                    </>
                  )}
                </OptionTile>
              );
            })}
            <AddTile kind="device" label="Add a device" disabled={devicesFull} detail={devicesFull ? `Up to ${MAX_DEVICE_KINDS} devices` : undefined} onClick={(event) => openSheet({ kind: "device", mode: "add" }, event.currentTarget)} />
          </ul>
          {visibleCount > FIRST_SCREEN_BOXES ? (
            <p className="text-[14px] text-muted-foreground">
              On the first screen staff see your first {FIRST_SCREEN_KINDS} boxes, then Other, then a “More devices” box that opens the rest. Put the ones you do most first.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Problems you fix"
          description="Step 3 of a new repair: “What's wrong?”"
          action={
            <Button type="button" variant="outline" className="h-12" onClick={(event) => {
                rememberOpener(event.currentTarget);
                setResetting("problems");
              }}>
              <RotateCcw aria-hidden /> Reset to the standard list
            </Button>
          }
        />
        <CardContent className="flex flex-col gap-3">
          <ul role="list" aria-label="Problems you fix" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {lists.problems.map((name) => {
              const visual = problemVisualFor(name, lists.pictures);
              const only = lists.problems.length <= 1;
              return (
                <OptionTile key={name} optionId={`problem:${name}`} title={name} photo={visual.kind === "photo" ? visual.src : null} icon={visual.kind === "icon" ? PROBLEM_ICONS[visual.icon] : Package}>
                  <TileButton icon={ArrowLeft} label={`Move ${name} earlier`} disabled={!canMoveProblem(lists.problems, name, -1)} onClick={() => void saveProblems({ problems: moveProblem(lists.problems, name, -1), pictures: lists.pictures })}>Earlier</TileButton>
                  <TileButton icon={ArrowRight} label={`Move ${name} later`} disabled={!canMoveProblem(lists.problems, name, 1)} onClick={() => void saveProblems({ problems: moveProblem(lists.problems, name, 1), pictures: lists.pictures })}>Later</TileButton>
                  <TileButton icon={Pencil} label={`Edit ${name}`} onClick={(event) => openSheet({ kind: "problem", mode: "edit", id: name }, event.currentTarget)}>Edit</TileButton>
                  <TileButton icon={Trash2} label={only ? "Keep at least one problem" : `Remove ${name}`} disabled={only} onClick={() => removeProblemBox(name)}>Remove</TileButton>
                </OptionTile>
              );
            })}
            <AddTile kind="problem" label="Add a problem" disabled={problemsFull} detail={problemsFull ? `Up to ${MAX_PROBLEMS} problems` : undefined} onClick={(event) => openSheet({ kind: "problem", mode: "add" }, event.currentTarget)} />
          </ul>
          <p className="text-[14px] text-muted-foreground">
            Staff first see a few problems that suit the kind of device (for example Screen Repair for a phone), then yours, then Other.
            Taking a problem off the list never changes a repair that already used it.
          </p>
        </CardContent>
      </Card>

      {sheet ? (
        <IntakeOptionSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onCloseAutoFocus={restoreFocus}
          kind={sheet.kind}
          mode={sheet.mode}
          initialName={sheet.kind === "device" ? (editingKind?.label ?? "") : sheet.mode === "edit" ? (sheet.id ?? "") : ""}
          initialImage={sheet.kind === "device" ? (editingKind?.image ?? "") : sheet.mode === "edit" ? (lists.pictures[sheet.id ?? ""] ?? "") : ""}
          nameIssue={(name) => (sheet.kind === "device" ? deviceNameIssue(lists.kinds, name, sheet.mode === "edit" ? sheet.id : undefined) : problemNameIssue(lists.problems, name, sheet.mode === "edit" ? sheet.id : undefined))}
          onSave={sheet.kind === "device" ? saveDeviceSheet : saveProblemSheet}
          onRemove={sheet.kind === "device" && sheet.mode === "edit" && editingKind && !isBuiltInKind(editingKind.id) && !isOtherKind(editingKind) ? () => removeDevice(editingKind) : undefined}
          note={
            sheet.kind === "device" && editingKind && editingKind.type !== editingKind.label
              ? `Repairs are still saved as “${editingKind.type}”, whatever the box says.`
              : problemSheetNote || undefined
          }
        />
      ) : null}

      <Dialog open={resetting !== null} onOpenChange={(open) => (open ? undefined : setResetting(null))}>
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={restoreFocus}>
          <DialogHeader>
            <DialogTitle className="text-lg">{resetting === "devices" ? "Reset the devices?" : "Reset the problems?"}</DialogTitle>
            <DialogDescription className="text-[14px]">
              {resetting === "devices"
                ? "Devices you added go away, hidden ones come back and the order goes back to the standard one. Repairs already checked in keep their device."
                : "Your problem list and its pictures go back to the standard ones. Repairs already checked in keep their wording."}
            </DialogDescription>
            {resetting === "problems" && strandedByReset.length > 0 ? (
              <p role="note" className="text-[14px] font-medium text-foreground">{resetChecklistNote(strandedByReset)}</p>
            ) : null}
          </DialogHeader>
          <DialogFooter className="flex-wrap">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-12 px-5 text-base">Keep my list</Button>
            </DialogClose>
            <Button type="button" variant="destructive" className="h-12 px-5 text-base" onClick={() => resetting && void reset(resetting)}>
              Reset to the standard list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * One box, drawn like the check-in's tile (picture on its white canvas, name under it) with its
 * buttons below. Hidden boxes are dimmed AND say so in words.
 */
function OptionTile({
  optionId,
  title,
  photo,
  icon,
  hidden = false,
  children,
}: {
  /** "device:<id>" or "problem:<name>": where the cursor goes when a neighbour is removed. */
  optionId: string;
  title: string;
  photo: string | null;
  icon: LucideIcon;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li data-option-id={optionId} className="@container flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative">
        <div className={cn(hidden && "opacity-40")}>
          <TileFace photo={photo} icon={icon} />
        </div>
        {hidden ? (
          <span className="absolute left-2 top-2 rounded-full border border-border-strong bg-surface px-2.5 py-1 text-[13px] font-semibold">Hidden</span>
        ) : null}
      </div>
      <Caption title={title} />
      <div className="mt-auto grid grid-cols-2 gap-1.5 p-2 pt-0">{children}</div>
    </li>
  );
}

/** A 48px button on a tile. The word shows when the tile is wide enough; the full name is always its accessible name. */
function TileButton({
  icon: Icon,
  label,
  children,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <Button type="button" variant="outline" aria-label={label} title={label} className="h-12 w-full gap-1.5 px-2 text-[14px]" {...props}>
      <Icon aria-hidden />
      <span className="hidden @min-[11rem]:inline">{children}</span>
    </Button>
  );
}

/** The last box of a grid: opens the sheet that adds one. */
function AddTile({ kind, label, detail, disabled, onClick }: { kind: "device" | "problem"; label: string; detail?: string; disabled?: boolean; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <li className="flex min-w-0">
      <button
        type="button"
        data-add-tile={kind}
        disabled={disabled}
        onClick={onClick}
        className="flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong bg-surface p-3 text-center text-base font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Plus className="size-6" />
        </span>
        <span>{label}</span>
        {detail ? <span className="text-[13px] font-normal text-muted-foreground">{detail}</span> : null}
      </button>
    </li>
  );
}

/** Escapes a problem name for use inside an attribute selector. */
function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

/**
 * Puts the cursor on the first element matching `selector` (a box's first button, or an Add tile).
 * `later` waits for the list to re-render first: the box being replaced is still on screen now.
 */
function focusFirst(selector: string | null, later = false) {
  if (!selector) return;
  const go = () => document.querySelector<HTMLElement>(selector)?.focus();
  if (later) requestAnimationFrame(() => requestAnimationFrame(go));
  else go();
}
