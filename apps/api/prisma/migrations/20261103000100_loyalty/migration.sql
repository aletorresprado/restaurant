ALTER TABLE "User" ADD COLUMN "loyaltyBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_loyaltyBalance_check" CHECK ("loyaltyBalance" >= 0);
CREATE TABLE "LoyaltyMovement" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "actorId" UUID,
 "sourceKey" TEXT NOT NULL, "kind" VARCHAR(20) NOT NULL,
 "requestedPoints" INTEGER NOT NULL, "points" INTEGER NOT NULL,
 "balanceAfter" INTEGER NOT NULL, "reason" TEXT, "reservationId" UUID,
 "rating" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LoyaltyMovement_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "LoyaltyMovement_balance_check" CHECK ("balanceAfter" >= 0),
 CONSTRAINT "LoyaltyMovement_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
 CONSTRAINT "LoyaltyMovement_kind_check" CHECK ("kind" IN ('ATTENDANCE','NO_SHOW','SURVEY','ADJUSTMENT')),
 CONSTRAINT "LoyaltyMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "LoyaltyMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LoyaltyMovement_sourceKey_key" ON "LoyaltyMovement"("sourceKey");
CREATE INDEX "LoyaltyMovement_userId_createdAt_idx" ON "LoyaltyMovement"("userId", "createdAt");
