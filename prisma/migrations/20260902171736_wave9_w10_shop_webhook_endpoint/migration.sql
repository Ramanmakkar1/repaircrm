-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "stripeWebhookAt" TIMESTAMP(3),
ADD COLUMN     "stripeWebhookError" TEXT,
ADD COLUMN     "stripeWebhookId" TEXT,
ADD COLUMN     "stripeWebhookSecret" TEXT,
ADD COLUMN     "stripeWebhookUrl" TEXT;
