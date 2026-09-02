import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * A form, not the hub — without this the boundary above would flash the
 * customer *hub* skeleton over what is really one card of inputs.
 */
export default function EditCustomerLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeaderSkeleton />

      <Skeleton className="h-[320px] rounded-lg" />
      <Skeleton className="h-[280px] rounded-lg" />
    </div>
  );
}
