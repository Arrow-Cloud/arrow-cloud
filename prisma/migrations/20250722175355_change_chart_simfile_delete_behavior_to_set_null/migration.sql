-- DropForeignKey
ALTER TABLE "Chart" DROP CONSTRAINT "Chart_simfileId_fkey";

-- AddForeignKey
ALTER TABLE "Chart" ADD CONSTRAINT "Chart_simfileId_fkey" FOREIGN KEY ("simfileId") REFERENCES "Simfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
