import { BillingListSkeleton } from "@/components/billing/skeletons";

/** No status filters on this list — a back-link, the header, then the cards. */
export default function RecurringLoading() {
  return (
    <div className="flex flex-col gap-6">
      <BillingListSkeleton cards={3} />
    </div>
  );
}
