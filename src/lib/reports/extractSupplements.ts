import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MAX_REPORT_CHARS = 8000

export type ExtractedSupplement = {
  name: string
  dose: string
  timing: string
  duration: string
  notes: string
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
        content: `You extract a supplement/medication/procedure list from a clinical report's raw text, verbatim — never infer, estimate, or add a dose/timing/duration that isn't explicitly written. If the text has no such list, return an empty array.

Some entries are oral supplements (a chemical dose like "200 mg"); others are procedures (IV infusions, autohemotherapy, insufflation) that have no chemical dose but do have a session frequency like "1-2x/week" or a session count like "8 sessions" — treat that frequency/session-count as the "dose" for those, don't leave it blank just because it isn't a mg/g amount.

Some source documents give both a generic/specific name and a separate brand/product name for the same item (e.g. "Oregano Oil" / "Gut Cleanse Care") — prefer the generic one as "name" when both appear. Other documents only ever give one name (often a product name, e.g. "Happy Bowels") with no separate generic name anywhere — in that case just use the one name that's actually there; don't invent a generic name that isn't written.

For each item found, return:
- name: the name as written (see naming rule above)
- dose: the amount or frequency, if stated (e.g. "200 mg", "1-0-1", "2-4 g/day", "1-2x/week") — empty string if not stated
- timing: when/how to take it, if stated (e.g. "With meals", "Morning on empty stomach", "Bedtime") — empty string if not stated
- duration: how long / how many sessions, if stated (e.g. "4-6 weeks", "8 sessions", "Ongoing") — empty string if not stated
- notes: any safety warning, contraindication, or other caveat explicitly attached to this item (e.g. "G6PD screen; bleeding disorders; pregnancy") — empty string if none. Never move dose/timing/duration info into notes; this is only for warnings/caveats that don't fit those fields.

Respond with strict JSON only: {"supplements": [{"name": "...", "dose": "...", "timing": "...", "duration": "...", "notes": "..."}]}`,
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
        notes: typeof s.notes === 'string' ? s.notes.trim() : '',
      }))
  } catch {
    return []
  }
}
