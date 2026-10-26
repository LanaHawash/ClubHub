BEGIN;

INSERT INTO "Label" (
    id,
    name,
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    labels.name,
    NOW(),
    NOW()
FROM (
    VALUES
        ('Tech'),
        ('Arts'),
        ('Career'),
        ('Community'),
        ('Competitions'),
        ('Hands-on'),
        ('Health'),
        ('Business'),
        ('Sustainability'),
        ('AI'),
        ('IT'),
        ('Cybersecurity'),
        ('Robotics'),
        ('Electronics'),
        ('Engineering'),
        ('Mechanics'),
        ('Architecture'),
        ('Science'),
        ('Physics'),
        ('Mathematics'),
        ('Research'),
        ('Healthcare'),
        ('Medicine'),
        ('Nursing'),
        ('Pharmacy'),
        ('Economics'),
        ('Entrepreneurship'),
        ('Finance'),
        ('Marketing'),
        ('Languages'),
        ('Volunteering'),
        ('Community Service'),
        ('Social Impact'),
        ('Environment'),
        ('Sports'),
        ('Culture'),
        ('Leadership'),
        ('Innovation')
) AS labels(name)
ON CONFLICT (name) DO NOTHING;

COMMIT;