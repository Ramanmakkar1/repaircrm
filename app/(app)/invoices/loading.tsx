import { BillingListSkeleton } from "@/components/billing/skeletons";

/** Six status pills, and two header actions — "Recurring" and "New invoice". */
export default function InvoicesLoading() {
  return <BillingListSkeleton filters={6} actions={2} />;
}
