-- Phones running the iOS / Android app that registered for native push.
CREATE TABLE "NativePushDevice" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativePushDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NativePushDevice_platform_check" CHECK ("platform" IN ('ios', 'android'))
);
CREATE UNIQUE INDEX "NativePushDevice_token_key" ON "NativePushDevice"("token");
CREATE INDEX "NativePushDevice_shopId_userId_idx" ON "NativePushDevice"("shopId", "userId");
ALTER TABLE "NativePushDevice" ADD CONSTRAINT "NativePushDevice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NativePushDevice" ADD CONSTRAINT "NativePushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
