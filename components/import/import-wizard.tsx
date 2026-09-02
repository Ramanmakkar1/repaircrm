"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Loader2, TriangleAlert } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { fieldsFor, type ImportKind, type Mapping } from "./fields";
import type { DuplicateMode, ImportPreview, ImportSummary } from "./commit";

/** What the upload route answers with. */
export type UploadResult =
  | {
      ok: true;
      batchId: string;
      fileName: string;
      headers: string[];
      rowCount: number;
      mapping: Mapping;
    }
  | { ok: false; error: string };

export type PreviewResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string };

export type CommitResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string };

const SKIP = "__skip__";

const STEPS = ["Upload", "Map columns", "Review", "Done"] as const;

/**
 * The four-step CSV importer, shared by customers and products.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FILE IS UPLOADED SEPARATELY
 * ---------------------------------------------------------------------------
 * Step 1 posts to a route handler, not a server action: actions cap request
 * bodies at 1MB and this promises 5MB. The parsed table then lives server-side
 * under a batch id (lib/import-store.ts), and steps 2–4 send only that id — so
 * a 5,000-row file crosses the wire exactly once, and the rows the server is
 * about to trust never round-trip through the browser.
 *
 * Nothing is written until the last step. Mapping and preview are read-only, so
 * backing up and trying a different column costs nothing.
 */
export function ImportWizard({
  kind,
  uploadUrl,
  sampleUrl,
  doneHref,
  doneLabel,
  onPreview,
  onCommit,
}: {
  kind: ImportKind;
  uploadUrl: string;
  sampleUrl: string;
  doneHref: string;
  doneLabel: string;
  onPreview: (batchId: string, mapping: Mapping) => Promise<PreviewResult>;
  onCommit: (
    batchId: string,
    mapping: Mapping,
    mode: DuplicateMode,
  ) => Promise<CommitResult>;
}) {
  const router = useRouter();
  const fields = React.useMemo(() => fieldsFor(kind), [kind]);

  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [upload, setUpload] = React.useState<
    Extract<UploadResult, { ok: true }> | null
  >(null);
  const [mapping, setMapping] = React.useState<Mapping>({});
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [mode, setMode] = React.useState<DuplicateMode>("skip");
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);

  const fileRef = React.useRef<HTMLInputElement | null>(null);

  // ------------------------------------------------------------------ step 1
  const send = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(uploadUrl, { method: "POST", body });
      const result = (await response.json()) as UploadResult;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUpload(result);
      setMapping(result.mapping);
      setStep(1);
    } catch {
      setError("That upload didn't arrive in one piece — try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ------------------------------------------------------------------ step 2
  const runPreview = async () => {
    if (!upload) return;
    setBusy(true);
    setError(null);
    const result = await onPreview(upload.batchId, mapping);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.preview);
    setStep(2);
  };

  // ------------------------------------------------------------------ step 3
  const runCommit = async () => {
    if (!upload) return;
    setBusy(true);
    setError(null);
    const result = await onCommit(upload.batchId, mapping, mode);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSummary(result.summary);
    setStep(3);
    router.refresh();
  };

  const missingRequired = fields.filter(
    (field) => field.required && (mapping[field.key] ?? -1) < 0,
  );

  return (
    <div className="flex flex-col gap-5">
      <Steps current={step} />

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Choose a file</CardTitle>
            <CardDescription>
              A CSV with a header row — up to 5 MB and 5,000 rows. Exports from
              RepairShopr, QuickBooks and plain spreadsheets all work.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* The input itself is visually hidden, so the focus ring has to
                live on the label — otherwise tabbing to the file picker shows
                nothing at all. */}
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-hover/50 px-6 py-12 text-center transition-colors",
                "hover:border-accent/50 hover:bg-surface-hover",
                "focus-within:border-accent focus-within:ring-2 focus-within:ring-ring/50",
              )}
            >
              <span className="flex size-14 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
                {busy ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <FileSpreadsheet className="size-6" />
                )}
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-[15px] font-bold text-foreground">
                  {busy ? "Reading the file…" : "Click to pick a CSV"}
                </span>
                <span className="text-[13.5px] text-muted-foreground">
                  Nothing is saved until you have seen the preview.
                </span>
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void send(file);
                }}
              />
            </label>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-[13.5px] text-muted-foreground">
                Not sure what the columns should be called?
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href={sampleUrl} download>
                  <ACTIONS.download className="size-4" />
                  Sample CSV
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 && upload ? (
        <Card>
          <CardHeader>
            <CardTitle>Match the columns</CardTitle>
            <CardDescription>
              {upload.fileName} · {upload.rowCount.toLocaleString()} row
              {upload.rowCount === 1 ? "" : "s"}. We guessed from the header row —
              fix anything that looks wrong.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => {
                const value = mapping[field.key] ?? -1;
                return (
                  <div key={field.key} className="flex flex-col gap-2">
                    <Label htmlFor={`map-${field.key}`}>
                      {field.label}
                      {field.required ? (
                        <span className="ml-0.5 text-destructive">*</span>
                      ) : null}
                    </Label>
                    <Select
                      value={value < 0 ? SKIP : String(value)}
                      onValueChange={(next) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]: next === SKIP ? -1 : Number(next),
                        }))
                      }
                    >
                      <SelectTrigger id={`map-${field.key}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value={SKIP}>Don&rsquo;t import</SelectItem>
                        {upload.headers.map((header, index) => (
                          <SelectItem key={header} value={String(index)}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.hint ? (
                      <p className="text-[13px] text-muted-foreground">{field.hint}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {missingRequired.length > 0 ? (
              <p className="text-[13px] font-medium text-destructive">
                Still needed: {missingRequired.map((f) => f.label).join(", ")}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && preview ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile label="Rows" value={preview.total} />
            <Tile label="Ready" value={preview.valid} tone="good" />
            <Tile label="With problems" value={preview.invalid} tone="bad" />
            <Tile label="Already on file" value={preview.duplicates} tone="warn" />
          </div>

          {preview.duplicates > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>What about the ones already on file?</CardTitle>
                <CardDescription>
                  {preview.duplicates} row
                  {preview.duplicates === 1 ? " matches" : "s match"} something
                  that already exists.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <ModeCard
                  active={mode === "skip"}
                  title="Skip duplicates"
                  hint="Leave the existing record exactly as it is."
                  onClick={() => setMode("skip")}
                />
                <ModeCard
                  active={mode === "update"}
                  title="Update existing"
                  hint="Fill in the blanks from the file. Empty cells never overwrite."
                  onClick={() => setMode("update")}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>First {preview.rows.length} rows</CardTitle>
              <CardDescription>
                A sample of what will be written. Rows with problems are skipped
                and listed by number afterwards.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 py-0">
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-16">Row</Th>
                    {fields
                      .filter((field) => (mapping[field.key] ?? -1) >= 0)
                      .slice(0, 5)
                      .map((field) => (
                        <Th key={field.key}>{field.label}</Th>
                      ))}
                    <Th>Status</Th>
                  </Tr>
                </THead>
                <TBody>
                  {preview.rows.map((row) => (
                    <Tr key={row.row}>
                      <Td className="tabular-nums text-muted-foreground">{row.row}</Td>
                      {fields
                        .filter((field) => (mapping[field.key] ?? -1) >= 0)
                        .slice(0, 5)
                        .map((field) => (
                          <Td
                            key={field.key}
                            className="max-w-[14rem] truncate text-foreground"
                            title={row.values[field.key] || undefined}
                          >
                            {row.values[field.key] || "—"}
                          </Td>
                        ))}
                      {/* What this row will do when Import is pressed, in the
                          app's own status language: red it will not go, amber
                          it lands on something already on file, green it is a
                          new record. */}
                      <Td>
                        {row.errors.length > 0 ? (
                          <StatusPill
                            tone="danger"
                            label={row.errors[0]!}
                            size="sm"
                            title={row.errors.join(" · ")}
                          />
                        ) : row.duplicate ? (
                          <StatusPill
                            tone="active"
                            label={`${mode === "skip" ? "Skip" : "Update"} — ${row.duplicate}`}
                            size="sm"
                          />
                        ) : (
                          <StatusPill tone="success" label="New" size="sm" />
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 3 && summary ? (
        <Card>
          <CardContent className="flex flex-col gap-6 py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-16 items-center justify-center rounded-xl bg-status-resolved-bg text-status-resolved-fg">
                <CheckCircle2 className="size-7" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-lg font-bold tracking-tight text-foreground">
                  Import finished
                </p>
                <p className="text-[14.5px] text-muted-foreground">
                  The file has been processed and the scratch copy deleted.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Tile label="Created" value={summary.created} tone="good" />
              <Tile label="Updated" value={summary.updated} />
              <Tile label="Skipped" value={summary.skipped} tone="warn" />
              <Tile
                label="Errors"
                value={summary.errors.length}
                tone={summary.errors.length > 0 ? "bad" : undefined}
              />
            </div>

            {summary.errors.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-hover/60 px-4 py-3">
                <span className="text-[13px] font-semibold text-muted-foreground">
                  Rows that didn&rsquo;t make it
                </span>
                <ul className="flex flex-col gap-1 text-[13.5px] text-foreground">
                  {summary.errors.slice(0, 15).map((row) => (
                    <li key={row.row}>
                      <span className="font-semibold tabular-nums">Row {row.row}</span>{" "}
                      — {row.message}
                    </li>
                  ))}
                </ul>
                {summary.errors.length > 15 ? (
                  <span className="text-[13px] text-muted-foreground">
                    …and {summary.errors.length - 15} more.
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-center">
              <Button asChild>
                <Link href={doneHref}>
                  {doneLabel}
                  <ACTIONS.next />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step > 0 && step < 3 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setError(null);
              setStep((current) => current - 1);
            }}
          >
            <ACTIONS.back />
            Back
          </Button>

          {step === 1 ? (
            <Button
              disabled={busy || missingRequired.length > 0}
              onClick={() => void runPreview()}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? "Checking…" : "Preview"}
              {busy ? null : <ACTIONS.next />}
            </Button>
          ) : (
            <Button
              disabled={busy || (preview?.valid ?? 0) === 0}
              onClick={() => void runCommit()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.upload />}
              {busy ? "Importing…" : `Import ${preview?.valid ?? 0} rows`}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Steps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEPS.map((label, index) => (
        <li key={label} className="flex items-center gap-2">
          <span
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
              index === current
                ? "border-transparent bg-accent text-accent-foreground shadow-sm"
                : index < current
                  ? "border-transparent bg-status-resolved-bg text-status-resolved-fg"
                  : "border-border-strong bg-surface text-muted-foreground",
            )}
          >
            <span className="tabular-nums opacity-70">{index + 1}</span>
            {label}
          </span>
          {index < STEPS.length - 1 ? (
            <span className="h-px w-4 bg-border-strong" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <Card className="flex flex-col gap-1 px-4 py-4">
      <span
        className={cn(
          "text-[26px] font-bold leading-none tabular-nums tracking-tight",
          tone === "good"
            ? "text-status-resolved-fg"
            : tone === "bad"
              ? "text-status-overdue-fg"
              : tone === "warn"
                ? "text-status-in-progress-fg"
                : "text-foreground",
        )}
      >
        {value.toLocaleString()}
      </span>
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
    </Card>
  );
}

function ModeCard({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-1 rounded-md border px-4 py-3.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "border-accent bg-accent-soft"
          : "border-border-strong bg-surface hover:bg-surface-hover",
      )}
    >
      <span
        className={cn(
          "text-[14.5px] font-bold",
          active ? "text-accent-soft-foreground" : "text-foreground",
        )}
      >
        {title}
      </span>
      <span className="text-[13px] text-muted-foreground">{hint}</span>
    </button>
  );
}
