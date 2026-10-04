"use client";

import * as React from "react";
import { Ban, ChevronUp, Ellipsis, Package, Pencil, Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { INTAKE_OTHER_TYPE, easyIntakeProfile, easyModelOptions } from "@/lib/device-intake";
import {
  DEFAULT_DEVICE_KINDS,
  FIRST_SCREEN_KINDS,
  MAX_KIND_LABEL,
  firstScreenKinds,
  kindPicture,
  tidy,
  visibleDeviceKinds,
  type DeviceKind,
  type SaveIntakeOptions,
} from "@/lib/intake-options";
import { Block, ChipButton, Field, IconTile, IssueLines, MoreTile, MoreToggle, NextButton, OwnerLink, PhotoTile, TextTile } from "./tiles";
import {
  NEW,
  customerName,
  deviceNextLabel,
  devicePhoto,
  savedAssets,
  savedDeviceTitle,
  withDeviceKind,
  withDeviceType,
  withDifferentDevice,
  withMake,
  withModel,
  withNoDevice,
  withSavedDevice,
  type CheckInContext,
  type CheckInState,
  type Issue,
} from "./flow";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";


/** A choice already made, shown small with a way to change it. */
function Crumb({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-[15px] font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <span className="flex items-center gap-1 font-medium text-muted-foreground">
        <Pencil aria-hidden className="size-3.5" /> Change
      </span>
    </button>
  );
}

/**
 * Step 2: what are we fixing. Saved devices first (when the customer has any),
 * then the kind as picture tiles, then the brand, then the model. Every one of
 * them can be skipped; nothing here is required.
 */
export function DeviceStep({
  state,
  ctx,
  setState,
  onAdvance,
  onNext,
  issues,
  saveOptions,
  onKindsChanged,
}: {
  state: CheckInState;
  ctx: CheckInContext;
  setState: (change: (state: CheckInState) => CheckInState) => void;
  /** A tile settled it: on to the problem. */
  onAdvance: () => void;
  /** The Next button (the same one the phone's bar has). */
  onNext: () => void;
  issues: Issue[];
  /** The owner only: saves a new device box ("Add this to my devices") and shows the links to Settings. */
  saveOptions?: SaveIntakeOptions;
  /** The shop's device list after "Add this to my devices". */
  onKindsChanged?: (kinds: DeviceKind[]) => void;
}) {
  const [more, setMore] = React.useState(false);
  const [allKinds, setAllKinds] = React.useState(false);
  const [addedLabel, setAddedLabel] = React.useState("");
  const gridRef = React.useRef<HTMLDivElement>(null);
  const toggled = React.useRef(false);
  // Opening the rest puts the cursor on the first new box; closing it puts it back on the toggle.
  React.useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    // Opened: the first box that was folded away (the kinds before it, then Other, on the first screen).
    if (allKinds) gridRef.current?.querySelectorAll("button")[FIRST_SCREEN_KINDS]?.focus();
    else gridRef.current?.querySelector<HTMLButtonElement>("[data-more-devices]")?.focus();
  }, [allKinds]);
  const saved = savedAssets(state, ctx);
  const isNew = state.assetId === NEW;
  const stage = state.deviceStage;
  const kinds = ctx.deviceKinds ?? DEFAULT_DEVICE_KINDS;
  const kind = kinds.find((item) => item.type === state.device.type);
  const isOther = isNew && (state.device.type === INTAKE_OTHER_TYPE || (!kind && state.device.type !== ""));
  const messages = issues.filter((issue) => issue.step === 1).map((issue) => issue.message);
  const owner = customerName(state, ctx);

  // The customer's own devices, one tap each.
  if (saved.length > 0 && !isNew) {
    return (
      <div className="flex flex-col gap-4">
        <IssueLines messages={messages} />
        <div role="group" aria-label="Saved devices">
          <div className={GRID}>
            {saved.map((asset) => (
              <PhotoTile
                key={asset.value}
                photo={devicePhoto(asset.type, asset.make, asset.model, asset.label)}
                title={savedDeviceTitle(owner, asset)}
                detail={asset.label.split(" · ").slice(1).join(" · ") || undefined}
                selected={state.assetId === asset.value}
                onClick={() => {
                  setState((current) => withSavedDevice(current, asset.value));
                  onAdvance();
                }}
              />
            ))}
            <IconTile icon={Plus} title="Different device" detail="Something new" onClick={() => setState(withDifferentDevice)} />
            <IconTile
              icon={Ban}
              title="No device"
              detail="Add it later"
              selected={state.assetId === "none"}
              onClick={() => {
                setState(withNoDevice);
                onAdvance();
              }}
            />
          </div>
        </div>
        {state.assetId !== "" ? <NextButton onClick={onNext}>{deviceNextLabel(state)}</NextButton> : null}
      </div>
    );
  }

  const chosen = isNew && state.device.type !== "" && stage !== "kind";
  const addedNote = addedLabel && state.device.type === addedLabel ? `“${addedLabel}” is now one of your devices.` : "";
  const shown = visibleDeviceKinds(kinds);
  // The first screen: the first few kinds, then Other (always there), then "More devices".
  const first = firstScreenKinds(shown);
  const folded = first.folded > 0;
  // A box the person already chose from the folded part keeps the list open, so it is never hidden from them.
  const choseFolded = folded && isNew && !first.tiles.some((item) => item.type === state.device.type) && shown.some((item) => item.type === state.device.type);
  const open = !folded || allKinds || choseFolded;
  const tiles = open ? shown : first.tiles;

  return (
    <div className="flex flex-col gap-5">
      <IssueLines messages={messages} />
      <p role="status" className="sr-only">{addedNote}</p>
      {addedNote ? <p aria-hidden className="text-[14px] font-medium text-muted-foreground">{addedNote}</p> : null}
      {chosen ? (
        <div className="flex flex-wrap items-center gap-2">
          <Crumb onClick={() => setState((current) => ({ ...current, deviceStage: "kind" }))}>{kind?.label ?? state.device.type}</Crumb>
          {state.device.make && stage === "model" ? (
            <Crumb onClick={() => setState((current) => ({ ...current, deviceStage: "brand" }))}>{state.device.make}</Crumb>
          ) : null}
        </div>
      ) : null}

      {!chosen ? (
        <div role="group" aria-label="Kind of device" className="flex flex-col gap-3">
          <div ref={gridRef} className={GRID}>
            {tiles.map((item) => (
              <KindTile
                key={item.id}
                kind={item}
                selected={isNew && state.device.type === item.type}
                onClick={() => setState((current) => withDeviceKind(current, item.type, ctx.problemTypes))}
              />
            ))}
            {folded && !choseFolded ? (
              <MoreTile
                icon={open ? ChevronUp : Ellipsis}
                title={open ? "Fewer devices" : "More devices"}
                detail={open ? undefined : `${first.folded} more`}
                expanded={open}
                onClick={() => {
                  toggled.current = true;
                  setAllKinds((current) => !current);
                }}
                data-more-devices=""
              />
            ) : null}
          </div>
          <button
            type="button"
            aria-pressed={state.assetId === "none"}
            onClick={() => {
              setState(withNoDevice);
              onAdvance();
            }}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left text-base font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-accent aria-pressed:ring-1 aria-pressed:ring-accent"
          >
            <Ban aria-hidden className="size-5 text-muted-foreground" />
            <span>No device</span>
            <span className="text-[15px] font-normal text-muted-foreground">Skip, I&apos;ll add it later</span>
          </button>
          {saved.length > 0 || saveOptions ? (
            <div className="flex flex-wrap items-center gap-x-6">
              {saved.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setState((current) => withSavedDevice(current, ""))}
                  className="min-h-12 self-start rounded-xl px-1 text-[15px] font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Back to saved devices
                </button>
              ) : null}
              {saveOptions ? <OwnerLink href="/settings?tab=workflow">Add more devices</OwnerLink> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {chosen && stage === "brand" ? (
        <>
          {isOther ? (
            <Block title="What is it?" hint="For example a printer, a camera or a drone.">
              <Field label="Kind of device" htmlFor="ci-device-type">
                <Input
                  id="ci-device-type"
                  value={state.device.type === INTAKE_OTHER_TYPE ? "" : state.device.type}
                  onChange={(event) => setState((current) => withDeviceType(current, event.target.value, ctx.problemTypes))}
                  placeholder="Printer"
                  maxLength={80}
                  autoComplete="off"
                  className="h-14 text-lg"
                />
              </Field>
              {saveOptions ? (
                <AddToDevices
                  typed={state.device.type}
                  kinds={kinds}
                  saveOptions={saveOptions}
                  onAdded={(label, next) => {
                    setAddedLabel(label);
                    onKindsChanged?.(next);
                  }}
                />
              ) : null}
            </Block>
          ) : (
            <Block title="Which brand?" hint="Tap one, or skip it.">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {easyIntakeProfile(state.device.type).makes.map((make) => (
                  <TextTile key={make} title={make} selected={state.device.make === make} onClick={() => setState((current) => withMake(current, make))} />
                ))}
              </div>
            </Block>
          )}
          <Field label={isOther ? "Brand (optional)" : "Type a different brand"} htmlFor="ci-device-make">
            <Input
              id="ci-device-make"
              value={state.device.make}
              onChange={(event) => setState((current) => ({ ...current, device: { ...current.device, make: event.target.value } }))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && state.device.make.trim()) {
                  event.preventDefault();
                  setState((current) => withMake(current, current.device.make.trim()));
                }
              }}
              maxLength={80}
              autoComplete="off"
              className="h-14 text-lg"
            />
          </Field>
        </>
      ) : null}

      {chosen && stage === "model" ? (
        <>
          <ModelBlock state={state} setState={setState} />
          <MoreToggle open={more} onToggle={() => setMore((open) => !open)}>More device details</MoreToggle>
          {more ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Serial number or IMEI (optional)" htmlFor="ci-device-serial">
                <Input
                  id="ci-device-serial"
                  value={state.device.serial}
                  onChange={(event) => setState((current) => ({ ...current, device: { ...current.device, serial: event.target.value } }))}
                  maxLength={120}
                  autoComplete="off"
                  className="h-14 text-lg"
                />
              </Field>
              <Field label="Unlock code (optional)" htmlFor="ci-device-password">
                <Input
                  id="ci-device-password"
                  type="password"
                  autoComplete="new-password"
                  value={state.device.password}
                  onChange={(event) => setState((current) => ({ ...current, device: { ...current.device, password: event.target.value } }))}
                  maxLength={80}
                  className="h-14 text-lg"
                />
              </Field>
              <p className="text-[13px] text-muted-foreground sm:col-span-2">
                Leave these blank if unknown or the customer prefers not to share. Unlock codes are cleared when the device is collected and no other repair is open for it.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {chosen ? <NextButton onClick={onNext}>{deviceNextLabel(state)}</NextButton> : null}
    </div>
  );
}

/** One device box: its picture, or the neutral icon when the owner chose none. */
function KindTile({ kind, selected, onClick }: { kind: DeviceKind; selected: boolean; onClick: () => void }) {
  const picture = kindPicture(kind);
  return picture ? (
    <PhotoTile photo={picture.image} title={kind.label} selected={selected} onClick={onClick} />
  ) : (
    <IconTile icon={Package} title={kind.label} selected={selected} onClick={onClick} />
  );
}

/**
 * Under the "What is it?" field, for the owner only: a device the shop does not list yet can be
 * added to the list in one tap, with the best picture the library has for the name. Quiet text,
 * no navigation; once added the box exists and the offer is gone.
 */
function AddToDevices({
  typed,
  kinds,
  saveOptions,
  onAdded,
}: {
  typed: string;
  kinds: readonly DeviceKind[];
  saveOptions: SaveIntakeOptions;
  /** The label that was added and the shop's whole list after it. */
  onAdded: (label: string, kinds: DeviceKind[]) => void;
}) {
  const [phase, setPhase] = React.useState<"idle" | "saving">("idle");
  const [error, setError] = React.useState("");
  const label = tidy(typed);
  const listed = kinds.some((item) => item.label.toLowerCase() === label.toLowerCase() || item.type.toLowerCase() === label.toLowerCase());
  const offer = label.length >= 2 && label.length <= MAX_KIND_LABEL && label.toLowerCase() !== INTAKE_OTHER_TYPE.toLowerCase() && !listed;

  async function add() {
    setPhase("saving");
    setError("");
    try {
      const result = await saveOptions({ addDevice: { label } });
      if (result.ok) {
        onAdded(label, result.deviceKinds);
      } else {
        setError(result.error);
      }
    } catch {
      setError("We could not reach the server. Try again.");
    }
    setPhase("idle");
  }

  return (
    <div className="flex flex-col gap-1">
      {offer ? (
        <button
          type="button"
          disabled={phase === "saving"}
          onClick={add}
          className="inline-flex min-h-12 items-center gap-1.5 self-start rounded-xl px-1 text-[15px] font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <Plus aria-hidden className="size-4" />
          {phase === "saving" ? "Adding…" : `Add “${label}” to my devices`}
        </button>
      ) : null}
      {error ? <p role="alert" className="text-[14px] font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

/** The model chips, and a plain field for one that is not listed. */
function ModelBlock({
  state,
  setState,
}: {
  state: CheckInState;
  setState: (change: (state: CheckInState) => CheckInState) => void;
}) {
  const models = easyModelOptions(state.device.type, state.device.make);
  return (
    <Block title="Which model?" hint="Tap one, or type it. You can skip this.">
      {models.length > 0 ? (
        <div role="group" aria-label="Models" className="flex flex-wrap gap-2">
          {models.map((model) => (
            <ChipButton key={model} selected={state.device.model === model} onClick={() => setState((current) => withModel(current, current.device.model === model ? "" : model))}>
              {model}
            </ChipButton>
          ))}
        </div>
      ) : null}
      <Field label="Type a different model" htmlFor="ci-device-model">
        <Input
          id="ci-device-model"
          data-enter="next"
          value={state.device.model}
          onChange={(event) => setState((current) => withModel(current, event.target.value))}
          maxLength={120}
          autoComplete="off"
          className="h-14 text-lg"
        />
      </Field>
    </Block>
  );
}
