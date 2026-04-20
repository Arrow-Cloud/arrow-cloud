-- CreateTable
CREATE TABLE "EventChart" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "chartHash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventChart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventChart_eventId_chartHash_key" ON "EventChart"("eventId", "chartHash");

-- AddForeignKey
ALTER TABLE "EventChart" ADD CONSTRAINT "EventChart_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChart" ADD CONSTRAINT "EventChart_chartHash_fkey" FOREIGN KEY ("chartHash") REFERENCES "Chart"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;
