-- Sprint 5.D.6: scheduled fee snapshots independent of public traffic.
-- Apply as a NEW migration. Never edit the already-applied October migrations.

-- Permit one-time recovery of the fee link on an expired / early-closed window.
-- All other historical fields remain immutable.
CREATE OR REPLACE FUNCTION protect_membership_registration_window()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Registration windows cannot be deleted; history must be preserved';
  END IF;

  IF OLD."effectiveFeeVersionId" IS NOT NULL
     AND NEW."effectiveFeeVersionId" IS DISTINCT FROM OLD."effectiveFeeVersionId" THEN
    RAISE EXCEPTION 'A registration window fee version cannot be changed after locking';
  END IF;

  -- A missing historical price may be attached exactly once, but no dates,
  -- closure, ownership, or other business fields may be altered in that UPDATE.
  IF OLD."effectiveFeeVersionId" IS NULL
     AND NEW."effectiveFeeVersionId" IS NOT NULL
     AND OLD."opensAt" <= clock_timestamp()
     AND ROW(NEW."id", NEW."clubId", NEW."opensAt", NEW."closesAt", NEW."closedAt", NEW."createdAt")
         IS NOT DISTINCT FROM
         ROW(OLD."id", OLD."clubId", OLD."opensAt", OLD."closesAt", OLD."closedAt", OLD."createdAt") THEN
    RETURN NEW;
  END IF;

  IF OLD."closedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'An early-closed registration window cannot be modified';
  END IF;
  IF OLD."closesAt" <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'An expired registration window cannot be modified';
  END IF;
  IF OLD."opensAt" <= CURRENT_TIMESTAMP
     AND NEW."opensAt" IS DISTINCT FROM OLD."opensAt" THEN
    RAISE EXCEPTION 'An active registration window opening time cannot be changed';
  END IF;
  IF OLD."opensAt" <= CURRENT_TIMESTAMP
     AND NEW."closesAt" < OLD."closesAt" THEN
    RAISE EXCEPTION 'An active registration window cannot be shortened';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The caller obtains settings-row lock BEFORE any window-row lock.
-- A worker and a fee edit therefore cannot race to publish two snapshots.
CREATE OR REPLACE FUNCTION snapshot_due_membership_windows(p_club_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_settings "ClubMembershipSettings"%ROWTYPE;
  v_window record;
  v_version_id uuid;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_settings
  FROM "ClubMembershipSettings"
  WHERE "clubId" = p_club_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Never publish scheduled-window snapshots from an ALWAYS_OPEN setting.
  -- A mode transition is handled by the BEFORE UPDATE trigger while OLD
  -- registrationMode is still WINDOWED.
  IF v_settings."registrationMode" <> 'WINDOWED' THEN
    RETURN 0;
  END IF;

  FOR v_window IN
    SELECT "id", "opensAt"
    FROM "ClubRegistrationWindow"
    WHERE "clubId" = p_club_id
      AND "opensAt" <= clock_timestamp()
      AND "effectiveFeeVersionId" IS NULL
    ORDER BY "opensAt", "id"
    FOR UPDATE
  LOOP
    -- The fee snapshot is immutable, anchored to scheduled opening time.
    v_version_id := gen_random_uuid();
    INSERT INTO "ClubMembershipFeeVersion" (
      "id", "clubId", "firstTimeFee", "renewalFee", "currency",
      "effectiveAt", "createdById", "createdAt", "updatedAt"
    ) VALUES (
      v_version_id, p_club_id, v_settings."pendingFirstTimeFee",
      v_settings."pendingRenewalFee", v_settings."currency",
      v_window."opensAt", NULL, clock_timestamp(), clock_timestamp()
    );

    UPDATE "ClubRegistrationWindow"
    SET "effectiveFeeVersionId" = v_version_id,
        "updatedAt" = clock_timestamp()
    WHERE "id" = v_window."id"
      AND "effectiveFeeVersionId" IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Window snapshot linkage failed for %', v_window."id";
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Flush all windows already due BEFORE a pending fee / mode mutation.
-- Thus even if the periodic worker has not run, a Deanship fee edit cannot
-- silently change prices of a window that already opened.
CREATE OR REPLACE FUNCTION snapshot_due_before_membership_settings_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."pendingFirstTimeFee", NEW."pendingRenewalFee", NEW."currency", NEW."registrationMode")
     IS DISTINCT FROM
     ROW(OLD."pendingFirstTimeFee", OLD."pendingRenewalFee", OLD."currency", OLD."registrationMode") THEN
    PERFORM snapshot_due_membership_windows(OLD."clubId");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS membership_settings_snapshot_before_change
ON "ClubMembershipSettings";

CREATE TRIGGER membership_settings_snapshot_before_change
BEFORE UPDATE OF "pendingFirstTimeFee", "pendingRenewalFee", "currency", "registrationMode"
ON "ClubMembershipSettings"
FOR EACH ROW
EXECUTE FUNCTION snapshot_due_before_membership_settings_change();

-- A fee version published for one registration window cannot be reused
-- as the effective version for a second window. NULL links remain allowed.
CREATE UNIQUE INDEX IF NOT EXISTS "membership_window_unique_effective_fee_version"
ON "ClubRegistrationWindow" ("effectiveFeeVersionId")
WHERE "effectiveFeeVersionId" IS NOT NULL;