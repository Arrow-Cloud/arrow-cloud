/*
  Warnings:

  - The primary key for the `UserPreferredLeaderboard` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropIndex
DROP INDEX "UserPreferredLeaderboard_userId_idx";

-- AlterTable
ALTER TABLE "UserPreferredLeaderboard" DROP CONSTRAINT "UserPreferredLeaderboard_pkey",
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'GAME',
ADD CONSTRAINT "UserPreferredLeaderboard_pkey" PRIMARY KEY ("userId", "leaderboardId", "scope");

-- CreateIndex
CREATE INDEX "UserPreferredLeaderboard_userId_scope_idx" ON "UserPreferredLeaderboard"("userId", "scope");
