/*
  Warnings:

  - You are about to drop the column `artist` on the `Chart` table. All the data in the column will be lost.
  - You are about to drop the column `rating` on the `Chart` table. All the data in the column will be lost.
  - You are about to drop the column `songName` on the `Chart` table. All the data in the column will be lost.
  - You are about to drop the column `stepartist` on the `Chart` table. All the data in the column will be lost.
  - You are about to drop the `ChartPack` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_ChartPack` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ChartPack" DROP CONSTRAINT "ChartPack_chartHash_fkey";

-- DropForeignKey
ALTER TABLE "ChartPack" DROP CONSTRAINT "ChartPack_packId_fkey";

-- DropForeignKey
ALTER TABLE "_ChartPack" DROP CONSTRAINT "_ChartPack_A_fkey";

-- DropForeignKey
ALTER TABLE "_ChartPack" DROP CONSTRAINT "_ChartPack_B_fkey";

-- AlterTable
ALTER TABLE "Chart" DROP COLUMN "artist",
DROP COLUMN "rating",
DROP COLUMN "songName",
DROP COLUMN "stepartist",
ADD COLUMN     "chartBpms" TEXT,
ADD COLUMN     "chartName" TEXT,
ADD COLUMN     "credit" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "difficulty" TEXT,
ADD COLUMN     "meter" INTEGER,
ADD COLUMN     "radarValues" TEXT,
ADD COLUMN     "simfileId" TEXT,
ADD COLUMN     "stepsType" TEXT,
ALTER COLUMN "length" DROP NOT NULL;

-- DropTable
DROP TABLE "ChartPack";

-- DropTable
DROP TABLE "_ChartPack";

-- CreateTable
CREATE TABLE "Simfile" (
    "id" TEXT NOT NULL,
    "packId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "artist" TEXT NOT NULL,
    "genre" TEXT,
    "credit" TEXT,
    "music" TEXT,
    "banner" TEXT,
    "background" TEXT,
    "offset" DOUBLE PRECISION,
    "bpms" TEXT NOT NULL,
    "stops" TEXT,
    "version" TEXT,
    "bannerUrl" TEXT,
    "backgroundUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Simfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Simfile_packId_idx" ON "Simfile"("packId");

-- CreateIndex
CREATE INDEX "Chart_simfileId_idx" ON "Chart"("simfileId");

-- CreateIndex
CREATE INDEX "Chart_stepsType_difficulty_idx" ON "Chart"("stepsType", "difficulty");

-- AddForeignKey
ALTER TABLE "Simfile" ADD CONSTRAINT "Simfile_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chart" ADD CONSTRAINT "Chart_simfileId_fkey" FOREIGN KEY ("simfileId") REFERENCES "Simfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
