import { Archive, Database, FolderOpen, HardDrive, ShieldCheck } from "lucide-react";

import { ConsoleShell } from "@/components/platform/console-shell";
import { PageTitle, Panel, ShareBar, StatTile, TimeAgo } from "@/components/platform/console-ui";
import { readPlatformConsole, type PlatformFailure } from "@/lib/platform-console-data";
import { formatBytes, formatCount, formatDateTime, percentOf, timeAgo } from "@/lib/platform-format";

export const metadata = { title: "System health · Repairs helper" };

/** Where a file is kept, by the name the app records (`Attachment.storage`, STORAGE_DRIVER). */
const PLACES: Record<string, string> = {
  local: "This server's disk",
  r2: "Cloudflare R2 online storage",
  s3: "An online storage bucket (S3)",
};

const FAILURE_KINDS: Record<PlatformFailure["kind"], string> = {
  webhook: "Webhook",
  integration: "Accounting",
  payments: "Payments",
};

/** Connections in use at or above this share get a warning. */
const BUSY_DATABASE_PERCENT = 80;

function placeName(storage: string): string {
  return PLACES[storage] ?? storage;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/**
 * How the server that runs Repairs helper is doing, in plain words: disk
 * space, uploaded files, the database, backups, which build is live, and saved
 * failures. Shop numbers live on the Overview and Shops tabs, and the audit
 * trail on Activity.
 */
export default async function SystemHealthPage() {
  // readPlatformConsole() checks the operator session before any reading.
  const { admin, now, database, uploads, disk, storedFiles, runtime, failures } = await readPlatformConsole();
  const diskUsed = disk ? percentOf(disk.totalBytes - disk.freeBytes, disk.totalBytes) : 0;
  const connectionsUsed = database ? percentOf(database.totalSessions, database.maxConnections) : 0;

  return (
    <ConsoleShell admin={admin} current="system">
      <PageTitle
        title="System health"
        intro="How the server that runs Repairs helper is doing. Every reading is taken when you open this page."
      >
        <p className="text-sm text-muted-foreground">Checked {formatDateTime(now)}</p>
      </PageTitle>

      <section aria-label="Server readings" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={HardDrive}
          label="Free disk space"
          value={disk ? formatBytes(disk.freeBytes) : "Can't read"}
          detail={
            disk ? (
              <>
                Free of {formatBytes(disk.totalBytes)} · {diskUsed}% used
                <ShareBar percent={diskUsed} className="mt-2" />
                {disk.low ? <Warning>Running low. Free up space or add a bigger disk.</Warning> : null}
                <span className="mt-2 block">
                  {disk.measured === "uploads" ? "The disk that holds uploaded files." : "The disk the app runs from."}
                </span>
              </>
            ) : (
              "The app isn't allowed to check this disk."
            )
          }
        />
        <StatTile
          icon={FolderOpen}
          label="Uploaded files"
          value={uploads ? `${uploads.complete ? "" : "At least "}${formatBytes(uploads.bytes)}` : "Can't read"}
          detail={
            <>
              {uploads ? `${plural(uploads.files, "file")} in the uploads folder on this server.` : "The uploads folder couldn't be read."}
              {uploads && !uploads.complete ? (
                <span className="block">Counting stopped after a few seconds, so there is more than this.</span>
              ) : null}
              {runtime.storageDriver !== "local" ? (
                <span className="mt-2 block">New files go to {placeName(runtime.storageDriver)}, not this folder.</span>
              ) : null}
            </>
          }
        />
        <StatTile
          icon={Database}
          label="Database size"
          value={database ? formatBytes(database.storageBytes) : "Can't read"}
          detail={
            database ? (
              <>
                {formatCount(database.totalSessions)} of {formatCount(database.maxConnections)} connections in use ·{" "}
                {formatCount(database.activeSessions)} busy right now
                <ShareBar percent={connectionsUsed} className="mt-2" />
                {connectionsUsed >= BUSY_DATABASE_PERCENT ? (
                  <Warning>Close to the limit. Sign-ins and pages may start to fail.</Warning>
                ) : null}
              </>
            ) : (
              "The database didn't share its size and connections."
            )
          }
        />
        <StatTile
          icon={Archive}
          label="Last backup"
          value="Unknown"
          detail="Backups aren't recorded anywhere the app can see, so this page can't tell when the last one was made. Check on the server that a recent copy exists, and keep one copy somewhere else."
        />
      </section>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Panel
          id="version"
          title="This version of the app"
          detail="The app starts again after every update and every server restart."
        >
          <dl className="divide-y divide-border text-[15px]">
            <Reading term="Built">
              {runtime.production
                ? runtime.builtAt
                  ? formatDateTime(runtime.builtAt)
                  : "Not recorded in this build"
                : "Development copy on this computer, not the live site"}
            </Reading>
            {runtime.buildId ? (
              <Reading term="Build number">
                <code className="break-all font-mono text-sm">{runtime.buildId}</code>
              </Reading>
            ) : null}
            <Reading term="Running since">
              {formatDateTime(runtime.startedAt)}{" "}
              <span className="font-normal text-muted-foreground">({timeAgo(runtime.startedAt, now)})</span>
            </Reading>
            <Reading term="Node.js">{runtime.nodeVersion}</Reading>
          </dl>
          {runtime.production ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              To see which change is live, look for the update made around the build time under Actions on GitHub.
            </p>
          ) : null}
        </Panel>

        <Panel
          id="files"
          title="Where files are kept"
          detail="Repair, customer and product files, and automatic product photos, as the app recorded them."
        >
          <p className="text-[15px]">
            New files are saved to <strong className="font-semibold">{placeName(runtime.storageDriver)}</strong>.
          </p>
          {storedFiles === null ? (
            <p className="mt-3 text-[15px] text-muted-foreground">The list of saved files couldn&apos;t be read from the database.</p>
          ) : storedFiles.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted-foreground">No files have been saved yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {storedFiles.map((place) => (
                <li key={place.storage} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-[15px]">
                  <span className="min-w-0 break-words">{placeName(place.storage)}</span>
                  <span className="font-semibold tabular-nums">
                    {plural(place.files, "file")} · {formatBytes(place.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        id="failures"
        className="mt-6"
        title="System failures"
        detail="Saved problems with webhooks, accounting connections and Stripe setup, newest first."
        action={<span className="text-sm text-muted-foreground">{plural(failures.rows.length, "record")}</span>}
      >
        {failures.unavailableSources.length > 0 ? (
          <p className="mb-3 rounded-md bg-status-in-progress-bg px-3 py-2 text-sm leading-6 text-status-in-progress-fg">
            Some of these couldn&apos;t be checked: {failures.unavailableSources.join(", ")}.
          </p>
        ) : null}
        {failures.rows.length > 0 ? (
          <ul className="divide-y divide-border">
            {failures.rows.map((failure) => (
              <li key={failure.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-status-overdue-bg px-2.5 py-0.5 text-[13px] font-semibold text-status-overdue-fg">
                      {FAILURE_KINDS[failure.kind]}
                    </span>
                    <span className="min-w-0 break-words text-[15px] font-semibold">{failure.title}</span>
                  </p>
                  <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{failure.message}</p>
                  <p className="mt-0.5 break-words text-sm text-faint-foreground">{failure.shopName}</p>
                </div>
                <TimeAgo value={failure.occurredAt} now={now} className="whitespace-nowrap text-sm text-muted-foreground" />
              </li>
            ))}
          </ul>
        ) : failures.unavailableSources.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center">
            <ShieldCheck aria-hidden="true" className="mx-auto size-5 text-status-resolved" />
            <p className="mt-2 text-[15px] font-semibold">No saved failures</p>
            <p className="mt-1 text-sm text-muted-foreground">Webhook deliveries, accounting connections and Stripe setup were checked.</p>
          </div>
        ) : null}
        <p className="mt-4 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">
          Other errors, such as a page that fails to load, aren&apos;t saved here. They are only in the app&apos;s log on the server.
        </p>
      </Panel>
    </ConsoleShell>
  );
}

/** A warning line inside a tile; the words carry the meaning, the colour only backs them up. */
function Warning({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-2 block rounded-md bg-status-overdue-bg px-2.5 py-1.5 text-[13px] font-semibold leading-5 text-status-overdue-fg">
      {children}
    </span>
  );
}

function Reading({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}
