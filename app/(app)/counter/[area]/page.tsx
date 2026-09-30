import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { TOUCH_WORKSPACES, workspaceActions } from "@/lib/touch-workspace";

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  return { title: `${TOUCH_WORKSPACES[area]?.title ?? "Workspace"} · Repairs helper` };
}

export default async function TaskWorkspace({ params }: { params: Promise<{ area: string }> }) {
  const [{ area }, user] = await Promise.all([params, requireUser()]);
  const workspace = TOUCH_WORKSPACES[area];
  if (!workspace) notFound();
  const actions = workspaceActions(workspace, user.role);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
      <div><h1 className="text-[30px] font-semibold tracking-tight sm:text-[36px]">{workspace.title}</h1><p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">{workspace.description}</p></div>
      {workspace.steps.length ? <ol aria-label={`${workspace.title} workflow`} className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground">
        {workspace.steps.map((step, index) => <li key={step} className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-full border border-border text-xs font-semibold">{index + 1}</span>{step}</li>)}
      </ol> : null}
      <ul className="grid gap-4 sm:grid-cols-2">
        {actions.map((action, index) => <li key={action.href}>
          <Link href={action.href} className="flex h-full min-h-[148px] items-start gap-4 rounded-xl border border-border bg-white p-5 transition-colors hover:border-[#006aff] active:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6">
            <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-[#006aff]">{index === 0 ? <ArrowRight className="size-5" aria-hidden /> : <ChevronRight className="size-5" aria-hidden />}</span>
            <span><span className="block text-xl font-semibold">{action.label}</span><span className="mt-3 block text-base leading-relaxed text-muted-foreground">{action.description}</span></span>
          </Link>
        </li>)}
      </ul>
    </div>
  );
}
