// nutritionist_guidelines is a single AI-generated string with four labeled
// sections (Biomarkers / Diet protocol / Supplements / Red flags), each a
// bullet list. This splits it into those sections for reuse across pages
// (Supplements page, "When to reach us" red flags) without re-generating
// anything — same real content, different presentation.
export type ParsedGuidelines = {
  biomarkers: string[]
  dietProtocol: string[]
  supplements: string[]
  redFlags: string[]
}

const SECTION_HEADERS: { key: keyof ParsedGuidelines; pattern: RegExp }[] = [
  { key: 'biomarkers', pattern: /biomarkers?:/i },
  { key: 'dietProtocol', pattern: /diet protocol:/i },
  { key: 'supplements', pattern: /supplements?:/i },
  { key: 'redFlags', pattern: /red flags?:/i },
]

export function parseNutritionistGuidelines(text: string): ParsedGuidelines {
  const result: ParsedGuidelines = { biomarkers: [], dietProtocol: [], supplements: [], redFlags: [] }
  if (!text) return result

  // Split on lines that look like a section header ("• Supplements:" etc.)
  const lines = text.split('\n')
  let current: keyof ParsedGuidelines | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const header = SECTION_HEADERS.find((h) => h.pattern.test(line) && line.replace(/^[•\-\s]+/, '').length < 40)
    if (header) { current = header.key; continue }
    if (!current) continue
    const bullet = line.replace(/^[•\-\s]+/, '').trim()
    if (bullet) result[current].push(bullet)
  }
  return result
}
