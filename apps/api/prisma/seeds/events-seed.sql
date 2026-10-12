BEGIN;

INSERT INTO "Event" (
    "id",
    "clubId",
    "title",
    "description",
    "category",
    "status",
    "startDate",
    "endDate",
    "location",
    "sourceUrl",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    c."id",
    e.title,
    e.description,
    e.category::"EventCategory",
    'PUBLISHED'::"EventStatus",
    e.start_date::date,
    e.end_date::date,
    e.location,
    e.source_url,
    NOW(),
    NOW()
FROM (
    VALUES
    (
        'Engineers Without Borders',
        'Your Professional Journey: From an Effective Resume to the Job Market',
        'A professional development workshop focused on resume writing, job interviews, effective communication, and preparing students for employment opportunities.',
        'WORKSHOP',
        '2024-11-20',
        NULL,
        'Law Auditorium, New Campus',
        'https://www.najah.edu/en/about/history-and-traditions/campus-life/deanship-student-affairs/news-activities/2024/11/24/deanship-of-student-affairs-and-engineers-without-borders-launch-training-workshop-on-professional-development/'
    ),
    (
        'Institute of Electrical and Electronics Engineers',
        'How to Be Ready for the Job Market?',
        'An IEEE-affiliated workshop organized with Foras Platform, covering CV preparation, interviews, employment opportunities, and professional digital identity.',
        'WORKSHOP',
        '2025-02-26',
        NULL,
        NULL,
        'https://www.najah.edu/en/about/history-and-traditions/campus-life/deanship-student-affairs/news-activities/2025/03/05/ieee-student-branch-at-an-najah-university-organizes-a-workshop-on-job-market-readiness/'
    ),
    (
        'Language Resource Center',
        'Sign Language Awareness Event',
        'An awareness event organized in collaboration with the Deaf and Mute Charity Association, highlighting communication accessibility, sign-language interpretation, and social inclusion.',
        'CAMPAIGN',
        '2025-03-03',
        '2025-03-04',
        'Nablus',
        'https://lrc.najah.edu/en/news/2025/03/18/sign-language-awareness-event/'
    ),
    (
        'Medical Laboratory Students'' Association',
        'Medical Laboratory Awareness Initiative',
        'An educational initiative with the Mothers'' School Society featuring blood-group testing, explanations of laboratory procedures, and awareness about the health risks of energy drinks.',
        'SEMINAR',
        '2024-10-31',
        NULL,
        'Mothers'' School Society, Nablus',
        'https://fmhs.najah.edu/en/students/students-activities/2024/11/07/najah-national-universitys-medical-laboratory-students-association-conducts-awareness-initiative-mothers-school-society/'
    ),
    (
        'Palestinian Medical Students'' Association',
        'R.I.S.E. 2 H.E.A.L. Awareness Campaign',
        'A medical and community awareness campaign addressing children''s rights and kidney failure, including educational booths and a winter clothing donation initiative.',
        'CAMPAIGN',
        '2025-12-17',
        NULL,
        'Faculty of Medicine Courtyard, New Campus',
        'https://fmhs.najah.edu/en/students/students-activities/2025/12/21/faculty-medicine-and-deanship-student-affairs-conclude-rise-2-hel-awareness-campaign/'
    )
) AS e(
    club_name,
    title,
    description,
    category,
    start_date,
    end_date,
    location,
    source_url
)
JOIN "Club" c ON c."name" = e.club_name
WHERE NOT EXISTS (
    SELECT 1
    FROM "Event" existing
    WHERE existing."clubId" = c."id"
      AND existing."sourceUrl" = e.source_url
);

COMMIT;