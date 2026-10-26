-- Prevent label names that differ only by capitalization.
-- Also ignore leading and trailing spaces when checking uniqueness.

CREATE UNIQUE INDEX "Label_normalized_name_key"
ON "Label" (LOWER(BTRIM("name")));