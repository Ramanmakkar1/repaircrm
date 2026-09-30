-- Additive: existing ticket and customer attachments remain unchanged.
ALTER TABLE "Attachment" ADD COLUMN "productId" TEXT;
CREATE INDEX "Attachment_productId_idx" ON "Attachment"("productId");
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
