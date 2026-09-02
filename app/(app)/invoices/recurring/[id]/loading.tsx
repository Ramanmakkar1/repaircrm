import { DocumentDetailSkeleton } from "@/components/billing/skeletons";

/**
 * No right-hand aside on a schedule: the body is the line table beside the
 * per-run total, with the generated-invoice table underneath.
 */
export default function ScheduleDetailLoading() {
  return <DocumentDetailSkeleton aside={false} />;
}
