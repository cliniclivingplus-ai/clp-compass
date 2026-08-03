import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MAX_REPORT_CHARS = 8000

export type ExtractedSupplement = {
  name: string
  dose: string
  timing: string
  duration: string
}

// Prescription slips (e.g. a MicrobiomeRx-style plan) mix brand names,
// generic names, and dosing codes ("1-0-1" = morning-noon-night) across a
// layout that doesn't linearize cleanly as plain text. This pulls a
// best-effort structured list — grounded strictly in what's actually
// written, nothing inferred — that a coach reviews and edits before it's
// ever shown to a patient (dosing info is never auto-published).
export async function extractSupplementsFromReport(rawText: string): Promise<ExtractedSupplement[]> {
  const completion = await groq.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    temperature: 0.1,
    max_tokens: 1400,
    reasoning_effort: 'low',
    response_format: { type: 'json_object' as const },
    messages: [
      {
        role: 'system',
        content: `You extract a supplement/medication list from a clinical report's raw text, verbatim — never infer, estimate, or add a dose/timing/duration that isn't explicitly written. If the text has no supplement or medication list, return an empty array.

For each item found, return:
- name: the supplement/medication name as written (prefer the specific/generic name over a brand name if both appear, e.g. "Oregano Oil" not "Gut Cleanse Care")
- dose: the amount, if stated (e.g. "200 mg", "1-0-1", "2-4 g/day") — empty string if not stated
- timing: when/how to take it, if stated (e.g. "With meals", "Morning on empty stomach", "Bedtime") — empty string if not stated
- duration: how long to take it, if stated (e.g. "4-6 weeks", "Ongoing") — empty string if not stated

Respond with strict JSON only: {"supplements": [{"name": "...", "dose": "...", "timing": "...", "duration": "..."}]}`,
      },
      {
        role: 'user',
        content: rawText.slice(0, MAX_REPORT_CHARS),
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content?.trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed.supplements) ? parsed.supplements : []
    return list
      .filter((s: unknown): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as Record<string, unknown>).name === 'string' && !!(s as Record<string, unknown>).name)
      .map((s: Record<string, unknown>) => ({
        name: String(s.name).trim(),
        dose: typeof s.dose === 'string' ? s.dose.trim() : '',
        timing: typeof s.timing === 'string' ? s.timing.trim() : '',
        duration: typeof s.duration === 'string' ? s.duration.trim() : '',
      }))
  } catch {
    return []
  }
}
