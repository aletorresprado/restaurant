-- Nullable for historical reservations and legacy API clients.
ALTER TABLE "Reservation" ADD COLUMN "operationId" UUID;
CREATE UNIQUE INDEX "Reservation_userId_operationId_key" ON "Reservation"("userId", "operationId");
