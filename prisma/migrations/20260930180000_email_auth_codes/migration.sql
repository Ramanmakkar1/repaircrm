CREATE TABLE "EmailAuthCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailAuthCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmailAuthCode_challenge_key" ON "EmailAuthCode"("challenge");
CREATE UNIQUE INDEX "EmailAuthCode_email_purpose_key" ON "EmailAuthCode"("email", "purpose");
CREATE INDEX "EmailAuthCode_expiresAt_idx" ON "EmailAuthCode"("expiresAt");
