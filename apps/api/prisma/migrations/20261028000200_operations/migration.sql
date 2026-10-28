-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'OUT_OF_SERVICE');

-- CreateTable
CREATE TABLE "RestaurantTable" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tableNumber" VARCHAR(10) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "tableStatus" "TableStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableBlock" (
    "id" UUID NOT NULL,
    "tableId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchSchedule" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openingTime" VARCHAR(5) NOT NULL,
    "closingTime" VARCHAR(5) NOT NULL,
    "reservationIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BranchSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchScheduleException" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "openingTime" VARCHAR(5),
    "closingTime" VARCHAR(5),
    "reason" TEXT,

    CONSTRAINT "BranchScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_branchId_tableNumber_key" ON "RestaurantTable"("branchId", "tableNumber");

-- CreateIndex
CREATE INDEX "TableBlock_tableId_startAt_endAt_idx" ON "TableBlock"("tableId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "BranchSchedule_branchId_dayOfWeek_key" ON "BranchSchedule"("branchId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "BranchScheduleException_branchId_date_key" ON "BranchScheduleException"("branchId", "date");

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableBlock" ADD CONSTRAINT "TableBlock_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchSchedule" ADD CONSTRAINT "BranchSchedule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchScheduleException" ADD CONSTRAINT "BranchScheduleException_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep core invariants even if data is written outside the HTTP API.
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_capacity_check" CHECK ("capacity" BETWEEN 1 AND 50);
ALTER TABLE "TableBlock" ADD CONSTRAINT "TableBlock_interval_check" CHECK ("endAt" > "startAt");
ALTER TABLE "BranchSchedule" ADD CONSTRAINT "BranchSchedule_hours_check" CHECK (
  "dayOfWeek" BETWEEN 1 AND 7 AND "reservationIntervalMinutes" BETWEEN 15 AND 120
  AND "openingTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "closingTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "openingTime" <> "closingTime"
);
ALTER TABLE "BranchScheduleException" ADD CONSTRAINT "BranchScheduleException_hours_check" CHECK (
  "isClosed" OR ("openingTime" IS NOT NULL AND "closingTime" IS NOT NULL
    AND "openingTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "closingTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "openingTime" <> "closingTime")
);
