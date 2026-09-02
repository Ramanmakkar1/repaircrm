import { Skeleton } from "@/components/ui/skeleton";

/** Hero card, the settings/preview pair, then the sends table. */
export default function CampaignLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-56 rounded-lg" />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>

      <Skeleton className="h-80 rounded-lg" />
    </div>
  );
}
