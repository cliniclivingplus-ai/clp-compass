'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Wand2, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import DashboardClient from '@/app/dashboard/[roadmapId]/DashboardClient'
import type { GuideData } from '@/lib/pdf/ClientGuideDocument'

type WeeklyPlan = {
  week_number: number
  focus_theme: string
  cause: string
  actions: string[]
  milestone?: string
}

type KbSource = { title: string; source_type: string; chunk_preview: string }

type Roadmap = {
  id: string
  overview: string
  lifestyle_guidelines: string
  nutritionist_guidelines: string
  weekly_schedule: WeeklyPlan[]
  kb_sources: KbSource[]
  duration_months: number
}

const DURATION_OPTIONS = [
  { label: '1 Week', months: 0.25 },
  { label: '2 Weeks', months: 0.5 },
  { label: '1 Month', months: 1 },
  { label: '2 Months', months: 2 },
  { label: '3 Months', months: 3 },
  { label: '6 Months', months: 6 },
  { label: '12 Months', months: 12 },
]

export default function InterpretPage() {
  const params = useParams()
  const patientId = params.id as string
  const sessionId = params.sessionId as string

  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null)
  const [guideData, setGuideData] = useState<GuideData | null>(null)
  const [guideDataError, setGuideDataError] = useState('')
  const [error, setError] = useState('')
  const [duration, setDuration] = useState(1)

  useEffect(() => {
    async function loadExisting() {
      try {
        const res = await fetch(`/api/roadmaps?session_id=${sessionId}`)
        if (res.ok) {
          const json = await res.json()
          if (json?.id) setRoadmap(json)
        }
      } catch {}
      finally { setFetching(false) }
    }
    loadExisting()
  }, [sessionId])

  // Same GuideData the patient dashboard and PDF use — fetched fresh
  // whenever a roadmap is generated or regenerated, so the editable preview
  // below always reflects exactly what's in the database.
  useEffect(() => {
    if (!roadmap?.id) { setGuideData(null); return }
    setGuideData(null)
    setGuideDataError('')
    fetch(`/api/roadmaps/${roadmap.id}/guide-data`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Could not load the dashboard preview.')
        return j.data as GuideData
      })
      .then(setGuideData)
      .catch((err) => setGuideDataError(err.message || 'Could not load the dashboard preview.'))
  }, [roadmap?.id])

  async function generateRoadmap() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, patient_id: patientId, duration_months: duration }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Generation failed'); return }
      setRoadmap(json.roadmap)
    } catch { setError('Network error — try again') }
    finally { setLoading(false) }
  }

  if (fetching) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <Loader2 size={28} color="#538A22" style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        {/* Back */}
        <Link href={`/patients/${patientId}/sessions/${sessionId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 20 }}>
          <ArrowLeft size={14} /> Back to Session
        </Link>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>Patient Dashboard</h1>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 3 }}>Generate → edit below → share the dashboard link with your patient</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!roadmap && DURATION_OPTIONS.map(({ label, months }) => (
              <button key={label} onClick={() => setDuration(months)}
                style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', borderColor: duration === months ? '#538A22' : '#d1d5db', background: duration === months ? '#F2F9EC' : '#fff', color: duration === months ? '#538A22' : '#6b7280' }}>
                {label}
              </button>
            ))}
            {roadmap ? (
              <button onClick={() => setRoadmap(null)}
                style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#6b7280' }}>
                ↺ Regenerate
              </button>
            ) : (
              <button onClick={generateRoadmap} disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', background: '#538A22', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.8 : 1 }}>
                {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={15} />}
                {loading ? 'Generating...' : 'Generate Dashboard'}
              </button>
            )}
          </div>
        </div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {loading && <div style={{ background: '#F2F9EC', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#538A22', marginBottom: 16 }}>🔍 Searching KB → 🧠 Interpreting → ✍️ Writing plan (~30s)...</div>}

        {!roadmap && !loading && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '48px 24px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af' }}>
            <Wand2 size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ fontSize: 15, fontWeight: 500, color: '#374151' }}>No dashboard yet</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Select a duration above and click Generate Dashboard</p>
          </div>
        )}

        {roadmap && !guideData && !guideDataError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13, padding: '24px 0' }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading preview…
          </div>
        )}
        {guideDataError && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{guideDataError}</div>}
      </div>

      {/* The editable dashboard preview breaks out of the narrow column above
          — it's designed to be a full-width standalone page (same component
          the patient sees), not a form embedded in a form. */}
      {roadmap && guideData && (
        <div style={{ marginTop: 4 }}>
          <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 0 12px' }}>
            <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 13, color: '#92400e' }}>
              💡 This is exactly what your patient will see. Edit anything below, click <strong>Save changes</strong>, then use <strong>Preview as patient</strong> to copy the dashboard link and send it over.
            </div>
          </div>
          <DashboardClient roadmapId={roadmap.id} patientId={patientId} data={guideData} initialCheckins={[]} editable />
        </div>
      )}
    </div>
  )
}
