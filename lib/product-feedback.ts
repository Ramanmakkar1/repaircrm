import { z } from "zod";

export const FEEDBACK_KINDS = [
  { value: "BUG", label: "Report a bug" },
  { value: "FEATURE", label: "Request a feature" },
  { value: "OTHER", label: "Other feedback" },
] as const;
export const FEEDBACK_STATUSES = ["NEW", "IN_REVIEW", "CLOSED"] as const;
export const FEEDBACK_STATUS_LABELS = { NEW: "New", IN_REVIEW: "In review", CLOSED: "Closed" } as const;
export const feedbackSchema = z.object({
  kind: z.enum(["BUG", "FEATURE", "OTHER"]),
  title: z.string().trim().min(5, "Give your report a short title (at least 5 characters).").max(120, "Keep the title under 120 characters."),
  detail: z.string().trim().min(15, "Add a little more detail (at least 15 characters).").max(4000, "Keep your description under 4,000 characters."),
  email: z.union([z.literal(""), z.email("Enter a valid email address or leave it blank.").max(254)]),
  page: z.string().trim().max(200, "Keep the page reference under 200 characters."),
});
export type FeedbackValues = z.infer<typeof feedbackSchema>;
export type FeedbackState = { error?: string; success?: boolean; values?: FeedbackValues };
