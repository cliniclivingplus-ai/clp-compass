'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type Coach = { id: string; full_name: string }

export default function NewPatientPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clinicPatientId, setClinicPatientId] = useState('')
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [nutritionistId, setNutritionistId] = useState('')
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/nutritionists').then((r) => r.json()).then((j) => setCoaches(Array.isArray(j) ? j : []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: name.trim(),
        clinic_patient_id: clinicPatientId.trim() || null,
        gender: gender || null,
        nutritionist_id: nutritionistId || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); setLoading(false); return }

    // Go directly to new session — no intermediate patient detail page
    router.push(`/patients/${json.id}/sessions/new`)
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <Link href="/patients" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 24 }}>
        <ArrowLeft size={14} /> Back
      </Link>

      <div style={{ background: '#fff', borderRadius: 14, padding: 32, border: '1px solid #e5e7eb' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 6 }}>New Patient</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>After adding the patient, you&apos;ll paste the Gemini meeting doc next.</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Patient ID (Clinicea)
            </label>
            <input
              value={clinicPatientId}
              onChange={e => setClinicPatientId(e.target.value)}
              placeholder="e.g. CLP-0042"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 15, boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 5 }}>Matches this patient&apos;s ID in Clinicea — prevents confusing two patients with the same name.</p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Patient Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Diksha Jain"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Gender</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['Female', 'Male', 'Other'].map(g => (
                <button key={g} type="button" onClick={() => setGender(g.toLowerCase())}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', border: '1px solid', borderColor: gender === g.toLowerCase() ? '#538A22' : '#e5e7eb', background: gender === g.toLowerCase() ? '#F2F9EC' : '#fff', color: gender === g.toLowerCase() ? '#538A22' : '#6b7280' }}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Assigned Coach</label>
            <select value={nutritionistId} onChange={e => setNutritionistId(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box', background: '#fff' }}>
              <option value="">— Select a coach —</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>

          {error && <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <button type="submit" disabled={loading || !name.trim()}
            style={{ width: '100%', padding: '12px', background: name.trim() ? '#538A22' : '#e5e7eb', color: name.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
            {loading ? 'Creating...' : 'Continue → Paste Meeting Doc'}
          </button>
        </form>
      </div>

      {/* Flow indicator */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {['Add Patient', 'Paste Gemini Doc', 'Q&A', 'Generate Dashboard'].map((step, i) => (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#538A22' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#fff' : '#9ca3af' }}>{i + 1}</div>
              <span style={{ fontSize: 11, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#538A22' : '#9ca3af' }}>{step}</span>
            </div>
            {i < 3 && <span style={{ color: '#d1d5db', fontSize: 12 }}>›</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
