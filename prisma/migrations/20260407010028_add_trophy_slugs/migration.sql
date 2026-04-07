/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Trophy` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Trophy" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Trophy_slug_key" ON "Trophy"("slug");
