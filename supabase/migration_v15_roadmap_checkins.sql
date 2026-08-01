-- Patient check-ins on the public roadmap dashboard: one row per (week,
-- action, calendar day) a patient ticked off. Coaches read this history from
-- the same dashboard to see real adherence before the next session, rather
-- than relying on the patient's self-report at the call.
CREATE TABLE IF NOT EXISTS roadmap_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  week_number INT NOT NULL,
  action_index INT NOT NULL,
  checkin_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(roadmap_id, week_number, action_index, checkin_date)
);
CREATE INDEX IF NOT EXISTS roadmap_checkins_roadmap_idx ON roadmap_checkins(roadmap_id);
