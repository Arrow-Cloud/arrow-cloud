-- AlterTable
ALTER TABLE "Pack" ADD COLUMN     "popularity" DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN     "popularityUpdatedAt" TIMESTAMP(3);
