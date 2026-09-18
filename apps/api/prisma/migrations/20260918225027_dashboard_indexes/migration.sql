-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_issuedAt_idx" ON "Invoice"("organizationId", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "Payment_organizationId_status_paidAt_idx" ON "Payment"("organizationId", "status", "paidAt");
