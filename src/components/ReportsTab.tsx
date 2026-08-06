'use client'
import { useState, useEffect, useRef, Fragment } from 'react'
import { Upload, Loader2, FileText, Trash2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Pill, Plus, X } from 'lucide-react'
import { renderMarkdownBold } from '@/lib/renderMarkdownBold'

const C = {
  green: '#538A22', greenDeep: '#2F5214', greenSoft: '#F2F9EC', greenBorder: '#C8E9A8',
  amber: '#D98A2B', amberSoft: '#FBF1E3', ink: '#1A2417', muted: '#6b7280',
  faint: '#8A9284', line: '#ECEBE3', card: '#FFFFFF', danger: '#b4462f', dangerSoft: '#FBEBE6',
}

const REPORT_TYPES = ['Gut Microbiome', 'Blood Report', 'Hormone Panel', 'Supplement Prescription', 'Other']

type Supplement = { name: string; dose: string; timing: string; duration: string; notes: string }

type Report = {
  id: string
  report_type: string
  file_name: string | null
  file_url: string | null
  patient_summary: string | null
  supplements: Supplement[] | null
  supplements_confirmed: boolean
  status: 'processing' | 'ready' | 'failed'
  error_message: string | null
  created_at: string
}

const cellInputStyle = {
  width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.line}`,
  fontSize: 12.5, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box' as const,
}

// The coach's review/edit/confirm gate for AI-extracted supplements — this
// is the only path that ever reaches the patient dashboard. Starts in edit
// mode automatically for a fresh extraction that hasn't been confirmed yet.
function SupplementReview({ report, patientId, onUpdated }: { report: Report; patientId: string; onUpdated: (r: Report) => void }) {
  const [rows, setRows] = useState<Supplement[]>(report.supplements ?? [])
  const [editing, setEditing] = useState(!report.supplements_confirmed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!report.supplements || report.supplements.length === 0) return null

  function updateRow(i: number, patch: Partial<Supplement>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }
  function addRow() {
    setRows((prev) => [...prev, { name: '', dose: '', timing: '', duration: '', notes: '' }])
  }

  async function save(confirm: boolean) {
    setSaving(true); setError('')
    try {
      const r = await fetch(`/api/patients/${patientId}/reports/${report.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplements: rows, supplements_confirmed: confirm }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Save failed'); return }
      onUpdated(j)
      setRows(j.supplements ?? [])
      if (confirm) setEditing(false)
    } catch {
      setError('Network error, try again.')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <Pill size={12} /> Supplements found in this report
        </div>
        {report.supplements_confirmed && !editing ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.greenDeep, background: C.greenSoft, borderRadius: 20, padding: '3px 9px' }}>
            <CheckCircle2 size={11} /> Confirmed, on patient dashboard
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberSoft, borderRadius: 20, padding: '3px 9px' }}>
            Needs review before patients can see this
          </span>
        )}
      </div>

      {editing ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((s, i) => (
              <div key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${C.line}` : 'none', paddingBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1.2fr 1fr auto', gap: 6, alignItems: 'center' }}>
                  <input style={cellInputStyle} value={s.name} placeholder="Name" onChange={(e) => updateRow(i, { name: e.target.value })} />
                  <input style={cellInputStyle} value={s.dose} placeholder="Dose / frequency" onChange={(e) => updateRow(i, { dose: e.target.value })} />
                  <input style={cellInputStyle} value={s.timing} placeholder="When to take" onChange={(e) => updateRow(i, { timing: e.target.value })} />
                  <input style={cellInputStyle} value={s.duration} placeholder="Duration" onChange={(e) => updateRow(i, { duration: e.target.value })} />
                  <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', padding: 4 }}><X size={14} /></button>
                </div>
                <input style={{ ...cellInputStyle, marginTop: 6, borderColor: s.notes ? C.amber : C.line, background: s.notes ? C.amberSoft : '#fff' }}
                  value={s.notes} placeholder="Safety note / contraindication (optional)" onChange={(e) => updateRow(i, { notes: e.target.value })} />
              </div>
            ))}
          </div>
          <button onClick={addRow} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, background: 'none', border: 'none', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            <Plus size={12} /> Add row
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button onClick={() => save(true)} disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={12} />} Confirm & show on patient dashboard
            </button>
            <button onClick={() => save(false)} disabled={saving}
              style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Save draft only
            </button>
            {error && <span style={{ fontSize: 12, color: C.danger }}>{error}</span>}
          </div>
        </>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.faint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '4px 8px 8px 0' }}>Name</th>
                  <th style={{ padding: '4px 8px 8px 0' }}>Dose</th>
                  <th style={{ padding: '4px 8px 8px 0' }}>When to take</th>
                  <th style={{ padding: '4px 0 8px 0' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <Fragment key={i}>
                    <tr style={{ borderTop: `1px solid ${C.line}` }}>
                      <td style={{ padding: '7px 8px 7px 0', fontWeight: 700, color: C.ink }}>{s.name}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: C.ink }}>{s.dose}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: C.ink }}>{s.timing}</td>
                      <td style={{ padding: '7px 0', color: C.ink }}>{s.duration}</td>
                    </tr>
                    {s.notes && (
                      <tr>
                        <td colSpan={4} style={{ padding: '0 0 7px 0', color: C.amber, fontSize: 11.5 }}>⚠ {s.notes}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setEditing(true)} style={{ marginTop: 8, background: 'none', border: 'none', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Edit</button>
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Report['status'] }) {
  if (status === 'processing') return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberSoft, borderRadius: 20, padding: '3px 9px' }}>
      <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Processing
    </span>
  )
  if (status === 'failed') return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.danger, background: C.dangerSoft, borderRadius: 20, padding: '3px 9px' }}>
      <AlertCircle size={11} /> Failed
    </span>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.greenDeep, background: C.greenSoft, borderRadius: 20, padding: '3px 9px' }}>
      <CheckCircle2 size={11} /> Ready
    </span>
  )
}

function ReportRow({ report, patientId, onDeleted, onUpdated }: { report: Report; patientId: string; onDeleted: (id: string) => void; onUpdated: (r: Report) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function del() {
    setDeleting(true)
    try {
      const r = await fetch(`/api/patients/${patientId}/reports/${report.id}`, { method: 'DELETE' })
      if (r.ok) onDeleted(report.id)
    } finally { setDeleting(false) }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
      <div onClick={() => setExpanded((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={16} color={C.green} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{report.report_type}</div>
          <div style={{ fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {report.file_name} · {new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
        </div>
        <StatusBadge status={report.status} />
        {expanded ? <ChevronUp size={15} color={C.faint} /> : <ChevronDown size={15} color={C.faint} />}
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: '14px 18px' }}>
          {report.status === 'ready' && report.patient_summary && (
            <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{renderMarkdownBold(report.patient_summary)}</p>
          )}
          {report.status === 'failed' && (
            <p style={{ fontSize: 12.5, color: C.danger, margin: 0 }}>{report.error_message}</p>
          )}
          {report.status === 'processing' && (
            <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>Extracting and summarizing, this can take up to a minute.</p>
          )}
          {report.status === 'ready' && <SupplementReview report={report} patientId={patientId} onUpdated={onUpdated} />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            {report.file_url && (
              <a href={report.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.green, fontWeight: 600, textDecoration: 'none' }}>View original file →</a>
            )}
            <button onClick={(e) => { e.stopPropagation(); del() }} disabled={deleting}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', color: C.danger, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReportsTab({ patientId }: { patientId: string }) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [reportType, setReportType] = useState(REPORT_TYPES[0])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [patientId])

  async function load() {
    const r = await fetch(`/api/patients/${patientId}/reports`)
    const j = await r.json()
    setReports(Array.isArray(j) ? j : [])
    setLoading(false)
  }

  async function upload(file: File) {
    setUploading(true); setUploadError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('report_type', reportType)
      const r = await fetch(`/api/patients/${patientId}/reports`, { method: 'POST', body: form })
      const j = await r.json()
      if (!r.ok) { setUploadError(j.error || 'Upload failed'); if (j.report) setReports((prev) => [j.report, ...prev]); return }
      setReports((prev) => [j, ...prev])
    } catch {
      setUploadError('Network error, try again.')
    } finally { setUploading(false) }
  }

  function removeReport(id: string) {
    setReports((prev) => prev.filter((r) => r.id !== id))
  }

  function updateReport(updated: Report) {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  return (
    <div>
      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Upload a report</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={reportType} onChange={(e) => setReportType(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13, background: '#fff' }}>
            {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {uploading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
            {uploading ? 'Processing…' : 'Choose file'}
          </button>
          <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }} />
          <span style={{ fontSize: 11.5, color: C.muted }}>PDF (text-based) or a photo/screenshot, up to 15MB.</span>
        </div>
        {uploadError && <div style={{ marginTop: 8, fontSize: 12.5, color: C.danger }}>{uploadError}</div>}
      </div>

      {loading ? (
        <div style={{ color: C.muted, fontSize: 13, padding: '10px 0' }}>Loading reports…</div>
      ) : reports.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No reports uploaded yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reports.map((r) => <ReportRow key={r.id} report={r} patientId={patientId} onDeleted={removeReport} onUpdated={updateReport} />)}
        </div>
      )}
    </div>
  )
}
