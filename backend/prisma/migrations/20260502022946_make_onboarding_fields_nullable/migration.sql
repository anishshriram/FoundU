-- AlterTable
ALTER TABLE "users" ALTER COLUMN "photo_url" DROP NOT NULL,
ALTER COLUMN "age" DROP NOT NULL,
ALTER COLUMN "gender_identity" DROP NOT NULL,
ALTER COLUMN "gender_preference" DROP NOT NULL,
ALTER COLUMN "age_range_min" DROP NOT NULL,
ALTER COLUMN "age_range_max" DROP NOT NULL;
