import { PageHeaderSkeleton, RecordCardsSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The fallback for any screen without a loading screen of its own: a title,
 * a row of view pills, a search field and a page of cards, in grey, at the
 * sizes the finished list screens use. A tap shows this at once, so the person
 * sees the app answered while the shop's data loads.
 */
export default function AppLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-5">
      <PageHeaderSkeleton filters={4} />
      <Skeleton className="h-14 w-full max-w-xl rounded-xl" />
      <RecordCardsSkeleton count={6} />
    </div>
  );
}
