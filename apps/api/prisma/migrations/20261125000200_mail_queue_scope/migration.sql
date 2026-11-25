ALTER TABLE "MailJob" ADD COLUMN "scope" VARCHAR(64) NOT NULL DEFAULT 'main';
DROP INDEX "MailJob_status_availableAt_idx";
CREATE INDEX "MailJob_scope_status_availableAt_idx" ON "MailJob"("scope", "status", "availableAt");
