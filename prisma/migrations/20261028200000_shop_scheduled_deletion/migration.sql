-- Scheduled shop deletion (lib/account-deletion). All nullable or defaulted,
-- so existing rows need no backfill.
ALTER TABLE "Shop" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN "deletionPurgeAfter" TIMESTAMP(3),
ADD COLUMN "deletionRequestedById" TEXT,
ADD COLUMN "deletionSuspendedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "deletionSuspendedApiKeyIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Shop_deletionPurgeAfter_idx" ON "Shop"("deletionPurgeAfter");
