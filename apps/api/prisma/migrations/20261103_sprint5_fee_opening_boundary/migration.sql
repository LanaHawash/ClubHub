-- Sprint 5.D: reject a membership-settings mutation when its transaction
-- remains open across a scheduled registration-window opening.
-- New migration: do NOT edit the already-deployed 20261102 migration.
--
-- The BEFORE UPDATE hook records the mutation time *before* it snapshots
-- already-due windows. A deferred constraint trigger checks the opening
-- boundary at COMMIT (or on SET CONSTRAINTS ... IMMEDIATE).
-- Rows in the guard table are deleted by the deferred trigger, leaving
-- no normal-operation data behind.

CREATE TABLE "ClubMembershipFeeBoundaryGuard" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clubId" uuid NOT NULL,
  "mutationAt" timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION check_membership_fee_opening_boundary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ClubRegistrationWindow" w
    WHERE w."clubId" = NEW."clubId"
      AND w."opensAt" > NEW."mutationAt"
      AND w."opensAt" <= clock_timestamp()
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'Membership registration opened while fees were being changed. The fee update was rolled back; reload and retry.';
  END IF;

  DELETE FROM "ClubMembershipFeeBoundaryGuard" WHERE "id" = NEW."id";
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER membership_fee_boundary_commit_check
AFTER INSERT ON "ClubMembershipFeeBoundaryGuard"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_membership_fee_opening_boundary();

CREATE OR REPLACE FUNCTION snapshot_due_before_membership_settings_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."pendingFirstTimeFee", NEW."pendingRenewalFee", NEW."currency", NEW."registrationMode")
     IS DISTINCT FROM
     ROW(OLD."pendingFirstTimeFee", OLD."pendingRenewalFee", OLD."currency", OLD."registrationMode") THEN
    IF OLD."registrationMode" = 'WINDOWED' THEN
      -- Capture the boundary BEFORE the due-window sweep. If a window opens
      -- during this transaction, its fee change must not commit.
      INSERT INTO "ClubMembershipFeeBoundaryGuard" ("clubId", "mutationAt")
      VALUES (OLD."clubId", clock_timestamp());
    END IF;
    PERFORM snapshot_due_membership_windows(OLD."clubId");
  END IF;
  RETURN NEW;
END;
$$;
