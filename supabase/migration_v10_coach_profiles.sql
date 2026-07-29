-- Wire up the previously-unused `nutritionists` table for real, and replace
-- the fragile free-text `patients.assigned_nutritionist` matching (drifted
-- into 'Padma' / 'Bhavana' / 'Bhavana ' / 'sarah' / 'Sarah') with a proper
-- foreign key, so a coach's photo/bio always resolves correctly.

ALTER TABLE nutritionists ADD COLUMN IF NOT EXISTS response_note TEXT;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS nutritionist_id UUID REFERENCES nutritionists(id);

-- Seed the coaches already referenced by name in existing patient data.
INSERT INTO nutritionists (full_name, designation)
SELECT 'Padma', 'Nutrition Coach' WHERE NOT EXISTS (SELECT 1 FROM nutritionists WHERE full_name = 'Padma')
UNION ALL
SELECT 'Bhavana', 'Nutrition Coach' WHERE NOT EXISTS (SELECT 1 FROM nutritionists WHERE full_name = 'Bhavana')
UNION ALL
SELECT 'Sarah', 'Nutrition Coach' WHERE NOT EXISTS (SELECT 1 FROM nutritionists WHERE full_name = 'Sarah');

-- Backfill nutritionist_id from the old free-text field (trim/case-insensitive).
UPDATE patients p
SET nutritionist_id = n.id
FROM nutritionists n
WHERE p.nutritionist_id IS NULL
  AND p.assigned_nutritionist IS NOT NULL
  AND trim(lower(p.assigned_nutritionist)) = trim(lower(n.full_name));
