CREATE TABLE "AutomaticProductPhoto" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "lookupKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "searchedAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "leaseToken" TEXT,
    "storage" TEXT,
    "path" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "author" TEXT,
    "sourceUrl" TEXT,
    "license" TEXT,
    "licenseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomaticProductPhoto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomaticProductPhoto_productId_key" ON "AutomaticProductPhoto"("productId");
CREATE INDEX "AutomaticProductPhoto_shopId_searchedAt_idx" ON "AutomaticProductPhoto"("shopId", "searchedAt");
ALTER TABLE "AutomaticProductPhoto" ADD CONSTRAINT "AutomaticProductPhoto_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
