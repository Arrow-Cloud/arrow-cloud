-- DropForeignKey
ALTER TABLE "Chart" DROP CONSTRAINT "Chart_simfileId_fkey";

-- CreateTable
CREATE TABLE "SimfileChart" (
    "id" SERIAL NOT NULL,
    "simfileId" TEXT NOT NULL,
    "chartHash" TEXT NOT NULL,
    "chartName" TEXT,
    "stepsType" TEXT,
    "description" TEXT,
    "meter" INTEGER,
    "credit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimfileChart_pkey" PRIMARY KEY ("id")
);

-- Migrate existing Chart-Simfile relationships to the new many-to-many table
-- Only migrate charts that have a simfileId (not null)
INSERT INTO "SimfileChart" (
    "simfileId",
    "chartHash", 
    "chartName",
    "stepsType",
    "description",
    "meter",
    "credit",
    "createdAt",
    "updatedAt"
)
SELECT 
    "simfileId",
    "hash" as "chartHash",
    "chartName",
    "stepsType", 
    "description",
    "meter",
    "credit",
    "createdAt",
    "updatedAt"
FROM "Chart" 
WHERE "simfileId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "SimfileChart_simfileId_idx" ON "SimfileChart"("simfileId");

-- CreateIndex
CREATE INDEX "SimfileChart_chartHash_idx" ON "SimfileChart"("chartHash");

-- CreateIndex
CREATE UNIQUE INDEX "SimfileChart_simfileId_chartHash_key" ON "SimfileChart"("simfileId", "chartHash");

-- AddForeignKey
ALTER TABLE "SimfileChart" ADD CONSTRAINT "SimfileChart_simfileId_fkey" FOREIGN KEY ("simfileId") REFERENCES "Simfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimfileChart" ADD CONSTRAINT "SimfileChart_chartHash_fkey" FOREIGN KEY ("chartHash") REFERENCES "Chart"("hash") ON DELETE CASCADE ON UPDATE CASCADE;
