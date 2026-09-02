import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

/**
 * The inbox groups a status count over every lead in the shop before it can
 * light a single filter pill, so the pills and the card grid go up first.
 */
export default function LeadsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton filters={6} />

      <CardGridSkeleton count={6} height="h-[248px]" />
    </div>
  );
}
