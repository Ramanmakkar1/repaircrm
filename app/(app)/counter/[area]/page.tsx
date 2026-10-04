import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { actionPhoto, TOUCH_WORKSPACES, workspaceActions, workspacePhoto } from "@/lib/touch-workspace";
import { PictureTile } from "@/components/counter/picture-tile";
import { PhotoVisual } from "@/components/ui/record-card";

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  return { title: `${TOUCH_WORKSPACES[area]?.title ?? "Workspace"} · Repairs helper` };
}

/**
 * A second-level hub (Money, More tools, ...): the same picture tiles as Home,
 * so going one level in never feels like a different app.
 */
export default async function TaskWorkspace({ params }: { params: Promise<{ area: string }> }) {
  const [{ area }, user] = await Promise.all([params, requireUser()]);
  const workspace = TOUCH_WORKSPACES[area];
  if (!workspace) notFound();
  const actions = workspaceActions(workspace, user.role);
  const hero = workspacePhoto(area);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex items-center gap-4 sm:gap-5">
        <PhotoVisual src={hero} className="size-24 sm:size-28" />
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight sm:text-[32px]">{workspace.title}</h1>
          <p className="mt-1 max-w-xl text-base leading-snug text-muted-foreground">{workspace.description}</p>
        </div>
      </header>
      {workspace.steps.length ? (
        <ol aria-label={`${workspace.title} steps`} className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {workspace.steps.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full border border-border text-xs font-semibold">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {actions.map((action) => (
          <li key={`${action.href}|${action.label}`}>
            <PictureTile href={action.href} title={action.label} detail={action.description} photo={actionPhoto(action.href, hero)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
