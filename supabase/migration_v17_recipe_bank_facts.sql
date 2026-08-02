-- Optional "facts" fields for recipe_bank, sourced from the coach's own
-- Canva recipe cards (eat/prep/cook time, difficulty, health score, tools,
-- notes) — all nullable, since most recipes (manually typed or bulk-imported
-- from a plain ingredients/steps list) won't have them. A recipe with none of
-- these set still works exactly as before; the dashboard only renders a
-- fact/section when the coach actually entered it, never a placeholder.
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS eat_time TEXT;
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS prep_time TEXT;
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS cook_time TEXT;
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS health_score TEXT;
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS tools TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS notes TEXT[] NOT NULL DEFAULT '{}';
