import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CreditCard,
  FileText,
  Mail,
  Package,
  Plug,
  Users,
  UserRound,
  Wrench,
} from "lucide-react";

import { ActivityList } from "@/components/platform/activity-list";
import { ConsoleShell } from "@/components/platform/console-shell";
import {
  NewPill,
  PageTitle,
  Panel,
  RecountStorage,
  ShareBar,
  StatTile,
  StatusPill,
  TimeAgo,
} from "@/components/platform/console-ui";
import { isNewShop } from "@/lib/platform-directory";
import { daysFromNow, formatBytes, formatCount, formatDate, formatMoney, percentOf } from "@/lib/platform-format";
import { readShopDetail, type ShopDetail } from "@/lib/platform-shops";

export const metadata = { title: "Shop · Operator console" };

const ROLE_LABELS: Record<string, string> = { OWNER: "Owner", FRONT_DESK: "Front desk", TECH: "Technician" };

const PROVIDER_LABELS: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero" };

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

function count(value: number, one: string, many = `${one}s`): string {
  return `${formatCount(value)} ${value === 1 ? one : many}`;
}

function StorageRow({
  label,
  detail,
  bytes,
  total,
  missing,
}: {
  label: string;
  detail?: string;
  bytes: number | null;
  total: number;
  missing?: string;
}) {
  return (
    <li className="py-3 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-[15px] font-semibold tabular-nums">{bytes === null ? (missing ?? "Not measured") : formatBytes(bytes)}</span>
      </div>
      {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      <ShareBar percent={percentOf(bytes ?? 0, total)} className="mt-2" />
    </li>
  );
}

function SpacePanel({ shop, now, countedAt }: { shop: ShopDetail; now: Date; countedAt: Date }) {
  const { files, database, signatureBytes, totalBytes, fileBytes } = shop.storage;
  return (
    <Panel
      id="space"
      title="Space used"
      detail="Uploaded files are exact sizes. Database records are an estimate."
      action={<RecountStorage countedAt={countedAt} now={now} />}
    >
      <p className="text-[34px] font-semibold leading-tight tracking-tight tabular-nums">{formatBytes(totalBytes)}</p>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Files {formatBytes(fileBytes)} · records {database ? `about ${formatBytes(database.bytes)}` : "not counted"}
      </p>
      <ul className="mt-4 divide-y divide-border">
        <StorageRow label="Repair photos and files" detail={count(files.repairs.count, "file")} bytes={files.repairs.bytes} total={totalBytes} />
        <StorageRow label="Customer files" detail={count(files.customers.count, "file")} bytes={files.customers.bytes} total={totalBytes} />
        <StorageRow label="Product photos" detail={count(files.products.count, "photo")} bytes={files.products.bytes} total={totalBytes} />
        <StorageRow
          label="Automatic product photos"
          detail={`${count(files.automaticPhotos.count, "photo")} found online for products without one`}
          bytes={files.automaticPhotos.bytes}
          total={totalBytes}
        />
        {files.other.count > 0 ? (
          <StorageRow label="Other files" detail={count(files.other.count, "file")} bytes={files.other.bytes} total={totalBytes} />
        ) : null}
        <StorageRow
          label="Shop logo"
          detail={files.logoBytes === 0 ? "No logo uploaded" : undefined}
          bytes={files.logoBytes}
          total={totalBytes}
          missing="Could not be measured"
        />
        <StorageRow
          label="Database records (estimate)"
          detail={
            database
              ? `${count(database.rows, "record")}${signatureBytes ? `, including ${formatBytes(signatureBytes)} of customer signatures` : ""}`
              : "The estimate could not be made this time. Try Count again."
          }
          bytes={database ? database.bytes : null}
          total={totalBytes}
          missing="Not counted"
        />
      </ul>

      {database && database.tables.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-[15px] font-semibold">Biggest kinds of records</h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">Kind</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Records</th>
                <th scope="col" className="py-2 text-right font-medium">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {database.tables.slice(0, 8).map((table) => (
                <tr key={table.table}>
                  <td className="py-2 pr-3">{table.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatCount(table.rows)}</td>
                  <td className="py-2 text-right tabular-nums">{formatBytes(table.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function StaffPanel({ shop, now }: { shop: ShopDetail; now: Date }) {
  const active = shop.staff.filter((person) => person.active).length;
  return (
    <Panel
      id="staff"
      title="Staff"
      detail={`${count(active, "login")} can sign in${shop.staff.length > active ? ` · ${formatCount(shop.staff.length - active)} switched off` : ""}`}
    >
      {shop.staff.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">This shop has no staff logins.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shop.staff.map((person) => (
            <li key={person.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="break-words text-[15px] font-semibold">{person.name}</span>
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {ROLE_LABELS[person.role] ?? person.role}
                  </span>
                  {person.active ? null : (
                    <span className="rounded-full bg-status-overdue-bg px-2 py-0.5 text-xs font-semibold text-status-overdue-fg">Switched off</span>
                  )}
                </p>
                <p className="break-words text-sm text-muted-foreground">{person.email}</p>
                <p className="text-sm text-muted-foreground">
                  {[
                    person.totpEnabledAt ? "Two-step sign-in on" : "Two-step sign-in off",
                    person.googleLinkedAt ? "Google linked" : null,
                    `added ${formatDate(person.createdAt)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="text-sm text-muted-foreground sm:text-right">
                {person.lastLoginAt ? (
                  <>
                    Last signed in <TimeAgo value={person.lastLoginAt} now={now} className="font-medium text-foreground" />
                  </>
                ) : (
                  "Never signed in"
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default async function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // readShopDetail() checks the operator session before any read.
  const { admin, now, shop, storage } = await readShopDetail(id);
  if (!shop || !storage) notFound();

  const { usage } = shop;
  const place = [shop.city, shop.state, shop.country].filter(Boolean).join(", ");
  const connections = [
    shop.stripeOnboardedAt ? "Card payments" : null,
    ...usage.integrations
      .filter((integration) => integration.status !== "disconnected")
      .map((integration) => `${providerLabel(integration.provider)}${integration.status === "error" ? " (has an error)" : ""}`),
    usage.apiKeys > 0 ? count(usage.apiKeys, "API key") : null,
  ].filter((value): value is string => value !== null);

  return (
    <ConsoleShell admin={admin} current="shops">
      <Link
        href="/platform/shops"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All shops
      </Link>

      <PageTitle
        title={shop.name}
        intro={
          <>
            <span className="flex flex-wrap items-center gap-2">
              <StatusPill status={shop.status} />
              {isNewShop(shop.createdAt, now) ? <NewPill /> : null}
              <span>
                Joined {formatDate(shop.createdAt)} · last active <TimeAgo value={shop.lastActiveAt} now={now} />
              </span>
            </span>
            <span className="mt-1 block">
              {[place || null, shop.currency.toUpperCase(), shop.timezone].filter(Boolean).join(" · ")}
            </span>
          </>
        }
      />

      {shop.status === "closing" && shop.deletionPurgeAfter ? (
        <div className="mb-6 flex gap-3 rounded-lg border border-status-overdue/40 bg-status-overdue-bg px-4 py-3.5 text-status-overdue-fg">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p className="text-[15px] leading-6">
            <strong className="font-semibold">This shop is being deleted.</strong> The owner asked{" "}
            {shop.deletionRequestedAt ? <TimeAgo value={shop.deletionRequestedAt} now={now} /> : "earlier"}. Everything is removed{" "}
            {daysFromNow(shop.deletionPurgeAfter, now)} ({formatDate(shop.deletionPurgeAfter)}), and every login stays switched off until then. The
            owner can still keep the shop from the link in the email they were sent.
          </p>
        </div>
      ) : null}

      <section aria-label="Owner" className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-hover">
            <UserRound aria-hidden="true" className="size-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Owner</p>
            <p className="break-words text-[15px] font-semibold">
              {shop.owner ? `${shop.owner.name} · ${shop.owner.email}` : "No owner login"}
            </p>
            {shop.phone || shop.email ? (
              <p className="break-words text-sm text-muted-foreground">
                Shop contact: {[shop.phone, shop.email].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {shop.owner ? (
            <a
              href={`mailto:${shop.owner.email}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-[15px] font-semibold hover:bg-surface-hover"
            >
              <Mail aria-hidden="true" className="size-4" />
              Email the owner
            </a>
          ) : null}
          <a
            href={`/s/${encodeURIComponent(shop.slug)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-[15px] font-semibold hover:bg-surface-hover"
          >
            Public page
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </a>
        </div>
      </section>

      <section aria-label="Usage" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Users} label="Customers" value={formatCount(usage.customers)} />
        <StatTile icon={Wrench} label="Repairs" value={formatCount(usage.repairs)} detail={`${formatCount(usage.repairs30)} in the last 30 days`} />
        <StatTile icon={FileText} label="Invoices" value={formatCount(usage.invoices)} detail={`${formatCount(usage.invoices30)} in the last 30 days`} />
        <StatTile icon={Package} label="Products" value={formatCount(usage.products)} />
        <StatTile
          icon={CreditCard}
          label="Payments taken"
          value={formatMoney(usage.payments.cents, shop.currency)}
          detail={
            <>
              {formatMoney(usage.payments30.cents, shop.currency)} in the last 30 days
              <span className="block">{count(usage.payments.count, "payment")} in all, before refunds</span>
              {usage.refunds.count > 0 ? (
                <span className="block">
                  {formatMoney(usage.refunds.cents, shop.currency)} refunded ({count(usage.refunds.count, "refund")})
                </span>
              ) : null}
            </>
          }
        />
        <StatTile
          icon={Users}
          label="Staff logins"
          value={formatCount(shop.staff.filter((person) => person.active).length)}
          detail={`of ${count(shop.staff.length, "login")}`}
        />
        <StatTile icon={Building2} label="Branches" value={formatCount(usage.locations)} detail="Open locations" />
        <StatTile
          icon={Plug}
          label="Connections"
          value={connections.length === 0 ? "None" : formatCount(connections.length)}
          detail={connections.length === 0 ? "No card payments, accounting or API keys set up" : connections.join(" · ")}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <SpacePanel shop={shop} now={now} countedAt={storage.countedAt} />
        <StaffPanel shop={shop} now={now} />
      </div>

      <Panel id="activity" title="Recent activity" detail="The newest 40 events from this shop's activity log." className="mt-4">
        <ActivityList items={shop.activity} now={now} showShop={false} empty="This shop has no activity yet." />
      </Panel>

      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        This page only reads. Nothing here changes the shop: its owner manages staff, settings and deletion from their own Settings, and Count again only
        measures space.
      </p>
    </ConsoleShell>
  );
}
