BEGIN;

-- ClubHub initial clubs seed
-- Organization names reflect real university organizations.
-- Classifications and eligibility are ClubHub development settings.
-- .invalid email addresses are nonworking development placeholders.

-- =========================================================
-- 1. LANGUAGE RESOURCE CENTER - GENERAL
-- =========================================================

INSERT INTO "Club" (
    "id",
    "name",
    "description",
    "classification",
    "facultyId",
    "status",
    "contactEmail",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    'Language Resource Center',
    'The Language Resource Center promotes language learning, cultural exchange, and communication skills. Through interactive activities, workshops, and cultural experiences, it encourages students to explore languages and connect with different cultures.',
    'GENERAL'::"ClubClassification",
    NULL,
    'ACTIVE'::"ClubStatus",
    'lrc@clubhub.invalid',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM "Club"
    WHERE "name" = 'Language Resource Center'
);


-- =========================================================
-- 2. ENGINEERS WITHOUT BORDERS - FACULTY BASED
-- =========================================================

INSERT INTO "Club" (
    "id",
    "name",
    "description",
    "classification",
    "facultyId",
    "status",
    "contactEmail",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    'Engineers Without Borders',
    'Engineers Without Borders encourages engineering students to develop practical skills, participate in volunteering, and contribute to community development through workshops, collaborative projects, and social initiatives.',
    'FACULTY_BASED'::"ClubClassification",
    f."id",
    'ACTIVE'::"ClubStatus",
    'ewb@clubhub.invalid',
    NOW(),
    NOW()
FROM "Faculty" f
WHERE f."name" = 'Faculty of Engineering'
AND NOT EXISTS (
    SELECT 1
    FROM "Club"
    WHERE "name" = 'Engineers Without Borders'
);


-- =========================================================
-- 3. INSTITUTE OF ELECTRICAL AND ELECTRONICS ENGINEERS
--    MAJOR BASED
-- =========================================================

INSERT INTO "Club" (
    "id",
    "name",
    "description",
    "classification",
    "facultyId",
    "status",
    "foundedYear",
    "contactEmail",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    'Institute of Electrical and Electronics Engineers',
    'IEEE promotes technological innovation, engineering excellence, and professional development. Its activities include technical workshops, training courses, educational visits, and opportunities to explore emerging technologies.',
    'MAJOR_BASED'::"ClubClassification",
    NULL,
    'ACTIVE'::"ClubStatus",
    2009,
    'ieee@clubhub.invalid',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM "Club"
    WHERE "name" =
        'Institute of Electrical and Electronics Engineers'
);


-- =========================================================
-- 4. PALESTINIAN MEDICAL STUDENTS ASSOCIATION
--    FACULTY BASED
-- =========================================================

INSERT INTO "Club" (
    "id",
    "name",
    "description",
    "classification",
    "facultyId",
    "status",
    "contactEmail",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    'Palestinian Medical Students'' Association',
    'The Palestinian Medical Students Association supports medical students through educational activities, public health initiatives, professional development opportunities, leadership programs, and community engagement.',
    'FACULTY_BASED'::"ClubClassification",
    f."id",
    'ACTIVE'::"ClubStatus",
    'pmsa@clubhub.invalid',
    NOW(),
    NOW()
FROM "Faculty" f
WHERE f."name" =
    'Faculty of Medicine and Allied medical Sciences'
AND NOT EXISTS (
    SELECT 1
    FROM "Club"
    WHERE "name" =
        'Palestinian Medical Students'' Association'
);


-- =========================================================
-- 5. MEDICAL LABORATORY STUDENTS ASSOCIATION
--    MAJOR BASED
-- =========================================================

INSERT INTO "Club" (
    "id",
    "name",
    "description",
    "classification",
    "facultyId",
    "status",
    "contactEmail",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    'Medical Laboratory Students'' Association',
    'The Medical Laboratory Students Association supports students studying medical laboratory sciences. It promotes laboratory skills, scientific knowledge, professional development, and participation in educational and community activities.',
    'MAJOR_BASED'::"ClubClassification",
    NULL,
    'ACTIVE'::"ClubStatus",
    'mlsa@clubhub.invalid',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM "Club"
    WHERE "name" =
        'Medical Laboratory Students'' Association'
);


-- =========================================================
-- 6. IEEE ELIGIBLE MAJORS (7)
-- =========================================================

WITH eligible AS (
    SELECT m."id"
    FROM "Major" m
    JOIN "Faculty" f
        ON f."id" = m."facultyId"
    WHERE (
        f."name" = 'Faculty of Engineering'
        AND m."name" IN (
            'Computer Engineering',
            'Electrical Engineering',
            'Telecommunication Engineering',
            'Mechatronics Engineering'
        )
    )
    OR (
        f."name" =
            'Faculty of Information Technology & Artificial Intelligence'
        AND m."name" IN (
            'Computer Science',
            'Artificial Intelligence and Data Science',
            'Cyber Security'
        )
    )
)
INSERT INTO "ClubEligibleMajor" (
    "id",
    "clubId",
    "majorId",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    c."id",
    e."id",
    NOW(),
    NOW()
FROM "Club" c
CROSS JOIN eligible e
WHERE c."name" =
    'Institute of Electrical and Electronics Engineers'
AND NOT EXISTS (
    SELECT 1
    FROM "ClubEligibleMajor" cm
    WHERE cm."clubId" = c."id"
      AND cm."majorId" = e."id"
);


-- =========================================================
-- 7. MEDICAL LABORATORY ASSOCIATION ELIGIBILITY
-- =========================================================

INSERT INTO "ClubEligibleMajor" (
    "id",
    "clubId",
    "majorId",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    c."id",
    m."id",
    NOW(),
    NOW()
FROM "Club" c
CROSS JOIN "Major" m
JOIN "Faculty" f
    ON f."id" = m."facultyId"
WHERE c."name" =
    'Medical Laboratory Students'' Association'
AND m."name" = 'Medical Laboratory Sciences'
AND f."name" =
    'Faculty of Medicine and Allied medical Sciences'
AND NOT EXISTS (
    SELECT 1
    FROM "ClubEligibleMajor" cm
    WHERE cm."clubId" = c."id"
      AND cm."majorId" = m."id"
);


-- =========================================================
-- 8. VALIDATION
-- =========================================================

DO $$
BEGIN

    -- Exactly five named organizations should exist.
    IF (
        SELECT COUNT(*)
        FROM "Club"
        WHERE "name" IN (
            'Language Resource Center',
            'Engineers Without Borders',
            'Institute of Electrical and Electronics Engineers',
            'Palestinian Medical Students'' Association',
            'Medical Laboratory Students'' Association'
        )
    ) <> 5 THEN
        RAISE EXCEPTION
            'Expected five ClubHub organizations';
    END IF;

    -- IEEE must have seven eligible majors.
    IF (
        SELECT COUNT(*)
        FROM "ClubEligibleMajor" cm
        JOIN "Club" c
            ON c."id" = cm."clubId"
        WHERE c."name" =
            'Institute of Electrical and Electronics Engineers'
    ) <> 7 THEN
        RAISE EXCEPTION
            'Expected seven eligible IEEE majors';
    END IF;

    -- Medical laboratory association must have one eligible major.
    IF (
        SELECT COUNT(*)
        FROM "ClubEligibleMajor" cm
        JOIN "Club" c
            ON c."id" = cm."clubId"
        WHERE c."name" =
            'Medical Laboratory Students'' Association'
    ) <> 1 THEN
        RAISE EXCEPTION
            'Expected one eligible medical laboratory major';
    END IF;

END $$;

COMMIT;