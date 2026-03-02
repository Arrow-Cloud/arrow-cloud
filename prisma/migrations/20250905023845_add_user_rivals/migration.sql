-- CreateTable
CREATE TABLE "UserRival" (
    "userId" TEXT NOT NULL,
    "rivalUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRival_pkey" PRIMARY KEY ("userId","rivalUserId")
);

-- CreateIndex
CREATE INDEX "UserRival_userId_idx" ON "UserRival"("userId");

-- CreateIndex
CREATE INDEX "UserRival_rivalUserId_idx" ON "UserRival"("rivalUserId");

-- AddForeignKey
ALTER TABLE "UserRival" ADD CONSTRAINT "UserRival_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRival" ADD CONSTRAINT "UserRival_rivalUserId_fkey" FOREIGN KEY ("rivalUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
