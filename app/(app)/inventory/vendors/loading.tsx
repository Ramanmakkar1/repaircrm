import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

/** Vendors are a 3-up card grid behind one count query. */
export default function VendorsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={6} height="h-[236px]" />
    </div>
  );
}
