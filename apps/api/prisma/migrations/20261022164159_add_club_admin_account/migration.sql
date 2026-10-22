/*
  Warnings:

  - A unique constraint covering the columns `[adminAccountId]` on the table `Club` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "adminAccountId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Club_adminAccountId_key" ON "Club"("adminAccountId");

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_adminAccountId_fkey" FOREIGN KEY ("adminAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
