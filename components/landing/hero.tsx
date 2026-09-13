import Image from "next/image";
import Link from "next/link";

import { RepairPilotMark, RepairPilotWordmark } from "@/components/brand/repairpilot";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "./icons";
import { BrowserFrame } from "./shot";

function DashboardPreview() {
  const repairs = [
    { number: "#1041", title: "MacBook Air · Won't charge", status: "In progress", color: "bg-status-in-progress" },
    { number: "#1042", title: "iPhone 13 · Screen repair", status: "Ready for pickup", color: "bg-status-ready" },
    { number: "#1043", title: "ThinkPad X1 · Liquid damage", status: "New", color: "bg-status-new" },
  ];

  return (
    <div
      role="img"
      aria-label="Dashboard preview showing four repair metrics, the latest work orders and customer follow-ups"
      className="grid min-h-[390px] bg-background md:grid-cols-[170px_minmax(0,1fr)]"
    >
      <aside aria-hidden="true" className="hidden border-r border-border bg-surface p-4 md:block">
        <div className="flex items-center gap-2">
          <RepairPilotMark className="size-7 rounded-sm shadow-none" />
          <RepairPilotWordmark className="text-[12px] text-foreground" />
        </div>
        <p className="mb-2 mt-8 text-[9px] font-bold uppercase tracking-[0.14em] text-faint-foreground">Work</p>
        {["Dashboard", "Tickets", "Customers", "Appointments"].map((item, index) => (
          <div
            key={item}
            className={index === 0
              ? "mb-1 flex items-center gap-2 rounded-sm bg-accent px-2 py-2 text-[10px] font-semibold text-accent-foreground"
              : "mb-1 flex items-center gap-2 rounded-sm px-2 py-2 text-[10px] font-medium text-muted-foreground"}
          >
            <span aria-hidden="true" className={index === 0 ? "size-1.5 rounded-full bg-white" : "size-1.5 rounded-full bg-border-strong"} />
            {item}
          </div>
        ))}
        <p className="mb-2 mt-6 text-[9px] font-bold uppercase tracking-[0.14em] text-faint-foreground">Money</p>
        {["Invoices", "Inventory", "Reports"].map((item) => (
          <div key={item} className="mb-1 rounded-sm px-2 py-2 text-[10px] font-medium text-muted-foreground">{item}</div>
        ))}
      </aside>

      <div className="min-w-0 p-4 sm:p-6">
        <div aria-hidden="true" className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-[10px] font-medium text-muted-foreground">Search repairs, customers…</span>
          <span className="rounded-sm bg-accent px-2.5 py-1.5 text-[9px] font-semibold text-accent-foreground">+ New repair</span>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[17px] font-semibold tracking-tight text-foreground">Dashboard</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Your shop at a glance</p>
          </div>
          <span className="text-[9px] font-medium text-faint-foreground">TODAY</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
          {[
            ["Open repairs", "09", "Active work orders"],
            ["Due today", "02", "Promised back today"],
            ["Customer replies", "03", "Waiting on your team"],
            ["Outstanding", "$1,084", "4 unpaid invoices"],
          ].map(([label, value, hint]) => (
            <div key={label} className="min-w-0 rounded-md border border-border bg-surface p-3">
              <p className="truncate text-[9px] font-medium text-muted-foreground">{label}</p>
              <p className="mt-1.5 text-[19px] font-semibold leading-none tracking-tight text-foreground">{value}</p>
              <p className="mt-1.5 truncate text-[8px] text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(140px,0.8fr)]">
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <p className="text-[10px] font-semibold text-foreground">Recent repairs</p>
              <span className="text-[8px] font-semibold text-muted-foreground">View all →</span>
            </div>
            {repairs.map((repair) => (
              <div key={repair.number} className="flex items-center justify-between gap-2 border-b border-border last:border-0 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-semibold text-foreground">{repair.title}</p>
                  <p className="mt-0.5 text-[8px] text-muted-foreground">{repair.number} · Updated recently</p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[8px] font-medium text-muted-foreground">
                  <span aria-hidden="true" className={"size-1.5 rounded-full " + repair.color} />
                  {repair.status}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-border bg-surface p-3">
            <p className="text-[10px] font-semibold text-foreground">Needs attention</p>
            {[
              ["Overdue repairs", "01"],
              ["Customer replies", "03"],
              ["Ready for pickup", "02"],
            ].map(([label, count]) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-border py-2.5 last:border-0">
                <span className="truncate text-[8.5px] font-medium text-muted-foreground">{label}</span>
                <span className="text-[10px] font-semibold tabular-nums text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative">
      <div className="relative isolate min-h-[560px] overflow-hidden bg-[#111214] sm:min-h-[620px]">
        <Image
          src="/marketing/repair-bench.jpg"
          alt="A technician repairing a phone at a clean, well-equipped workbench."
          fill
          priority
          sizes="100vw"
          className="object-cover object-[67%_center]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-black/45" />

        <div className="relative mx-auto flex min-h-[560px] w-full max-w-6xl items-end px-5 pb-36 pt-24 sm:min-h-[620px] sm:px-8 sm:pb-40">
          <div className="max-w-2xl text-white">
            <span className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-black/30 px-3 py-1.5 text-[12.5px] font-semibold text-white/90 backdrop-blur-sm">
              <span className="size-1.5 rounded-full bg-white" />
              Repair shop CRM · $0 during early access
            </span>

            <h1 className="mt-5 text-balance text-[42px] font-bold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[68px]">
              Run every repair from intake to pickup.
            </h1>

            <p className="mt-5 max-w-xl text-pretty text-[16px] leading-relaxed text-white/80 sm:text-lg">
              Keep the diagnosis, parts, estimate, customer approval and invoice
              together on the job, so everyone knows what happens next.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-white text-neutral-950 hover:bg-neutral-100 sm:w-auto"
              >
                <Link href="/signup">
                  Start free
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:w-auto"
              >
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
            <p className="mt-3 text-[13px] text-white/65">
              No credit card. Set up your shop and get started.
            </p>
          </div>
        </div>
      </div>

      <div className="relative mx-auto -mt-24 w-full max-w-5xl px-5 sm:-mt-28 sm:px-8">
        <BrowserFrame hero url="app.repairpilot.com/dashboard">
          <DashboardPreview />
        </BrowserFrame>
      </div>
      <p className="mx-auto mt-5 max-w-5xl px-5 text-[12px] font-medium text-faint-foreground sm:px-8">
        Product preview · illustrative sample shop data.
      </p>

      <section
        id="how-it-works"
        className="mx-auto mt-12 grid w-full max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:mt-16 sm:grid-cols-4"
      >
        <h2 className="sr-only">A repair from check-in to pickup</h2>
        {[
          ["01", "Check in"],
          ["02", "Diagnose & assign"],
          ["03", "Approve & update"],
          ["04", "Invoice & hand back"],
        ].map(([number, label]) => (
          <div key={number} className="bg-[#111214] px-4 py-4 sm:px-5 sm:py-5">
            <p className="rf-nums text-[11px] font-semibold tracking-[0.12em] text-white/45">
              {number}
            </p>
            <p className="mt-2 text-[13.5px] font-semibold tracking-tight text-white sm:text-[14px]">
              {label}
            </p>
          </div>
        ))}
      </section>
    </section>
  );
}
