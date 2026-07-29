'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Loader2, Camera, Save, Check, User, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

const C = {
  green: '#538A22', greenDeep: '#2F5214', greenSoft: '#F2F9EC', greenBorder: '#C8E9A8',
  ink: '#1A2417', muted: '#6b7280', faint: '#8A9284', line: '#ECEBE3', card: '#FFFFFF',
  danger: '#b4462f', dangerSoft: '#FBEBE6',
}

type Coach = {
  id: string
  full_name: string
  designation: string | null
  bio: string | null
  response_note: string | null
  photo_url: string | null
  email: string | null
}

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.line}`,
  fontSize: 13.5, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box' as const,
}
const labelStyle = { fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6, display: 'block' }

function Avatar({ photoUrl, size }: { photoUrl: string | null; size: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: photoUrl ? `url(${photoUrl}) center/cover` : C.greenSoft,
      border: `1px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {!photoUrl && <User size={size * 0.36} color={C.green} />}
    </div>
  )
}

function CoachRow({ coach, onUpdated, onDeleted }: {
  coach: Coach
  onUpdated: (c: Coach) => void
  onDeleted: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [fullName, setFullName] = useState(coach.full_name)
  const [designation, setDesignation] = useState(coach.designation ?? '')
  const [email, setEmail] = useState(coach.email ?? '')
  const [bio, setBio] = useState(coach.bio ?? '')
  const [responseNote, setResponseNote] = useState(coach.response_note ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    setSaving(true); setError('')
    try {
      const r = await fetch(`/api/nutritionists/${coach.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, designation, email, bio, response_note: responseNote }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Save failed'); return }
      onUpdated(j)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Network error — try again.')
    } finally { setSaving(false) }
  }

  async function uploadPhoto(file: File) {
    setUploading(true); setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch(`/api/nutritionists/${coach.id}/photo`, { method: 'POST', body: form })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Upload failed'); return }
      onUpdated(j)
    } catch {
      setError('Network error — try again.')
    } finally { setUploading(false) }
  }

  async function confirmDelete() {
    setDeleting(true); setError('')
    try {
      const r = await fetch(`/api/nutritionists/${coach.id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Delete failed'); setConfirmingDelete(false); return }
      onDeleted(coach.id)
    } catch {
      setError('Network error — try again.'); setConfirmingDelete(false)
    } finally { setDeleting(false) }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
      {/* Collapsed row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', cursor: 'pointer' }}
      >
        <Avatar photoUrl={coach.photo_url} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{coach.full_name}</div>
          <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {coach.designation || 'No designation set'}{coach.email ? ` · ${coach.email}` : ''}
          </div>
        </div>
        {expanded ? <ChevronUp size={16} color={C.faint} /> : <ChevronDown size={16} color={C.faint} />}
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: '18px 20px', display: 'flex', gap: 20 }}>
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <div onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }} style={{ position: 'relative', cursor: 'pointer' }}>
              <Avatar photoUrl={coach.photo_url} size={84} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', padding: '4px 0', display: 'flex', justifyContent: 'center', borderBottomLeftRadius: '50%', borderBottomRightRadius: '50%' }}>
                {uploading ? <Loader2 size={12} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={12} color="#fff" />}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f) }} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Designation</label>
                <input style={inputStyle} value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Nutrition Coach · Gut & Metabolic Health" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@cliniclivingplus.com" />
            </div>
            <div>
              <label style={labelStyle}>Bio</label>
              <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={3} value={bio} onChange={(e) => setBio(e.target.value)}
                placeholder="Your coaching philosophy, in your own words." />
            </div>
            <div>
              <label style={labelStyle}>Response note</label>
              <input style={inputStyle} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} placeholder="e.g. Reach me directly between sessions — I typically respond within a day." />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              {confirmingDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.dangerSoft, padding: '6px 10px', borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>Delete {coach.full_name}? Any patients assigned to them will be unlinked.</span>
                  <button onClick={confirmDelete} disabled={deleting}
                    style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: C.danger, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {deleting ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmingDelete(false)}
                    style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmingDelete(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.danger, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <Trash2 size={13} /> Delete
                </button>
              )}
              {error && <span style={{ fontSize: 12, color: C.danger }}>{error}</span>}
              <button onClick={save} disabled={saving}
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: saved ? C.greenDeep : C.green, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <Check size={13} /> : <Save size={13} />}
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    fetch('/api/nutritionists').then((r) => r.json()).then((j) => { setCoaches(Array.isArray(j) ? j : []); setLoading(false) })
  }, [])

  function updateCoach(updated: Coach) {
    setCoaches((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  function removeCoach(id: string) {
    setCoaches((prev) => prev.filter((c) => c.id !== id))
  }

  async function addCoach() {
    if (!newName.trim()) return
    setAdding(true); setAddError('')
    try {
      const r = await fetch('/api/nutritionists', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: newName.trim() }),
      })
      const j = await r.json()
      if (!r.ok) { setAddError(j.error || 'Could not add coach'); return }
      setCoaches((prev) => [...prev, j]); setNewName(''); setShowAddForm(false)
    } catch {
      setAddError('Network error — try again.')
    } finally { setAdding(false) }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Coaches</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
        Each coach&apos;s own photo, designation, and bio — used on the &quot;Meet your coach&quot; page of every patient&apos;s wellness guide. Click a row to edit.
      </p>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading coaches…
        </div>
      ) : coaches.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: '12px 0' }}>No coaches yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {coaches.map((c) => <CoachRow key={c.id} coach={c} onUpdated={updateCoach} onDeleted={removeCoach} />)}
        </div>
      )}

      {showAddForm ? (
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCoach(); if (e.key === 'Escape') { setShowAddForm(false); setNewName(''); setAddError('') } }}
            placeholder="New coach's name" style={{ ...inputStyle, maxWidth: 280 }} autoFocus />
          <button onClick={addCoach} disabled={adding || !newName.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {adding ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Add coach
          </button>
          <button onClick={() => { setShowAddForm(false); setNewName(''); setAddError('') }}
            style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 13, color: C.muted, cursor: 'pointer' }}>
            Cancel
          </button>
          {addError && <span style={{ fontSize: 12.5, color: C.danger }}>{addError}</span>}
        </div>
      ) : (
        <button onClick={() => setShowAddForm(true)}
          style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.greenBorder}`, background: C.greenSoft, color: C.greenDeep, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={14} /> Add coach
        </button>
      )}
    </div>
  )
}
