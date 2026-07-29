-- Same-name patients were being confused for each other. This adds a
-- coach-entered ID matching the patient's existing Clinicea record — the
-- canonical, unambiguous identifier for "which patient is this."
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_patient_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS patients_clinic_patient_id_key
  ON patients (clinic_patient_id) WHERE clinic_patient_id IS NOT NULL;
