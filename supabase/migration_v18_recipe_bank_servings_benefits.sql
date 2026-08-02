-- Two more optional recipe_bank fields, same "only real, never fabricated"
-- rule as migration_v17: a static serving count (no scaling math, since
-- ingredients are stored as free-text lines rather than structured
-- amount+unit+name) and "why it works" benefit bullets, sourced from a
-- coach's own recipe card or superfoods notes when they actually wrote one.
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS servings TEXT;
ALTER TABLE recipe_bank ADD COLUMN IF NOT EXISTS benefits TEXT[] NOT NULL DEFAULT '{}';
