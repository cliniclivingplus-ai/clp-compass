'use client'
import { useState, useEffect, useRef } from 'react'
import { Upload, Loader2, FileText, Trash2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'

const C = {
  green: '#538A22', greenDeep: '#2F5214', greenSoft: '#F2F9EC', greenBorder: '#C8E9A8',
  amber: '#D98A2B', amberSoft: '#FBF1E3', ink: '#1A2417', muted: '#6b7280',
  faint: '#8A9284', line: '#ECEBE3', card: '#FFFFFF', danger: '#b4462f', dangerSoft: '#FBEBE6',
}

const REPORT_TYPES = ['Gut Microbiome', 'Blood Report', 'Hormone Panel', 'Other']

type Report = {
  id: string
  report_type: string
  file_name: string | null
  file_url: string | null
  patient_summary: string | null
  status: 'processing' | 'ready' | 'failed'
  error_message: string | null
  created_at: string
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

function ReportRow({ report, patientId, onDeleted }: { report: Report; patientId: string; onDeleted: (id: string) => void }) {
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
            <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{report.patient_summary}</p>
          )}
          {report.status === 'failed' && (
            <p style={{ fontSize: 12.5, color: C.danger, margin: 0 }}>{report.error_message}</p>
          )}
          {report.status === 'processing' && (
            <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>Extracting and summarizing — this can take up to a minute.</p>
          )}
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
      setUploadError('Network error — try again.')
    } finally { setUploading(false) }
  }

  function removeReport(id: string) {
    setReports((prev) => prev.filter((r) => r.id !== id))
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
          {reports.map((r) => <ReportRow key={r.id} report={r} patientId={patientId} onDeleted={removeReport} />)}
        </div>
      )}
    </div>
  )
}
