/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Pack` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Pack_name_key" ON "Pack"("name");
