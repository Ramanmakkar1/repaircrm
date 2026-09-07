-- The day of the month a recurring schedule is anchored to.
--
-- Until now the cadence re-derived its anchor from the previous run date. That
-- date has already been clamped to fit a short month, so the clamp fed itself
-- and the anchor decayed permanently:
--
--     31 Jan -> 28 Feb -> 28 Mar -> 28 Apr -> ...
--
-- A shop billing on the last day of the month was billed on the 28th from its
-- first February onwards, three days early, forever.
ALTER TABLE "RecurringInvoice" ADD COLUMN "anchorDay" INTEGER;

-- Backfill.
--
-- `nextRunAt` is the best evidence available for an existing schedule, and for
-- the overwhelming majority it is exactly right — the decay only shows up once
-- a schedule has actually crossed a short month.
--
-- A schedule already sitting on the 28th/29th/30th of a month that HAS a 31st
-- is the ambiguous case: it may be a genuine 28th-of-the-month contract, or it
-- may be a decayed month-end one. We anchor it where it currently sits, which
-- keeps every existing customer's billing date exactly where it is today. That
-- is the conservative choice: this migration must not move anybody's bill. A
-- shop that wants a decayed schedule restored to month-end edits the run date,
-- which re-anchors it.
--
-- WEEKLY schedules step seven days and never clamp, so they keep NULL rather
-- than a number that would mean nothing.
UPDATE "RecurringInvoice"
SET "anchorDay" = EXTRACT(DAY FROM "nextRunAt" AT TIME ZONE 'UTC')::INTEGER
WHERE "frequency" <> 'WEEKLY';
