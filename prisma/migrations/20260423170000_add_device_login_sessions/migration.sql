-- CreateTable
CREATE TABLE "DeviceLoginSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "shortCode" TEXT NOT NULL,
    "pollTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "machineLabel" TEXT,
    "clientVersion" TEXT,
    "themeVersion" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "approvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "issuedApiKeyHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceLoginSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceLoginSession_shortCode_key" ON "DeviceLoginSession"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceLoginSession_pollTokenHash_key" ON "DeviceLoginSession"("pollTokenHash");

-- CreateIndex
CREATE INDEX "DeviceLoginSession_userId_idx" ON "DeviceLoginSession"("userId");

-- CreateIndex
CREATE INDEX "DeviceLoginSession_status_idx" ON "DeviceLoginSession"("status");

-- CreateIndex
CREATE INDEX "DeviceLoginSession_expiresAt_idx" ON "DeviceLoginSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "DeviceLoginSession" ADD CONSTRAINT "DeviceLoginSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
