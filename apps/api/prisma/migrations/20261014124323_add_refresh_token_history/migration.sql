-- CreateTable
CREATE TABLE "RefreshTokenHistory" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshTokenHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshTokenHistory_tokenHash_key" ON "RefreshTokenHistory"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshTokenHistory_sessionId_idx" ON "RefreshTokenHistory"("sessionId");

-- AddForeignKey
ALTER TABLE "RefreshTokenHistory" ADD CONSTRAINT "RefreshTokenHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RefreshSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
