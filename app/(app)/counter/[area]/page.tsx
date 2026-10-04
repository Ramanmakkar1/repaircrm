import { notFound } from "next/navigation";
import { FileUp, MessageCircle, Plus, Search, type LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { locationWhere } from "@/lib/location";
import { requestNow } from "@/lib/now";
import { hubTilePhoto, TOUCH_WORKSPACES, workspaceActions, workspacePhoto, type HubMark } from "@/lib/touch-workspace";
import { PictureTile } from "@/components/counter/picture-tile";
import { PhotoVisual } from "@/components/ui/record-card";
import { hubCountKeys, hubCountWords, loadHubCounts } from "./hub-counts";

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  return { title: `${TOUCH_WORKSPACES[area]?.title ?? "Workspace"} · Repairs helper` };
}

/** Round marks that tell look-alike pictures apart by shape: add, find, ask, import. */
const MARKS: Record<HubMark, LucideIcon> = { add: Plus, find: Search, ask: MessageCircle, import: FileUp };

/**
 * A second-level hub (Money, Stock, More tools, ...): the same picture tiles
 * as Home, so going one level in never feels like a different app. Every tile
 * on a hub has its own picture, and the tiles that lead to work waiting on
 * someone carry the live number ("5 unpaid", "2 ready").
 */
export default async function TaskWorkspace({ params }: { params: Promise<{ area: string }> }) {
  const [{ area }, user, branch] = await Promise.all([params, requireUser(), locationWhere()]);
  const workspace = TOUCH_WORKSPACES[area];
  if (!workspace) notFound();
  const actions = workspaceActions(workspace, user.role);
  const hero = workspacePhoto(area);
  const counts = await loadHubCounts(hubCountKeys(actions, user.role), user, branch, requestNow());

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex items-center gap-4 sm:gap-5">
        <PhotoVisual src={hero} className="size-24 sm:size-28" />
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-9 tracking-tight">{workspace.title}</h1>
          <p className="mt-1 max-w-xl text-base leading-snug text-muted-foreground">{workspace.description}</p>
        </div>
      </header>
      {workspace.steps.length ? (
        <ol aria-label={`${workspace.title} steps`} className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] text-muted-foreground">
          {workspace.steps.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full border border-border text-xs font-semibold">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {actions.map((action) => {
          const count = action.count ? counts[action.count] : undefined;
          const words = action.count && typeof count === "number" ? hubCountWords(action.count, count) : null;
          // Waiting work is a pill with its word on the picture; anything else is the tile's live line.
          const alert = action.alert && count ? words ?? undefined : undefined;
          const detail = !action.alert && words && count ? words : action.description;
          return (
            <li key={`${action.href}|${action.label}`}>
              <PictureTile
                href={action.href}
                title={action.label}
                detail={detail}
                photo={hubTilePhoto(action, hero)}
                alert={alert}
                mark={action.mark ? MARKS[action.mark] : undefined}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
