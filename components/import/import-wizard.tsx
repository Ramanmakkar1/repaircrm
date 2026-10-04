"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ClipboardPaste, Download, FileSpreadsheet, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fieldsFor, GENERATE_SKU, type ImportKind, type Mapping } from "./fields";
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
      sheets: string[];
      sheetName: string;
      headerRow: number;
      sample: string[][];
    }
  | { ok: false; error: string };

export type PreviewResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string };

export type CommitResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string };

const SKIP = "__skip__";
const AUTO_SKU = "__generate__";

const STEPS = ["Your file", "Columns", "Check", "Done"] as const;

/**
 * The importer, shared by customers and products, built like the other step
 * flows: one decision per step, the file's summary always in view, plain words
 * and one big button.
 *
 *   1  Your file   three big boxes: upload a file, paste from Google Sheets, or
 *                  download the example sheet.
 *   2  Columns     "We matched these for you": each field with a tick and the
 *                  column it comes from, "Change" when it is wrong; the rarely
 *                  needed choices (worksheet, heading row) tucked away.
 *   3  Check       three big numbers, what to do with ones you already have,
 *                  a few rows as cards, and "Add 120 products".
 *   4  Done        what happened, in words.
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
 * Nothing is written until the last step. Matching and checking are read-only,
 * so going back and trying a different column costs nothing.
 */
export function ImportWizard({
  kind,
  uploadUrl,
  sampleUrl,
  doneHref,
  doneLabel,
  onPreview,
  onCommit,
  onSuggest,
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
  onSuggest?: (batchId: string) => Promise<{ ok: true; mapping: Mapping; notes: string[] } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const fields = React.useMemo(() => fieldsFor(kind), [kind]);
  const noun = kind === "products" ? "products" : "customers";

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
  const sourceFile = React.useRef<File | null>(null);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasted, setPasted] = React.useState("");
  const [headerRow, setHeaderRow] = React.useState("1");
  const [aiNotes, setAiNotes] = React.useState<string[]>([]);
  const [changing, setChanging] = React.useState<string | null>(null);

  // ------------------------------------------------------------------ step 1
  const send = async (file: File, sheetName?: string, selectedHeaderRow?: string) => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (sheetName) body.append("sheetName", sheetName);
      if (selectedHeaderRow) body.append("headerRow", selectedHeaderRow);
      const response = await fetch(uploadUrl, { method: "POST", body });
      const result = (await response.json()) as UploadResult;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUpload(result);
      sourceFile.current = file;
      setHeaderRow(String(result.headerRow));
      setAiNotes([]);
      setMapping(result.mapping);
      setChanging(null);
      setStep(1);
    } catch {
      setError("That file didn't arrive in one piece. Try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const suggest = async () => {
    if (!upload || !onSuggest) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onSuggest(upload.batchId);
      if (!result.ok) { setError(result.error); return; }
      setMapping((current) => ({ ...current, ...result.mapping }));
      setAiNotes(result.notes.length ? result.notes : ["The assistant matched the columns. Check the examples before you go on."]);
    } catch { setError("The assistant can't match columns right now. You can still choose them yourself."); }
    finally { setBusy(false); }
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

  const isMatched = (key: string) => (mapping[key] ?? -1) >= 0 || (kind === "products" && key === "sku" && mapping.sku === GENERATE_SKU);
  const missingRequired = fields.filter((field) => field.required && !isMatched(field.key));

  const coreKeys = kind === "products" ? ["name", "sku", "priceCents", "stockQty"] : ["firstName", "lastName", "email", "phone", "mobile"];
  const coreFields = fields.filter((field) => coreKeys.includes(field.key));
  const extraFields = fields.filter((field) => !coreKeys.includes(field.key));
  const matchedExtras = extraFields.filter((field) => isMatched(field.key)).length;
  const matchedCount = fields.filter((field) => isMatched(field.key)).length;

  function columnRow(field: (typeof fields)[number]) {
    const value = mapping[field.key] ?? -1;
    const generated = field.key === "sku" && value === GENERATE_SKU;
    const matched = isMatched(field.key);
    const open = changing === field.key || (field.required && !matched);
    const column = generated ? "Made up for you" : value >= 0 ? upload!.headers[value] : null;
    return (
      <li key={field.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              matched ? "bg-accent text-accent-foreground" : field.required ? "bg-destructive-soft text-destructive" : "bg-surface-hover text-muted-foreground",
            )}
          >
            {matched ? <Check className="size-4" strokeWidth={3} /> : field.required ? <TriangleAlert className="size-4" /> : <span className="text-sm">–</span>}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-semibold">
              {field.label}
              {field.required ? <span className="font-normal text-muted-foreground"> (needed)</span> : null}
            </span>
            <span className="text-[15px] text-muted-foreground [overflow-wrap:anywhere]">
              {column ? <>From the column <span className="font-semibold text-foreground">“{column}”</span></> : field.required ? "Choose the column it is in" : "Not brought in"}
            </span>
          </span>
          {!open ? (
            <Button type="button" variant="outline" className="h-12 px-4 text-[15px]" disabled={busy} onClick={() => setChanging(field.key)}>
              Change
            </Button>
          ) : null}
        </div>
        {value >= 0 ? (
          <p className="text-[14px] text-muted-foreground [overflow-wrap:anywhere]">
            For example: {upload!.sample.map((row) => row[value] || "(blank)").join(" · ")}
          </p>
        ) : null}
        {generated ? (
          <p className="text-[14px] text-muted-foreground">
            Codes are made from the name and barcode, so bringing the same sheet in again finds the same items. Give different variants different names.
          </p>
        ) : null}
        {open ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`map-${field.key}`} className="text-[15px]">
              Which column has the {field.label.toLowerCase()}?
            </Label>
            <Select
              value={generated ? AUTO_SKU : value < 0 ? SKIP : String(value)}
              disabled={busy}
              onValueChange={(next) => {
                setMapping((current) => ({
                  ...current,
                  [field.key]: next === SKIP ? -1 : next === AUTO_SKU ? GENERATE_SKU : Number(next),
                }));
                setChanging(null);
              }}
            >
              <SelectTrigger id={`map-${field.key}`} className="h-12 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={SKIP}>Don&rsquo;t bring it in</SelectItem>
                {kind === "products" && field.key === "sku" ? <SelectItem value={AUTO_SKU}>Make up codes for me</SelectItem> : null}
                {upload!.headers.map((header, index) => (
                  <SelectItem key={`${header}-${index}`} value={String(index)}>
                    {header}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.hint ? <p className="text-[14px] text-muted-foreground">{field.hint}</p> : null}
          </div>
        ) : null}
      </li>
    );
  }

  return (
    // Bottom room so the last button never sits under the floating assistant.
    <div className="flex flex-col gap-5 pb-28">
      <Steps current={step} />

      {upload && step > 0 && step < 3 ? (
        // The live summary: which file, how big, how much is matched.
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-border bg-surface px-4 py-3 text-[15px]">
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <FileSpreadsheet aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <span className="truncate">{upload.fileName === "pasted-sheet.tsv" ? "Pasted sheet" : upload.fileName}</span>
          </span>
          <span className="text-muted-foreground">
            {upload.rowCount.toLocaleString()} {upload.rowCount === 1 ? "row" : "rows"} · {matchedCount} of {fields.length} details matched
          </span>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {step === 0 ? (
        <section aria-labelledby="import-step" className="flex flex-col gap-4">
          <div>
            <h2 id="import-step" className="text-2xl font-semibold tracking-tight">Where is your list?</h2>
            <p className="text-base text-muted-foreground">
              Excel, Numbers, Google Sheets or a CSV file. Keep your own column names: we match them next. Nothing is saved until you say so.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* The input is visually hidden, so the focus ring lives on the label box. */}
            <label
              className={cn(
                "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border-strong bg-surface p-5 text-center transition-colors",
                "hover:border-ring focus-within:border-accent focus-within:ring-2 focus-within:ring-ring/50",
                busy && "pointer-events-none opacity-70",
              )}
            >
              {busy ? <Loader2 aria-hidden className="size-9 animate-spin" /> : <FileSpreadsheet aria-hidden className="size-9" strokeWidth={1.6} />}
              <span className="text-lg font-semibold">{busy ? "Reading the file…" : "Upload a file"}</span>
              <span className="text-[14px] text-muted-foreground">Up to 5 MB</span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.ods,.csv,.tsv"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void send(file);
                }}
              />
            </label>
            <button
              type="button"
              aria-expanded={pasteOpen}
              onClick={() => setPasteOpen((value) => !value)}
              className={cn(
                "flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border bg-surface p-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pasteOpen ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
              )}
            >
              <ClipboardPaste aria-hidden className="size-9" strokeWidth={1.6} />
              <span className="text-lg font-semibold">Paste from Google Sheets</span>
              <span className="text-[14px] text-muted-foreground">Or from Excel: copy, then paste</span>
            </button>
            <a
              href={sampleUrl}
              download
              className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-5 text-center transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download aria-hidden className="size-9" strokeWidth={1.6} />
              <span className="text-lg font-semibold">Download the example</span>
              <span className="text-[14px] text-muted-foreground">A sheet with the columns we know</span>
            </a>
          </div>

          {pasteOpen ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <Label htmlFor="pasted-sheet" className="text-base font-semibold">
                Copy the heading row and the rows under it, then paste here
              </Label>
              <Textarea
                id="pasted-sheet"
                rows={6}
                value={pasted}
                autoFocus
                onChange={(event) => setPasted(event.target.value)}
                placeholder={kind === "products" ? "Item\tSKU\tPrice\tQty\nScreen assembly\tSCR-01\t99.00\t5" : "First name\tLast name\tPhone\nAna\tLopez\t555 0100"}
                className="text-base"
              />
              <p className="text-[14px] text-muted-foreground">Works with private Google Sheets: no sharing settings, no Google password.</p>
              <Button
                type="button"
                className="h-12 self-start px-6 text-base"
                disabled={busy || !pasted.trim()}
                onClick={() => void send(new File([pasted], "pasted-sheet.tsv", { type: "text/tab-separated-values" }))}
              >
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Use this
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 1 && upload ? (
        <section aria-labelledby="import-step" className="flex flex-col gap-4">
          <div>
            <h2 id="import-step" className="text-2xl font-semibold tracking-tight">We matched these for you</h2>
            <p className="text-base text-muted-foreground">Check each one against the examples. Tap Change if a column is wrong.</p>
          </div>

          {onSuggest ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-lg text-[15px] text-muted-foreground">
                  Odd column names? The assistant can read the headings and the first three rows and match them for you.
                </p>
                <Button type="button" variant="outline" className="h-12 px-4 text-[15px]" disabled={busy} onClick={() => void suggest()}>
                  <Sparkles aria-hidden />
                  {busy ? "Working…" : "Let the assistant match them"}
                </Button>
              </div>
              {aiNotes.length ? <ul className="list-disc space-y-1 pl-5 text-[15px]">{aiNotes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
            </div>
          ) : null}

          <ul className="grid gap-3 lg:grid-cols-2">{coreFields.map(columnRow)}</ul>

          <details className="group rounded-2xl border border-border bg-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
              More details · {matchedExtras} of {extraFields.length} matched
              <span className="text-[14px] font-normal text-muted-foreground group-open:hidden">Show</span>
            </summary>
            <ul className="grid gap-3 border-t border-border p-3 lg:grid-cols-2">{extraFields.map(columnRow)}</ul>
          </details>

          <details className="rounded-2xl border border-border bg-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center px-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
              Wrong sheet, or the headings are not on the first row?
            </summary>
            <div className="flex flex-wrap items-end gap-3 border-t border-border p-4">
              {upload.sheets.length > 1 ? (
                <div className="flex min-w-48 flex-1 flex-col gap-2">
                  <Label htmlFor="import-sheet" className="text-[15px]">Sheet</Label>
                  <Select value={upload.sheetName} disabled={busy} onValueChange={(name) => { if (sourceFile.current) void send(sourceFile.current, name); }}>
                    <SelectTrigger id="import-sheet" className="h-12 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>{upload.sheets.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex w-40 flex-col gap-2">
                <Label htmlFor="header-row" className="text-[15px]">Headings are on row</Label>
                <Input id="header-row" inputMode="numeric" value={headerRow} disabled={busy} onChange={(event) => setHeaderRow(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))} className="h-12 text-base" />
              </div>
              <Button type="button" variant="outline" className="h-12 px-4 text-[15px]" disabled={busy} onClick={() => { if (sourceFile.current) void send(sourceFile.current, upload.sheetName, headerRow); }}>
                Read it again
              </Button>
            </div>
          </details>

          {missingRequired.length > 0 ? (
            <p role="alert" className="text-[15px] font-medium text-destructive">
              Still needed: {missingRequired.map((f) => f.label).join(", ")}.
            </p>
          ) : null}
          {kind === "products" ? <p className="text-[14px] text-muted-foreground">Details you don&rsquo;t bring in start empty or at zero. Prices use a decimal point; stock must be a whole number.</p> : null}
        </section>
      ) : null}

      {step === 2 && preview ? (
        <section aria-labelledby="import-step" className="flex flex-col gap-4">
          <div>
            <h2 id="import-step" className="text-2xl font-semibold tracking-tight">Check before anything is saved</h2>
            <p className="text-base text-muted-foreground">Rows with a problem are left out and listed afterwards. Everything else goes in.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <BigNumber label="Ready" value={preview.valid} />
            <BigNumber label="Need fixing" value={preview.invalid} />
            <BigNumber label="Already here" value={preview.duplicates} />
          </div>

          {preview.duplicates > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-lg font-semibold">
                {preview.duplicates} {preview.duplicates === 1 ? "row matches" : "rows match"} {noun} you already have
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <ModeCard active={mode === "skip"} title={`Skip ${noun} I already have`} hint="Leave them exactly as they are." onClick={() => setMode("skip")} />
                <ModeCard active={mode === "update"} title="Fill in their blanks" hint="Only empty details are filled; nothing you have is overwritten." onClick={() => setMode("update")} />
              </div>
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">The first {preview.rows.length} rows</h3>
            <ul className="grid gap-2 lg:grid-cols-2">
              {preview.rows.map((row) => {
                const shown = fields.filter((field) => isMatched(field.key)).slice(0, 4);
                const [first, ...rest] = shown;
                return (
                  <li key={row.row} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
                        {first ? row.values[first.key] || "(blank)" : `Row ${row.row}`}
                      </span>
                      {row.errors.length > 0 ? (
                        <StatusPill tone="danger" label="Needs fixing" />
                      ) : row.duplicate ? (
                        <StatusPill tone="active" label={mode === "skip" ? "Skipped" : "Fills blanks"} />
                      ) : (
                        <StatusPill tone="success" label="New" />
                      )}
                    </div>
                    <span className="text-[14px] text-muted-foreground [overflow-wrap:anywhere]">
                      Row {row.row}
                      {rest.map((field) => ` · ${field.label}: ${row.values[field.key] || "—"}`).join("")}
                    </span>
                    {row.errors.length > 0 ? <span className="text-[14px] font-medium text-destructive">{row.errors.join(" · ")}</span> : null}
                    {row.duplicate && row.errors.length === 0 ? <span className="text-[14px] text-muted-foreground">Matches {row.duplicate}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {step === 3 && summary ? (
        <section aria-labelledby="import-step" className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 aria-hidden className="size-12" strokeWidth={1.75} />
            <h2 id="import-step" className="text-2xl font-semibold tracking-tight">All done</h2>
            <p className="text-base text-muted-foreground">Your list is in. The copy of the file has been deleted.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <BigNumber label="Added" value={summary.created} />
            <BigNumber label="Filled in" value={summary.updated} />
            <BigNumber label="Skipped" value={summary.skipped} />
            <BigNumber label="Left out" value={summary.errors.length} />
          </div>

          {summary.errors.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
              <span className="text-base font-semibold">Rows that were left out</span>
              <ul className="flex flex-col gap-1 text-[15px]">
                {summary.errors.slice(0, 15).map((row) => (
                  <li key={row.row}>
                    <span className="font-semibold tabular-nums">Row {row.row}</span>: {row.message}
                  </li>
                ))}
              </ul>
              {summary.errors.length > 15 ? <span className="text-[14px] text-muted-foreground">…and {summary.errors.length - 15} more.</span> : null}
            </div>
          ) : null}

          <Button asChild className="h-14 self-center px-8 text-base">
            <Link href={doneHref}>
              {doneLabel}
              <ACTIONS.next />
            </Link>
          </Button>
        </section>
      ) : null}

      {step > 0 && step < 3 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            variant="outline"
            className="h-12 px-5 text-base"
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
            <Button className="h-14 px-8 text-base" disabled={busy || missingRequired.length > 0} onClick={() => void runPreview()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? "Checking…" : "Looks right"}
              {busy ? null : <ACTIONS.next />}
            </Button>
          ) : (
            <Button className="h-14 px-8 text-base" disabled={busy || (preview?.valid ?? 0) === 0} onClick={() => void runCommit()}>
              {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.upload />}
              {busy ? "Adding…" : commitLabel(kind, preview, mode)}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * "Add 120 products". When some rows match ones already on file the exact split
 * is only known while saving (a matching row can also have a problem), so the
 * button says what it will do instead of guessing a number.
 */
function commitLabel(kind: ImportKind, preview: ImportPreview | null, mode: DuplicateMode): string {
  const noun = kind === "products" ? "product" : "customer";
  if (!preview) return "Add";
  if (preview.duplicates > 0) return mode === "update" ? `Add and fill in ${preview.valid} rows` : `Add the new ${noun}s`;
  return `Add ${preview.valid} ${preview.valid === 1 ? noun : `${noun}s`}`;
}

/** 1 Your file, 2 Columns, 3 Check, 4 Done: where you are, in words, never a button. */
function Steps({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Import steps">
      {STEPS.map((label, index) => {
        const done = index < current;
        const here = index === current;
        return (
          <li
            key={label}
            aria-current={here ? "step" : undefined}
            className={cn(
              "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left",
              here ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                here ? "bg-accent-foreground text-accent" : done ? "bg-accent-soft text-accent-soft-foreground" : "bg-surface-hover text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
            </span>
            <span className="truncate text-[13px] font-semibold sm:text-[15px]">
              {label}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A big count with its word under it. Words carry the meaning, not colour. */
function BigNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface px-4 py-4">
      <span className="rf-num text-[32px] font-semibold leading-none tabular-nums tracking-tight">{value.toLocaleString()}</span>
      <span className="text-[15px] text-muted-foreground">{label}</span>
    </div>
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
        "relative flex min-h-16 flex-col gap-1 rounded-2xl border px-4 py-3.5 pr-12 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active ? "border-accent ring-1 ring-accent" : "border-border-strong bg-surface hover:bg-surface-hover",
      )}
    >
      <span className="text-base font-semibold">{title}</span>
      <span className="text-[14px] text-muted-foreground">{hint}</span>
      {active ? (
        <span aria-hidden className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="size-4" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}
