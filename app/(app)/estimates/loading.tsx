import { BillingListSkeleton } from "@/components/billing/skeletons";

/** Six status pills (All + five statuses) above a three-up card grid. */
export default function EstimatesLoading() {
  return <BillingListSkeleton filters={6} />;
}
