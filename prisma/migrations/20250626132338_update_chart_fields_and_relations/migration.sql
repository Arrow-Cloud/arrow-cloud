/*
  Warnings:

  - You are about to drop the column `leaderboardId` on the `Chart` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Chart` table. All the data in the column will be lost.
  - Added the required column `artist` to the `Chart` table without a default value. This is not possible if the table is not empty.
  - Added the required column `length` to the `Chart` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rating` to the `Chart` table without a default value. This is not possible if the table is not empty.
  - Added the required column `songName` to the `Chart` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stepartist` to the `Chart` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Chart" DROP CONSTRAINT "Chart_leaderboardId_fkey";

-- AlterTable
ALTER TABLE "Chart" DROP COLUMN "leaderboardId",
DROP COLUMN "name",
ADD COLUMN     "artist" TEXT NOT NULL,
ADD COLUMN     "length" TEXT NOT NULL,
ADD COLUMN     "rating" INTEGER NOT NULL,
ADD COLUMN     "songName" TEXT NOT NULL,
ADD COLUMN     "stepartist" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ChartLeaderboard" (
    "id" SERIAL NOT NULL,
    "chartHash" TEXT NOT NULL,
    "leaderboardId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartLeaderboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ChartLeaderboard" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ChartLeaderboard_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ChartLeaderboard_B_index" ON "_ChartLeaderboard"("B");

-- AddForeignKey
ALTER TABLE "ChartLeaderboard" ADD CONSTRAINT "ChartLeaderboard_chartHash_fkey" FOREIGN KEY ("chartHash") REFERENCES "Chart"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartLeaderboard" ADD CONSTRAINT "ChartLeaderboard_leaderboardId_fkey" FOREIGN KEY ("leaderboardId") REFERENCES "Leaderboard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChartLeaderboard" ADD CONSTRAINT "_ChartLeaderboard_A_fkey" FOREIGN KEY ("A") REFERENCES "Chart"("hash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChartLeaderboard" ADD CONSTRAINT "_ChartLeaderboard_B_fkey" FOREIGN KEY ("B") REFERENCES "Leaderboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
