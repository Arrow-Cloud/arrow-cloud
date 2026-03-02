-- CreateTable
CREATE TABLE "UserPreferredLeaderboard" (
    "userId" TEXT NOT NULL,
    "leaderboardId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPreferredLeaderboard_pkey" PRIMARY KEY ("userId","leaderboardId")
);

-- CreateIndex
CREATE INDEX "UserPreferredLeaderboard_userId_idx" ON "UserPreferredLeaderboard"("userId");

-- CreateIndex
CREATE INDEX "UserPreferredLeaderboard_leaderboardId_idx" ON "UserPreferredLeaderboard"("leaderboardId");

-- AddForeignKey
ALTER TABLE "UserPreferredLeaderboard" ADD CONSTRAINT "UserPreferredLeaderboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferredLeaderboard" ADD CONSTRAINT "UserPreferredLeaderboard_leaderboardId_fkey" FOREIGN KEY ("leaderboardId") REFERENCES "Leaderboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
