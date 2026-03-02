-- CreateIndex
CREATE INDEX "Leaderboard_type_idx" ON "Leaderboard"("type", "id");

-- CreateIndex
CREATE INDEX "Play_chartHash_userId_createdAt_id_idx" ON "Play"("chartHash", "userId", "createdAt" DESC, "id" DESC);
