-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "supervisorId" UUID;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "SupervisorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
