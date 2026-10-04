"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Package, Plus, Send } from "lucide-react";

import { ChoiceChips, StepBar, StepHeader } from "@/components/public/steps";
import { BIG_INPUT, HUGE_BUTTON } from "@/components/public/sizes";
import { problemOptions, problemVisualFor } from "@/components/tickets/intake/flow";
import { IconTile, IssueLines, PhotoTile } from "@/components/tickets/intake/tiles";
import { PROBLEM_ICONS } from "@/components/tickets/intake/visuals";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INTAKE_OTHER_TYPE } from "@/lib/device-intake";
import { fewProblems, problemHint } from "@/lib/portal-display";
import { createPortalTicketAction } from "@/app/portal/tickets/new/actions";

/**
 * The customer's repair request, as three quick questions with big picture
 * boxes (the same boxes the shop's own New repair screen uses):
 *
 *   1. Which device?   their saved devices, or "Something else" and its kind
 *   2. What is wrong?  problem boxes for that kind of device
 *   3. Tell us more    a few words, then one big "Send to the shop"
 *
 * It posts exactly what the old form did (assetId, deviceType, problemType,
 * description) to createPortalTicketAction, which re-checks every one of them.
 */

/** The server's sentinel for "a device you have not told us about". */
const NEW_DEVICE = "new";
const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3";
const STEPS = [
  { title: "Which device?", hint: "Tap the one that needs fixing." },
  { title: "What is wrong?", hint: "Tap the closest match. You can explain more next." },
  { title: "Tell us a little more", hint: "When it started and anything you have tried. A few words is fine." },
] as const;

export type PortalDevice = { id: string; label: string; type: string; photo: string };
export type PortalKind = { label: string; type: string; photo: string | null };

export function NewRequestForm({
  shopName,
  devices,
  kinds,
  problemTypes,
  problemPictures,
}: {
  shopName: string;
  devices: PortalDevice[];
  kinds: PortalKind[];
  problemTypes: string[];
  problemPictures: Record<string, string>;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [assetId, setAssetId] = React.useState(devices.length > 0 ? "" : NEW_DEVICE);
  const [kindType, setKindType] = React.useState("");
  const [otherText, setOtherText] = React.useState("");
  const [problem, setProblem] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [issues, setIssues] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ id: string; number: number } | null>(null);
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const moved = React.useRef(false);

  // A new question gets the focus (and the top of the screen) when the step changes.
  React.useEffect(() => {
    if (!moved.current) return;
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView({ block: "nearest" });
  }, [step]);

  const saved = devices.find((device) => device.id === assetId);
  const isOther = assetId === NEW_DEVICE && kindType === INTAKE_OTHER_TYPE;
  const kind = kinds.find((item) => item.type === kindType);
  const deviceType = saved ? saved.type : isOther ? otherText.trim() : kindType;
  const deviceLabel = saved ? saved.label : isOther ? otherText.trim() : (kind?.label ?? "");
  const problems = fewProblems(problemOptions(deviceType, problemTypes));

  function go(next: number) {
    moved.current = true;
    setIssues([]);
    setStep(next);
  }

  function check(at: number): string[] {
    if (at === 0) {
      if (!assetId) return ["Tap the device that needs fixing."];
      if (assetId === NEW_DEVICE && !kindType) return ["Tap the kind of device."];
      if (isOther && !otherText.trim()) return ["Tell us what the device is."];
    }
    if (at === 1 && !problem) return ["Tap what is wrong, or Other."];
    if (at === 2 && description.trim().length < 5) return ["Tell us a little about what is wrong (a few words)."];
    return [];
  }

  function next() {
    const found = check(step);
    if (found.length > 0) {
      setIssues(found);
      return;
    }
    go(step + 1);
  }

  async function send() {
    for (let at = 0; at < STEPS.length; at++) {
      const found = check(at);
      if (found.length > 0) {
        go(at);
        setIssues(found);
        return;
      }
    }
    const form = new FormData();
    form.set("assetId", assetId);
    form.set("deviceType", deviceType);
    form.set("problemType", problem);
    form.set("description", description.trim());

    setBusy(true);
    const result = await createPortalTicketAction(form);
    setBusy(false);
    if (!result.ok) {
      setIssues([result.error]);
      return;
    }
    setCreated({ id: result.ticketId, number: result.ticketNumber });
    router.refresh();
  }

  if (created) {
    return (
      <section className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
        <CheckCircle2 className="size-14 text-status-resolved" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-bold tracking-tight">Request sent</h1>
          <p className="text-[15px] text-muted-foreground">
            It is repair #{created.number}. {shopName} will reply on its page, and you get an email each time.
          </p>
        </div>
        <Button asChild size="lg" className={cn(HUGE_BUTTON, "sm:max-w-sm")}>
          <Link href={`/portal/tickets/${created.id}`}>Open repair #{created.number}</Link>
        </Button>
      </section>
    );
  }

  const choosingKind = assetId === NEW_DEVICE;

  return (
    <div className="flex flex-col gap-5">
      <StepHeader step={step} total={STEPS.length} title={STEPS[step].title} hint={STEPS[step].hint} titleRef={titleRef} />
      <ChoiceChips items={[step > 0 ? deviceLabel : "", step > 1 ? problem : ""]} />
      <IssueLines messages={issues} />

      {step === 0 ? (
        <div className="flex flex-col gap-5">
          {devices.length > 0 ? (
            <div role="group" aria-label="Your devices" className={GRID}>
              {devices.map((device) => (
                <PhotoTile
                  key={device.id}
                  photo={device.photo}
                  title={device.label}
                  detail={device.label === device.type ? undefined : device.type}
                  selected={assetId === device.id}
                  onClick={() => {
                    setAssetId(device.id);
                    go(1);
                  }}
                />
              ))}
              <IconTile
                icon={Plus}
                title="Something else"
                detail="A device we have not seen"
                selected={choosingKind}
                onClick={() => {
                  setAssetId(NEW_DEVICE);
                  setIssues([]);
                }}
              />
            </div>
          ) : null}

          {choosingKind ? (
            <div className="flex flex-col gap-3">
              {devices.length > 0 ? <h2 className="text-lg font-semibold">What kind of device?</h2> : null}
              <div role="group" aria-label="Kind of device" className={GRID}>
                {kinds.map((item) =>
                  item.photo ? (
                    <PhotoTile
                      key={item.type}
                      photo={item.photo}
                      title={item.label}
                      selected={kindType === item.type}
                      onClick={() => {
                        setKindType(item.type);
                        if (item.type !== INTAKE_OTHER_TYPE) go(1);
                      }}
                    />
                  ) : (
                    <IconTile
                      key={item.type}
                      icon={Package}
                      title={item.label}
                      selected={kindType === item.type}
                      onClick={() => {
                        setKindType(item.type);
                        if (item.type !== INTAKE_OTHER_TYPE) go(1);
                      }}
                    />
                  ),
                )}
              </div>
              {isOther ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="request-device" className="text-[15px]">
                    What is it?
                  </Label>
                  <Input
                    id="request-device"
                    value={otherText}
                    maxLength={60}
                    autoFocus
                    onChange={(event) => setOtherText(event.target.value)}
                    placeholder="For example: e-scooter, smart speaker"
                    className={BIG_INPUT}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div role="group" aria-label="What is wrong" className={GRID}>
          {problems.map((label) => {
            const visual = problemVisualFor(label, problemPictures);
            const detail = problemHint(label) || undefined;
            return visual.kind === "photo" ? (
              <PhotoTile
                key={label}
                photo={visual.src}
                title={label}
                detail={detail}
                selected={problem === label}
                onClick={() => {
                  setProblem(label);
                  go(2);
                }}
              />
            ) : (
              <IconTile
                key={label}
                icon={PROBLEM_ICONS[visual.icon]}
                title={label}
                detail={detail}
                selected={problem === label}
                onClick={() => {
                  setProblem(label);
                  go(2);
                }}
              />
            );
          })}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="request-description" className="text-[15px]">
            What is happening?
          </Label>
          <Textarea
            id="request-description"
            value={description}
            rows={5}
            maxLength={4000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="It will not charge unless I hold the cable at an angle."
            className="rounded-xl px-4 py-3 text-base"
          />
          <p className="text-[14px] text-muted-foreground">
            Want to send a photo? You can add one on the repair page right after this.
          </p>
        </div>
      ) : null}

      <StepBar>
        {step > 0 ? (
          <Button type="button" size="lg" variant="outline" className="h-14 min-h-14 rounded-xl px-5 text-base" onClick={() => go(step - 1)}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button type="button" size="lg" className={cn(HUGE_BUTTON, "flex-1 sm:w-auto sm:flex-none sm:min-w-56")} onClick={next}>
            Next
          </Button>
        ) : (
          <Button type="button" size="lg" disabled={busy} className={cn(HUGE_BUTTON, "flex-1 sm:w-auto sm:flex-none sm:min-w-56")} onClick={() => void send()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {busy ? "Sending…" : "Send to the shop"}
          </Button>
        )}
      </StepBar>
    </div>
  );
}
