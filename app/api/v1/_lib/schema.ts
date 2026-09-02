import { z } from "zod";

/**
 * Small shared validators for the v1 write endpoints.
 *
 * `isoDate` accepts anything `Date.parse` understands and reports the rest as a
 * caller error, rather than letting `new Date("next tuesday")` become an
 * `Invalid Date` that Prisma rejects with a stack trace. Both a full timestamp
 * and a bare `YYYY-MM-DD` are accepted — an integration syncing a due date
 * usually has the day and not the hour.
 */
export const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be an ISO 8601 date or date-time",
  });

/** Cents are always whole numbers, and never negative on an inbound write. */
export const cents = z.number().int().min(0);
