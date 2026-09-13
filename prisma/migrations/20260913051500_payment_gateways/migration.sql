ALTER TABLE "Payment"
  ADD COLUMN "gateway" TEXT,
  ADD COLUMN "gatewayPaymentId" TEXT,
  ADD COLUMN "gatewayChargeId" TEXT,
  ADD COLUMN "gatewaySource" TEXT;

CREATE UNIQUE INDEX "Payment_gateway_gatewayPaymentId_key"
  ON "Payment"("gateway", "gatewayPaymentId");
