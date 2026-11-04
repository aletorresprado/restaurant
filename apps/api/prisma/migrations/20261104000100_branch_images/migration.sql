ALTER TABLE "Branch" ADD COLUMN "imageData" BYTEA,
 ADD COLUMN "imageMime" VARCHAR(20), ADD COLUMN "imageVersion" UUID;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_image_check" CHECK (
 ("imageData" IS NULL AND "imageMime" IS NULL AND "imageVersion" IS NULL) OR
 ("imageData" IS NOT NULL AND "imageMime" IS NOT NULL AND "imageVersion" IS NOT NULL
 AND octet_length("imageData") BETWEEN 1 AND 2097152
 AND "imageMime" IN ('image/jpeg', 'image/png', 'image/webp'))
);
