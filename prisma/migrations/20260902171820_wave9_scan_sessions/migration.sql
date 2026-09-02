-- CreateTable
CREATE TABLE "ScanSession" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Register',
    "pairedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "format" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanSession_code_key" ON "ScanSession"("code");

-- CreateIndex
CREATE INDEX "ScanSession_shopId_expiresAt_idx" ON "ScanSession"("shopId", "expiresAt");

-- CreateIndex
CREATE INDEX "ScanSession_userId_createdAt_idx" ON "ScanSession"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScanEvent_seq_key" ON "ScanEvent"("seq");

-- CreateIndex
CREATE INDEX "ScanEvent_sessionId_seq_idx" ON "ScanEvent"("sessionId", "seq");

-- CreateIndex
CREATE INDEX "ScanEvent_shopId_createdAt_idx" ON "ScanEvent"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "ScanSession" ADD CONSTRAINT "ScanSession_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanSession" ADD CONSTRAINT "ScanSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScanSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
