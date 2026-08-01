-- Curated picture bank for the PDF Client Guide. Coaches upload real photos
-- once, tag them by topic (e.g. "sleep", "walking", "breakfast", "gut-health"),
-- and generation matches images to a week's focus theme / food menu by tag
-- overlap — sparingly, only where a real match exists, never a forced filler.
CREATE TABLE IF NOT EXISTS guide_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  storage_path TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
