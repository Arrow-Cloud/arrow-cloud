/*
  Warnings:

  - The primary key for the `Chart` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Chart` table. All the data in the column will be lost.
  - You are about to drop the column `chartId` on the `Play` table. All the data in the column will be lost.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_ChartPack` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `chartHash` to the `Play` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "EventRegistration" DROP CONSTRAINT "EventRegistration_userId_fkey";

-- DropForeignKey
ALTER TABLE "Play" DROP CONSTRAINT "Play_chartId_fkey";

-- DropForeignKey
ALTER TABLE "Play" DROP CONSTRAINT "Play_userId_fkey";

-- DropForeignKey
ALTER TABLE "_ChartPack" DROP CONSTRAINT "_ChartPack_A_fkey";

-- DropIndex
DROP INDEX "Chart_hash_key";

-- AlterTable
ALTER TABLE "Chart" DROP CONSTRAINT "Chart_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Chart_pkey" PRIMARY KEY ("hash");

-- AlterTable
ALTER TABLE "EventRegistration" ALTER COLUMN "userId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Play" DROP COLUMN "chartId",
ADD COLUMN     "chartHash" TEXT NOT NULL,
ALTER COLUMN "userId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "User_id_seq";

-- AlterTable
ALTER TABLE "_ChartPack" DROP CONSTRAINT "_ChartPack_AB_pkey",
ALTER COLUMN "A" SET DATA TYPE TEXT,
ADD CONSTRAINT "_ChartPack_AB_pkey" PRIMARY KEY ("A", "B");

-- CreateTable
CREATE TABLE "ApiKey" (
    "keyHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("keyHash")
);

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_chartHash_fkey" FOREIGN KEY ("chartHash") REFERENCES "Chart"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChartPack" ADD CONSTRAINT "_ChartPack_A_fkey" FOREIGN KEY ("A") REFERENCES "Chart"("hash") ON DELETE CASCADE ON UPDATE CASCADE;
