ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
CREATE TYPE "AccountActionPurpose" AS ENUM ('RESET_PASSWORD', 'VERIFY_EMAIL');
CREATE TABLE "AccountActionToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "purpose" "AccountActionPurpose" NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountActionToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountActionToken_tokenHash_key" ON "AccountActionToken"("tokenHash");
CREATE UNIQUE INDEX "AccountActionToken_userId_purpose_key" ON "AccountActionToken"("userId", "purpose");
CREATE INDEX "AccountActionToken_expiresAt_idx" ON "AccountActionToken"("expiresAt");
