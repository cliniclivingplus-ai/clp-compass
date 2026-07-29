-- Coach-editable overrides for the PDF Client Guide, for fields that don't
-- already have a natural home on roadmaps/patients (goal label shown on the
-- cover, and the "Your why" reflection). Editing lifestyle_guidelines or
-- overview directly updates those existing columns instead.
ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS guide_overrides JSONB DEFAULT '{}'::jsonb;
