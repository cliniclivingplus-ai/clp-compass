-- Patient lab/diagnostic reports (gut microbiome, blood report, etc.) —
-- uploaded file + extracted text + a patient-friendly plain-language summary,
-- feeding into roadmap/PDF generation alongside the consult transcript.
CREATE TABLE IF NOT EXISTS patient_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,        -- free label, e.g. 'Gut Microbiome', 'Blood Report'
  file_name TEXT,
  file_url TEXT,
  raw_text TEXT,                    -- extracted text (OCR or PDF text layer)
  patient_summary TEXT,             -- AI-generated, plain-language explanation
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE patient_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_patient_reports" ON patient_reports FOR ALL USING (true) WITH CHECK (true);
