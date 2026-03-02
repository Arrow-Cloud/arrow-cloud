-- AlterTable
ALTER TABLE "User" ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shadowBanned" BOOLEAN NOT NULL DEFAULT false;
