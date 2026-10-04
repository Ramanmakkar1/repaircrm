ALTER TABLE "Shop" ADD COLUMN "logoPath" TEXT, ADD COLUMN "logoStorage" TEXT, ADD COLUMN "pushPublicKey" TEXT, ADD COLUMN "pushPrivateKey" TEXT;
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT, ADD COLUMN "pinVersion" TEXT;
CREATE TABLE "PushSubscription" (
 "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "endpoint" TEXT NOT NULL, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL,
 "lastCounts" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_shopId_userId_idx" ON "PushSubscription"("shopId", "userId");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
