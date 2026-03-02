/*
  Warnings:

  - A unique constraint covering the columns `[hash]` on the table `Simfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Simfile" ADD COLUMN     "hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Simfile_hash_key" ON "Simfile"("hash");

-- CreateIndex
CREATE INDEX "Simfile_hash_idx" ON "Simfile"("hash");
