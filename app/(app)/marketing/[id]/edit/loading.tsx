import { Skeleton } from "@/components/ui/skeleton";

/** The campaign form: settings above, message body and preview below. */
export default function EditCampaignLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-44" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-56 rounded-lg" />
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
