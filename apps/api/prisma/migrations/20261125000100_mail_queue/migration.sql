CREATE TABLE "MailJob" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "payload" TEXT,
  "tokenHash" CHAR(64),
  "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MailJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailJob_status_check" CHECK ("status" IN ('pending', 'sent', 'failed', 'cancelled')),
  CONSTRAINT "MailJob_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5)
);
CREATE INDEX "MailJob_status_availableAt_idx" ON "MailJob"("status", "availableAt");
CREATE INDEX "MailJob_finishedAt_idx" ON "MailJob"("finishedAt");
