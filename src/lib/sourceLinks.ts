// Shared by the PDF (ClientGuideDocument.tsx) and the web dashboard
// (DashboardClient.tsx), so "Grounded in" citations look and link identically
// in both places. KB titles carry the filename artifacts of the shadow-
// library site they were originally sourced from (e.g. "(Z Library.Sk,
// 1Lib.Sk, Z Lib.Sk).Pdf") — not something to show a patient, or to link to.
// Strip it, then link to a legitimate Google Books search for the cleaned
// title instead; there's no real source URL stored anywhere to link to
// directly.
export function cleanSourceTitle(title: string): string {
  return title
    // Strip a trailing ".pdf" first — titles like "...).Pdf" otherwise defeat
    // the z-library regex below, since its optional trailing "." only
    // tolerates a bare period immediately after the closing paren, not
    // ".Pdf" (period + extension letters).
    .replace(/\.pdf\s*$/i, '')
    .replace(/\s*\((?:[^()]*\b(?:z\s*library|1\s*lib|zlib)\b[^()]*)\)\.?\s*$/i, '')
    .trim()
}

export function sourceSearchUrl(title: string, sourceType: string): string {
  const clean = cleanSourceTitle(title)
  return sourceType === 'book'
    ? `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(clean)}`
    : `https://www.google.com/search?q=${encodeURIComponent(clean)}`
}
