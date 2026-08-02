-- A recipe's own photo, set directly by the coach when adding it — takes
-- priority over the fuzzy tag-matched picture bank (matchGuideImageDistinct)
-- whenever it's set, since a coach's explicit choice always beats a guess.
-- Nullable: a recipe with no photo just falls back to the old tag-match
-- behavior, same as every recipe added before this column existed.
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS image_storage_path TEXT;
