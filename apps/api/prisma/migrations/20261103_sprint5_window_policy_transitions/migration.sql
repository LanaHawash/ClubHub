-- Preserve scheduled-window cancellation history separately
-- from early closure of an already-open window.

ALTER TABLE "ClubRegistrationWindow"
ADD COLUMN "canceledAt" TIMESTAMPTZ(6);

ALTER TABLE "ClubRegistrationWindow"
ADD CONSTRAINT "membership_window_valid_cancellation"
CHECK (
    "canceledAt" IS NULL
    OR (
        "canceledAt" < "opensAt"
        AND "closedAt" IS NULL
        AND "effectiveFeeVersionId" IS NULL
    )
);

-- A canceled window must not block scheduling a replacement.
ALTER TABLE "ClubRegistrationWindow"
DROP CONSTRAINT "membership_window_no_overlap";

ALTER TABLE "ClubRegistrationWindow"
ADD CONSTRAINT "membership_window_no_overlap"
EXCLUDE USING gist (
    "clubId" WITH =,
    (
        CASE
            WHEN "canceledAt" IS NOT NULL
                THEN 'empty'::tstzrange
            ELSE tstzrange(
                "opensAt",
                COALESCE("closedAt", "closesAt"),
                '[)'
            )
        END
    ) WITH &&
);

-- Preserve the existing historical-window protections,
-- while allowing an unlocked future window to be canceled.

CREATE OR REPLACE FUNCTION protect_membership_registration_window()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'Registration windows cannot be deleted; history must be preserved';
    END IF;

    IF OLD."canceledAt" IS NOT NULL THEN
        RAISE EXCEPTION
            'A canceled registration window cannot be modified';
    END IF;

    IF NEW."canceledAt" IS NOT NULL THEN
        IF OLD."opensAt" <= clock_timestamp()
           OR OLD."closedAt" IS NOT NULL
           OR OLD."effectiveFeeVersionId" IS NOT NULL
           OR ROW(
                NEW."id",
                NEW."clubId",
                NEW."opensAt",
                NEW."closesAt",
                NEW."closedAt",
                NEW."effectiveFeeVersionId",
                NEW."createdAt"
              ) IS DISTINCT FROM
              ROW(
                OLD."id",
                OLD."clubId",
                OLD."opensAt",
                OLD."closesAt",
                OLD."closedAt",
                OLD."effectiveFeeVersionId",
                OLD."createdAt"
              )
        THEN
            RAISE EXCEPTION
                'Only unchanged, future, unlocked windows may be canceled';
        END IF;

        RETURN NEW;
    END IF;

    IF OLD."effectiveFeeVersionId" IS NOT NULL
       AND NEW."effectiveFeeVersionId"
           IS DISTINCT FROM OLD."effectiveFeeVersionId"
    THEN
        RAISE EXCEPTION
            'A registration window fee version cannot be changed after locking';
    END IF;

    IF OLD."effectiveFeeVersionId" IS NULL
       AND NEW."effectiveFeeVersionId" IS NOT NULL
       AND OLD."opensAt" <= clock_timestamp()
       AND ROW(
            NEW."id", NEW."clubId", NEW."opensAt",
            NEW."closesAt", NEW."closedAt",
            NEW."canceledAt", NEW."createdAt"
       ) IS NOT DISTINCT FROM
       ROW(
            OLD."id", OLD."clubId", OLD."opensAt",
            OLD."closesAt", OLD."closedAt",
            OLD."canceledAt", OLD."createdAt"
       )
    THEN
        RETURN NEW;
    END IF;

    IF OLD."closedAt" IS NOT NULL THEN
        RAISE EXCEPTION
            'An early-closed registration window cannot be modified';
    END IF;

    IF OLD."closesAt" <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION
            'An expired registration window cannot be modified';
    END IF;

    IF OLD."opensAt" <= CURRENT_TIMESTAMP
       AND NEW."opensAt" IS DISTINCT FROM OLD."opensAt"
    THEN
        RAISE EXCEPTION
            'An active registration window opening time cannot be changed';
    END IF;

    IF OLD."opensAt" <= CURRENT_TIMESTAMP
       AND NEW."closesAt" < OLD."closesAt"
    THEN
        RAISE EXCEPTION
            'An active registration window cannot be shortened';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Exclude canceled windows from automatic fee publication.

CREATE OR REPLACE FUNCTION snapshot_due_membership_windows(
    p_club_id uuid
)
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

    IF NOT FOUND
       OR v_settings."registrationMode" <> 'WINDOWED'
    THEN
        RETURN 0;
    END IF;

    FOR v_window IN
        SELECT "id", "opensAt"
        FROM "ClubRegistrationWindow"
        WHERE "clubId" = p_club_id
          AND "opensAt" <= clock_timestamp()
          AND "canceledAt" IS NULL
          AND "effectiveFeeVersionId" IS NULL
        ORDER BY "opensAt", "id"
        FOR UPDATE
    LOOP
        v_version_id := gen_random_uuid();

        INSERT INTO "ClubMembershipFeeVersion" (
            "id", "clubId", "firstTimeFee",
            "renewalFee", "currency",
            "effectiveAt", "createdById",
            "createdAt", "updatedAt"
        )
        VALUES (
            v_version_id,
            p_club_id,
            v_settings."pendingFirstTimeFee",
            v_settings."pendingRenewalFee",
            v_settings."currency",
            v_window."opensAt",
            NULL,
            clock_timestamp(),
            clock_timestamp()
        );

        UPDATE "ClubRegistrationWindow"
        SET "effectiveFeeVersionId" = v_version_id,
            "updatedAt" = clock_timestamp()
        WHERE "id" = v_window."id"
          AND "canceledAt" IS NULL
          AND "effectiveFeeVersionId" IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Window snapshot linkage failed for %',
                v_window."id";
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;