-- AlterTable
ALTER TABLE "Chart" ADD COLUMN     "backgroundUrl" TEXT,
ADD COLUMN     "bannerUrl" TEXT;

-- AlterTable
ALTER TABLE "Pack" ADD COLUMN     "bannerUrl" TEXT;

-- CreateTable
CREATE TABLE "ChartPack" (
    "packId" INTEGER NOT NULL,
    "chartHash" TEXT NOT NULL,
    "artist" TEXT,
    "rating" INTEGER,
    "songName" TEXT,
    "bannerUrl" TEXT,
    "backgroundUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartPack_pkey" PRIMARY KEY ("packId","chartHash")
);

-- AddForeignKey
ALTER TABLE "ChartPack" ADD CONSTRAINT "ChartPack_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartPack" ADD CONSTRAINT "ChartPack_chartHash_fkey" FOREIGN KEY ("chartHash") REFERENCES "Chart"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;
