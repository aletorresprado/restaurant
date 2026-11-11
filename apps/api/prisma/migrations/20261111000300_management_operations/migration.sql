CREATE TABLE "WriteOperation" (
  "actorId" UUID NOT NULL,
  "operationId" UUID NOT NULL,
  "kind" VARCHAR(30) NOT NULL,
  "scope" VARCHAR(100) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "resultId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WriteOperation_pkey" PRIMARY KEY ("actorId", "operationId"),
  CONSTRAINT "WriteOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
