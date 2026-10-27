-- AlterTable
ALTER TABLE "ClubAdminAssignment" ADD COLUMN     "boardAppointmentId" UUID;

-- CreateTable
CREATE TABLE "BoardAppointment" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "position" VARCHAR(100) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BoardAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardAppointment_clubId_startDate_idx" ON "BoardAppointment"("clubId", "startDate");

-- CreateIndex
CREATE INDEX "BoardAppointment_studentId_idx" ON "BoardAppointment"("studentId");

-- CreateIndex
CREATE INDEX "ClubAdminAssignment_boardAppointmentId_idx" ON "ClubAdminAssignment"("boardAppointmentId");

-- AddForeignKey
ALTER TABLE "ClubAdminAssignment" ADD CONSTRAINT "ClubAdminAssignment_boardAppointmentId_fkey" FOREIGN KEY ("boardAppointmentId") REFERENCES "BoardAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardAppointment" ADD CONSTRAINT "BoardAppointment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardAppointment" ADD CONSTRAINT "BoardAppointment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "UniversityStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
