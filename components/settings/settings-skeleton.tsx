import { Skeleton } from "@/components/ui/skeleton";
import { groupPanels, OWNER_PANELS } from "./settings-panels";

/**
 * What Settings shows while its fourteen queries and two Stripe round trips
 * finish — the slowest first paint in the app, so it is worth getting right.
 *
 * It draws the SAME shell the page lands in, in both modes, so the real panel
 * replaces the grey instead of shunting sideways:
 *
 * - Easy mode (the default): a centred `max-w-5xl` column, the title, then the
 *   hub a fresh visit opens on: each of the five area headings over its row of
 *   picture tiles (one grey tile per real tile).
 * - Full mode: the 208px side rail with the cards beside it.
 *
 * The number of tiles comes from the real section list, so adding or merging a
 * section cannot leave the skeleton drawing the wrong grid. Pure markup, no
 * hooks: it renders from `loading.tsx` on the server.
 */

/**
 * The title and one line of `PageHeader`, in grey. Drawn here rather than with
 * the shared `PageHeaderSkeleton` because that one reserves a 44px icon tile
 * the Settings header does not have (the title would slide left when the page
 * lands) and is 6px taller than the real 24px title plus its 14px line.
 */
function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-1 pb-1">
      <Skeleton className="h-[27px] w-36" />
      {/* The real line wraps to two on a phone, so reserve two there. */}
      <div className="flex h-[46px] flex-col justify-center gap-2 sm:h-[23px]">
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-4 w-40 sm:hidden" />
      </div>
    </div>
  );
}

function EasySettingsSkeleton() {
  const groups = groupPanels(OWNER_PANELS);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <HeaderSkeleton />

      {/* The hub: same headings, same grid and the same tile height as SettingsHub. */}
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-3">
            <Skeleton className="h-6 w-28" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((panel) => (
                <Skeleton key={panel.value} data-hub-tile-skeleton="" className="h-24 rounded-2xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FullSettingsSkeleton() {
  // Rows per group, from the real list (4, 2, 1, 5, 2 today).
  const rowsPerGroup = groupPanels(OWNER_PANELS).map((group) => group.items.length);

  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        {/* The rail: five groups on a laptop, a strip of pills on a phone. */}
        <div className="flex shrink-0 gap-1 overflow-hidden lg:w-52 lg:flex-col lg:gap-4">
          {rowsPerGroup.map((rows, group) => (
            <div key={group} className="flex shrink-0 gap-1 lg:flex-col">
              <Skeleton className="hidden h-4 w-20 lg:block" />
              {Array.from({ length: rows }, (_, row) => (
                <Skeleton key={row} className="h-8 w-28 rounded-md lg:w-full" />
              ))}
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton({ simple }: { simple: boolean }) {
  return simple ? <EasySettingsSkeleton /> : <FullSettingsSkeleton />;
}
