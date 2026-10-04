CREATE TABLE "ProductFeedback" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "email" TEXT,
  "page" TEXT,
  "reporterUserId" TEXT,
  "reporterShopId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductFeedback_kind_check" CHECK ("kind" IN ('BUG', 'FEATURE', 'OTHER')),
  CONSTRAINT "ProductFeedback_status_check" CHECK ("status" IN ('NEW', 'IN_REVIEW', 'CLOSED'))
);
CREATE INDEX "ProductFeedback_status_createdAt_idx" ON "ProductFeedback"("status", "createdAt");
