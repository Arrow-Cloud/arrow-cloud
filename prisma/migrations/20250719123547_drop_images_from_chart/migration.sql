/*
  Warnings:

  - You are about to drop the column `backgroundUrl` on the `Chart` table. All the data in the column will be lost.
  - You are about to drop the column `bannerUrl` on the `Chart` table. All the data in the column will be lost.
  - You are about to drop the column `jacketUrl` on the `Chart` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Chart" DROP COLUMN "backgroundUrl",
DROP COLUMN "bannerUrl",
DROP COLUMN "jacketUrl";
