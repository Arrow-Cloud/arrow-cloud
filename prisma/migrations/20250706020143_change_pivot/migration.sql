/*
  Warnings:

  - The primary key for the `PlayLeaderboard` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `PlayLeaderboard` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PlayLeaderboard" DROP CONSTRAINT "PlayLeaderboard_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "PlayLeaderboard_pkey" PRIMARY KEY ("playId", "leaderboardId");
