// Matches a picture-bank image to a piece of guide content by simple tag/keyword
// overlap — deliberately conservative (same principle as the KB keyword-search
// fallback elsewhere in this app): a wrong or forced "close enough" image looks
// unprofessional in a printed clinical guide, so this only ever returns a match
// when a tag is actually present in the text. No match beats a bad match.
export type GuideImage = { id: string; label: string; tags: string[]; image_url: string }

const STOP_WORDS = new Set(['the', 'and', 'with', 'your', 'this', 'that', 'from', 'for', 'you', 'are', 'was', 'her', 'his', 'their'])

export function matchGuideImage(text: string, bank: GuideImage[]): GuideImage | null {
  if (!text?.trim() || !bank.length) return null
  const haystack = text.toLowerCase()

  let best: { image: GuideImage; score: number } | null = null
  for (const image of bank) {
    let score = 0
    for (const tag of image.tags) {
      const t = tag.toLowerCase().trim()
      // Word-boundary match, not a raw substring check — "food" must not
      // match inside "superfood", or every generically-tagged image becomes
      // a candidate for every section, which is how the same stock photo
      // ended up printed twice in one guide.
      if (t.length > 2 && !STOP_WORDS.has(t) && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack)) score += 1
    }
    if (score > 0 && (!best || score > best.score)) best = { image, score }
  }
  return best?.image ?? null
}

// Picks a distinct image per section so the same photo doesn't repeat across
// a multi-week guide — falls back to the best match even if already used
// rather than showing nothing, but prefers an unused one when scores tie.
export function matchGuideImageDistinct(text: string, bank: GuideImage[], used: Set<string>): GuideImage | null {
  const fresh = matchGuideImage(text, bank.filter((img) => !used.has(img.id)))
  if (fresh) { used.add(fresh.id); return fresh }
  return null
}
