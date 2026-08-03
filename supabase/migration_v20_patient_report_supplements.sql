-- Supplements extracted from an uploaded report (e.g. a MicrobiomeRx
-- prescription slip): a draft array the AI extracts, which a coach must
-- review/edit and explicitly confirm before it ever reaches the patient
-- dashboard — this is dosing information, so nothing auto-publishes.
ALTER TABLE patient_reports ADD COLUMN IF NOT EXISTS supplements JSONB;
ALTER TABLE patient_reports ADD COLUMN IF NOT EXISTS supplements_confirmed BOOLEAN NOT NULL DEFAULT false;
