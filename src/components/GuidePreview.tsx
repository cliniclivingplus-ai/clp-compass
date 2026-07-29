'use client'
import { useState, useEffect } from 'react'
import { Save, Check, Loader2 } from 'lucide-react'
import { reshapeRoadmapIntoQuarters, type WeeklyPlan } from '@/lib/pdf/reshapeRoadmap'

const C = {
  bg: '#F7EEE1', paper: '#FBF5EA', ink: '#2C2418', inkSoft: '#4A4034',
  accent: '#B1512E', accentSoft: '#E7DAC0', rule: '#D8C6A4', muted: '#948A76',
}

type Coach = { id: string; full_name: string }

type RoadmapData = {
  id: string
  overview: string
  lifestyle_guidelines: string
  kb_sources: { title: string; source_type: string }[]
  weekly_schedule: WeeklyPlan[]
  duration_months: number
  guide_overrides: { goal_label?: string; why_reflection?: string; coach_quote?: string } | null
  patients: { full_name: string; nutritionist_id: string | null; primary_concern: string | null }
  sessions: { case_summary: { goal?: string; coach_quote?: string } | null } | null
}

const inputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.rule}`,
  fontSize: 13.5, color: C.ink, fontFamily: 'inherit', background: C.paper, boxSizing: 'border-box' as const,
}
const cardStyle = {
  background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '18px 22px', marginBottom: 16,
}
const labelStyle = { fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.accent, fontWeight: 700, marginBottom: 8 }

export default function GuidePreview({ roadmapId, patientId }: { roadmapId: string; patientId: string }) {
  const [data, setData] = useState<RoadmapData | null>(null)
  const [goalLabel, setGoalLabel] = useState('')
  const [whyReflection, setWhyReflection] = useState('')
  const [coachQuote, setCoachQuote] = useState('')
  const [nutritionistId, setNutritionistId] = useState('')
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [lifestyle, setLifestyle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    fetch(`/api/roadmaps/${roadmapId}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Could not load this guide.')
        return j as RoadmapData
      })
      .then((j) => {
        setData(j)
        setGoalLabel(j.guide_overrides?.goal_label || j.sessions?.case_summary?.goal || j.patients?.primary_concern || '')
        setWhyReflection(j.guide_overrides?.why_reflection || (j.overview || '').split('\n\n')[0] || '')
        setCoachQuote(j.guide_overrides?.coach_quote || j.sessions?.case_summary?.coach_quote || '')
        setNutritionistId(j.patients?.nutritionist_id || '')
        setLifestyle(j.lifestyle_guidelines || '')
      })
      .catch((err) => setLoadError(err.message || 'Could not load this guide.'))
    fetch('/api/nutritionists').then((r) => r.json()).then((j) => setCoaches(Array.isArray(j) ? j : []))
  }, [roadmapId])

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      const [roadmapRes, patientRes] = await Promise.all([
        fetch(`/api/roadmaps/${roadmapId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lifestyle_guidelines: lifestyle,
            guide_overrides: { goal_label: goalLabel, why_reflection: whyReflection, coach_quote: coachQuote },
          }),
        }),
        fetch(`/api/patients/${patientId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nutritionist_id: nutritionistId || null }),
        }),
      ])
      if (!roadmapRes.ok || !patientRes.ok) {
        const failed = !roadmapRes.ok ? await roadmapRes.json().catch(() => null) : await patientRes.json().catch(() => null)
        setSaveError(failed?.error || 'Save failed — try again.')
        return
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaveError('Network error — try again.')
    } finally { setSaving(false) }
  }

  if (loadError) return (
    <div style={{ color: '#b4462f', fontSize: 13, padding: '24px 0' }}>{loadError}</div>
  )

  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13, padding: '24px 0' }}>
      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading preview…
    </div>
  )

  const quarters = reshapeRoadmapIntoQuarters(data.weekly_schedule)
  const firstName = data.patients?.full_name?.split(' ')[0] ?? 'Patient'

  return (
    <div style={{ background: C.bg, borderRadius: 16, padding: 24, border: `1px solid ${C.rule}` }}>
      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>

      {/* Cover-ish header */}
      <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, background: C.accent, color: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 12, fontWeight: 700 }}>CLP</div>
        <div style={{ fontSize: 10, letterSpacing: 3, color: C.muted }}>CLINIC LIVING PLUS</div>
        <div style={{ fontSize: 22, color: C.ink, marginTop: 6 }}>Your wellness guide</div>
        <div style={{ fontSize: 13, color: C.ink, marginTop: 4, fontWeight: 600 }}>{data.patients?.full_name}</div>
      </div>

      {/* Goal — editable */}
      <div style={cardStyle}>
        <div style={labelStyle}>Goal (shown on the cover)</div>
        <input style={inputStyle} value={goalLabel} onChange={(e) => setGoalLabel(e.target.value)} placeholder="e.g. Steady energy, no more 4pm crashes" />
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
          The motivating outcome, not the problem — auto-filled from the case summary&apos;s AI-generated goal.
        </div>
      </div>

      {/* Meet your coach — editable */}
      <div style={cardStyle}>
        <div style={labelStyle}>Meet your coach</div>
        <select style={inputStyle} value={nutritionistId} onChange={(e) => setNutritionistId(e.target.value)}>
          <option value="">— Select a coach —</option>
          {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, marginBottom: 12 }}>
          Photo, designation, and bio come from the coach&apos;s own profile —{' '}
          <a href="/coaches" target="_blank" style={{ color: C.accent }}>manage coaches</a>.
        </div>
        <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5, fontStyle: 'italic' }} rows={2}
          value={coachQuote} onChange={(e) => setCoachQuote(e.target.value)}
          placeholder={`Personal callback quote, e.g. "${firstName} — I remember what you said about..." — grounded in something they actually said, or leave blank.`} />
      </div>

      {/* Your why — editable */}
      <div style={cardStyle}>
        <div style={labelStyle}>Your why</div>
        <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={3}
          value={whyReflection} onChange={(e) => setWhyReflection(e.target.value)}
          placeholder={`${firstName}, from what you shared with us...`} />
      </div>

      {/* Lifestyle guidelines — editable */}
      <div style={cardStyle}>
        <div style={labelStyle}>Lifestyle guidelines</div>
        <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.6, fontFamily: 'inherit' }} rows={6}
          value={lifestyle} onChange={(e) => setLifestyle(e.target.value)}
          placeholder="• One lifestyle change per line, tied to something specific in their case" />
        {data.kb_sources?.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: C.muted }}>
            Grounded in: {data.kb_sources.map((s) => s.title.split('(')[0].trim()).join(', ')}
          </div>
        )}
      </div>

      {/* Your 12-month roadmap — read-only, derived from the generated weekly plan */}
      <div style={cardStyle}>
        <div style={labelStyle}>Your 12-month roadmap</div>
        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 12 }}>
          Derived from the {data.weekly_schedule?.length ?? 0}-week plan just generated — to change this, use ↺ Regenerate above.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {quarters.map((q) => (
            <div key={q.label} style={{ padding: '10px 14px', borderRadius: 8, background: q.planned ? C.accentSoft : 'transparent', border: `1px solid ${C.rule}`, opacity: q.planned ? 1 : 0.7 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.accent }}>{q.label} · {q.monthRange}</div>
              <div style={{ fontSize: 13, color: C.ink, marginTop: 3 }}>{q.macroGoal}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Nutrition guidelines — static reference, not per-patient */}
      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <div style={labelStyle}>Nutrition guidelines &amp; recipes</div>
        <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.6 }}>
          Standard CLP food-choice lists for breakfast, lunch and dinner are included automatically (pages 10–12) — not editable here since they&apos;re shared reference content, not per-patient. This week&apos;s recipes are handed to the patient separately by {coaches.find((c) => c.id === nutritionistId)?.full_name || 'your coach'}.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 18 }}>
        {saveError && <span style={{ fontSize: 12.5, color: '#b4462f' }}>{saveError}</span>}
        <button onClick={save} disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9, border: 'none', background: saved ? '#3a6118' : C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
