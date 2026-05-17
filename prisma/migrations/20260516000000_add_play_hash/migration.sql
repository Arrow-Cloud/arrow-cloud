-- AlterTable
ALTER TABLE "Play" ADD COLUMN "playHash" TEXT;

-- CreateIndex
CREATE INDEX "Play_userId_playHash_idx" ON "Play"("userId", "playHash");
