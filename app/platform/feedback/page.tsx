import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { FEEDBACK_KINDS, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABELS } from "@/lib/product-feedback";
import { updateFeedbackStatusAction } from "./actions";

export const metadata = { title: "Product feedback · RepairsHelper" };
export default async function FeedbackInbox({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const status = FEEDBACK_STATUSES.find((value) => value === params.status);
  const requestedPage = Number.parseInt(params.page || "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(1000, Math.max(1, requestedPage)) : 1;
  const where = status ? { status } : {};
  const [reports, count] = await Promise.all([
    db.productFeedback.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, skip: (page - 1) * 30 }),
    db.productFeedback.count({ where }),
  ]);
  const href = (next: number) => `/platform/feedback?page=${next}${status ? `&status=${status}` : ""}`;
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-5xl">
        <Link href="/platform" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">← Platform operations</Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Product feedback</h1>
        <p className="mt-3 text-muted-foreground">Bugs, feature requests and suggestions submitted to RepairsHelper. {count} report{count === 1 ? "" : "s"} in this view.</p>
        <nav aria-label="Filter feedback" className="my-6 flex flex-wrap gap-3">
          {[{ value: "", label: "All reports" }, ...FEEDBACK_STATUSES.map((value) => ({ value, label: FEEDBACK_STATUS_LABELS[value] }))].map((filter) => (
            <Link key={filter.value} href={filter.value ? `/platform/feedback?status=${filter.value}` : "/platform/feedback"} aria-current={(status || "") === filter.value ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium aria-[current=page]:bg-foreground aria-[current=page]:text-background">{filter.label}</Link>
          ))}
        </nav>
        <div className="space-y-5">
          {!reports.length && <p className="rounded-lg border border-border p-8 text-muted-foreground">No reports in this view.</p>}
          {reports.map((report) => (
            <article key={report.id} className="rounded-lg border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{FEEDBACK_KINDS.find((kind) => kind.value === report.kind)?.label || report.kind} · {FEEDBACK_STATUS_LABELS[report.status as keyof typeof FEEDBACK_STATUS_LABELS]}</span>
                <time dateTime={report.createdAt.toISOString()}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(report.createdAt)} UTC</time>
              </div>
              <h2 className="mt-3 break-words text-xl font-semibold">{report.title}</h2>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{report.detail}</p>
              <dl className="mt-4 grid gap-2 text-sm text-muted-foreground">
                {report.page && <div className="break-words"><dt className="inline font-semibold">Page: </dt><dd className="inline">{report.page}</dd></div>}
                <div className="break-words"><dt className="inline font-semibold">Follow-up email: </dt><dd className="inline">{report.email || "Not provided"}</dd></div>
                <div><dt className="inline font-semibold">Source: </dt><dd className="inline">{report.reporterUserId ? "Signed-in user" : "Website visitor"}</dd></div>
              </dl>
              <form action={updateFeedbackStatusAction} className="mt-5 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={report.id} />
                <label className="flex flex-col gap-2 text-sm" htmlFor={`status-${report.id}`}>Report status<select id={`status-${report.id}`} name="status" defaultValue={report.status} className="min-h-11 rounded-md border border-border bg-background px-3">{FEEDBACK_STATUSES.map((value) => <option key={value} value={value}>{FEEDBACK_STATUS_LABELS[value]}</option>)}</select></label>
                <button type="submit" className="min-h-11 rounded-md bg-foreground px-4 text-sm font-medium text-background">Save status</button>
              </form>
            </article>
          ))}
        </div>
        <nav aria-label="Feedback pages" className="mt-8 flex items-center justify-between gap-4 text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="min-h-11 py-3 underline">Previous</Link> : <span />}
          <span>Page {page}</span>
          {page * 30 < count ? <Link href={href(page + 1)} className="min-h-11 py-3 underline">Next</Link> : <span />}
        </nav>
      </div>
    </main>
  );
}
