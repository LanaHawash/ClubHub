-- ClubHub official academic reference seed (public faculty and undergraduate program names only).
-- Sources (retrieved 2026-10-11):
-- https://www.najah.edu/en/academic/faculties/
-- https://www.najah.edu/en/academic/undergraduate-programs/
-- Preserves the English titles displayed by the university, including capitalization and typos.
-- Graduate Studies and Honors appear on the faculties page, but no corresponding
-- undergraduate programs are listed on the undergraduate programs page.
-- No real students or private data included. Safe to commit.
-- Requires Prisma migration creating "Faculty" and "Major" tables before execution.
-- Rerunnable: ON CONFLICT prevents duplicate faculties/programs.
BEGIN;
INSERT INTO "Faculty" ("id","name","createdAt","updatedAt") VALUES
(gen_random_uuid(), 'Faculty of Medicine and Allied medical Sciences', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Engineering', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Business and Communication', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Dentistry & Dental Surgery', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Fine Arts', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Graduate Studies', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Honors', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Humanities and Educational Sciences', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Information Technology & Artificial Intelligence', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Law and Political Sciences', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Science', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Shari''ah', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Veterinary Medicine and Agricultural Engineering', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Pharmacy', NOW(), NOW()),
(gen_random_uuid(), 'Faculty of Nursing', NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

-- Insert each listed university undergraduate program as a Major under its faculty.
-- Faculty of Medicine and Allied medical Sciences (13 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Anesthesia and Resuscitation'),
  ('Audiology and Speech Sciences'),
  ('Bachelor of Science in Clinical Nutrition'),
  ('Biomedical Sciences'),
  ('Cardiac Perfusion Technology Program'),
  ('Doctor of Medicine'),
  ('Health Information Management (HIM)'),
  ('Medical imaging'),
  ('Medical Laboratory Sciences'),
  ('Optometry'),
  ('Physical Education -Training'),
  ('Physiotherapy'),
  ('Respiratory Care Program')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Medicine and Allied medical Sciences'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Engineering (14 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Architectural Engineering'),
  ('Building Engineering'),
  ('Chemical Engineering'),
  ('Civil Engineering'),
  ('Computer Engineering'),
  ('Electrical Engineering'),
  ('Energy & Environmental Engineering'),
  ('Geomatics Engineering'),
  ('Industrial Engineering'),
  ('Materials Science Engineering'),
  ('Mechanical Engineering'),
  ('Mechatronics Engineering'),
  ('Planning Engineering and City Technology'),
  ('Telecommunication Engineering')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Engineering'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Dentistry & Dental Surgery (3 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Dental Hygiene BA Program'),
  ('Dental Laboratory Technology'),
  ('Doctor of Dental Surgery')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Dentistry & Dental Surgery'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Nursing (2 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Midwifery'),
  ('Nursing')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Nursing'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Pharmacy (3 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Cosmetics and Skin Care'),
  ('Pharmacy'),
  ('Pharmacy Doctor')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Pharmacy'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Information Technology & Artificial Intelligence (6 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Artificial Intelligence and Data Science'),
  ('Computer Information Systems'),
  ('Computer Science'),
  ('Computer Science Apprenticeship Program'),
  ('Cyber Security'),
  ('Management Information Systems')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Information Technology & Artificial Intelligence'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Science (14 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Applied Chemistry'),
  ('Biology Biotechnology'),
  ('Chemistry'),
  ('Life Sciences'),
  ('Major Chemistry Minor Education'),
  ('Major Mathematics -Minor Education'),
  ('Major Mathematics -Minor Statistics'),
  ('Major Physics Minor Education'),
  ('Major Physics Minor Electronics'),
  ('Mathematics'),
  ('Mathematics and Data Science'),
  ('Mathematics Minor Insurance'),
  ('Physics'),
  ('Technology of Applied Physics')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Science'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Shari'ah (4 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Fiqih & Legistlation'),
  ('Fundamentals of Religion (Usool Al-Deen) with Arabic Minor'),
  ('Osoul Aldeen'),
  ('Sharia & Islamic Banks')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Shari''ah'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Humanities and Educational Sciences (34 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Arabic Language & Literature'),
  ('Arabic Language and Literature with Arabic for Non-Native Speakers Teachers'' Training Minor'),
  ('Arabic Language and Literature with Education Minor'),
  ('Arabic Language and Literature with Hebrew Minor'),
  ('English Language & Literature'),
  ('English Language and Literature with Arabic for Non-Native Speakers Teachers'' Training Minor'),
  ('English Language and Literature with Hebrew Minor'),
  ('English Language Literature Minor Education'),
  ('English Language Literature Minor Translation'),
  ('French Language'),
  ('French Language with Arabic for Non-Native Speakers Teachers'' Training Minor'),
  ('French Language with Hebrew Minor'),
  ('Geography'),
  ('Geomatics'),
  ('History'),
  ('History Minor Education'),
  ('Inclusive and Special Education'),
  ('Kindergartens'),
  ('Lower Preparatory'),
  ('Major Psychology minor Psychological Counseling'),
  ('Major: English Language and Literature Minor: American Studies'),
  ('Major: English Language and Literature Minor: French'),
  ('Major: French Language and Literature, Minor: English'),
  ('Major: French Language, Minor: Public Relations'),
  ('Physical Education -Methods of Teaching'),
  ('Social Work'),
  ('Teaching Preparation Diploma'),
  ('Tourism & Archeology'),
  ('Upper Preparatory - Teacher in Arabic Language'),
  ('Upper Preparatory - Teacher in Social Studies'),
  ('Upper Preparatory- Teacher in Mathematics'),
  ('Upper Preparatory- Teacher in Sciences'),
  ('Upper Preparatory- Teacher in Technology'),
  ('Upper Prepartory -Teacher in English Language')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Humanities and Educational Sciences'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Business and Communication (14 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Accounting'),
  ('Accounting Minor Insurance'),
  ('Business Administration'),
  ('Business Administration Minor Insurance'),
  ('Communication and Digital Marketing'),
  ('Communication and Digital Media'),
  ('Digital Economy and E-Commerce'),
  ('Economics Minor Insurance'),
  ('financial & Banking Sciences'),
  ('Financial Banking Sciences Minor Insurance'),
  ('Marketing Minor Insurance'),
  ('Public Relations & Communication'),
  ('Radio & Television'),
  ('The Investment and Real Estate Development')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Business and Communication'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Veterinary Medicine and Agricultural Engineering (5 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Agricultural Engineering BA Program'),
  ('Animal Production & Animal Health'),
  ('Nutrition and Food Technology'),
  ('Plant Production & Protection'),
  ('Veterinary Medicine')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Veterinary Medicine and Agricultural Engineering'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Law and Political Sciences (4 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Law'),
  ('Law Program – Minor in Legal Studies in Hebrew'),
  ('Major: Law/ Minor: International Relations'),
  ('Political Science and Government Administration')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Law and Political Sciences'
ON CONFLICT ("facultyId", "name") DO NOTHING;

-- Faculty of Fine Arts (8 programs)
INSERT INTO "Major" ("id", "name", "facultyId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), source.name, f."id", NOW(), NOW()
FROM (VALUES
  ('Bachelor’s Program in Game Design'),
  ('Ceramic Art'),
  ('Expressive Art Therapy'),
  ('Fashion Design BA Program'),
  ('Graphic Design'),
  ('Interior Design'),
  ('Music'),
  ('Painting')
) AS source(name)
JOIN "Faculty" f ON f."name" = 'Faculty of Fine Arts'
ON CONFLICT ("facultyId", "name") DO NOTHING;

COMMIT;
