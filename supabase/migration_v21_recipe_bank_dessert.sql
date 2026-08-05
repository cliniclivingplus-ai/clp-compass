-- Adds "dessert" as a real 5th meal_type category (previously only
-- breakfast/lunch/dinner/snack existed, so desserts had nowhere accurate to
-- go). The constraint is inline on the original CREATE TABLE in
-- migration_v16, so Postgres auto-named it recipe_bank_meal_type_check.
ALTER TABLE recipe_bank DROP CONSTRAINT IF EXISTS recipe_bank_meal_type_check;
ALTER TABLE recipe_bank ADD CONSTRAINT recipe_bank_meal_type_check
  CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'dessert'));
