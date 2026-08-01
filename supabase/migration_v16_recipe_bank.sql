-- Curated recipe bank, same pattern as guide_images: coaches build it up once,
-- tagged by meal type (and optionally topic), and the patient dashboard shows
-- matching recipes as clickable pills with a real ingredients/steps popup —
-- never fabricated, always what a coach actually entered.
CREATE TABLE IF NOT EXISTS recipe_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  protein_label TEXT,
  ingredients TEXT NOT NULL,
  steps TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipe_bank_meal_type_idx ON recipe_bank(meal_type);
