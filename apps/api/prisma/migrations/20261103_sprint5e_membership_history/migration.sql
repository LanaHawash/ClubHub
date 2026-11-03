-- Sprint 5.E: confirmed-membership history foundation for returning-student pricing.
-- Records enter this table only upon confirmed payment (Sprint 6).
CREATE TABLE "Membership" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clubId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "activatedAt" TIMESTAMPTZ(6) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Membership_valid_dates_check" CHECK ("expiresAt" > "activatedAt"),
  CONSTRAINT "Membership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Membership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "UniversityStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Membership_studentId_clubId_activatedAt_idx"
  ON "Membership"("studentId", "clubId", "activatedAt");
CREATE INDEX "Membership_clubId_expiresAt_idx"
  ON "Membership"("clubId", "expiresAt");
