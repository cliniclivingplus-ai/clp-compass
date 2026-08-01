'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader2, CheckCircle2, ClipboardPaste, FileText } from 'lucide-react'
import Link from 'next/link'
import ImportFromDrive from '@/components/ImportFromDrive'

const C = {
  green: '#538A22', greenDeep: '#2F5214', greenSoft: '#F2F9EC', greenBorder: '#C8E9A8',
  amber: '#D98A2B', amberSoft: '#FBF1E3', ink: '#1A2417', muted: '#6b7280',
  faint: '#8A9284', line: '#ECEBE3', card: '#FFFFFF',
}

export default function NewSessionPage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [geminiDoc, setGeminiDoc] = useState('')
  const [geminiSummary, setGeminiSummary] = useState('')
  const [preNotes, setPreNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<{ qa_count: number } | null>(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [importError, setImportError] = useState('')
  const [importedFileName, setImportedFileName] = useState('')
  const [summaryImportError, setSummaryImportError] = useState('')
  const [importedSummaryFileName, setImportedSummaryFileName] = useState('')

  useEffect(() => {
    fetch(`/api/sessions?patient_id=${patientId}`)
      .then(r => r.json())
      .then(data => {
        const count = Array.isArray(data) ? data.length : 0
        setSessionCount(count)
      })
      .catch(() => {})
  }, [patientId])

  const isFirstSession = sessionCount === 0
  const hasTranscript = geminiDoc.trim().length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          gemini_doc_raw: geminiDoc || null,
          gemini_summary_raw: geminiSummary || null,
          pre_meeting_notes: preNotes || null,
        }),
      })
      const sessionJson = await sessionRes.json()
      if (!sessionRes.ok) { setError(sessionJson.error || 'Could not create the session. Try again.'); setLoading(false); return }
      const sessionId = sessionJson.id

      if (geminiDoc.trim().length > 100) {
        setParsing(true)
        const parseRes = await fetch('/api/parse-gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gemini_doc: geminiDoc, patient_id: patientId, session_id: sessionId }),
        })
        const parseJson = await parseRes.json()
        setParsing(false)
        if (parseRes.ok) setParsed(parseJson.extracted)
      }
      router.push(`/patients/${patientId}/sessions/${sessionId}`)
    } catch {
      setError('Network error — check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <Link href={`/patients/${patientId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.faint, textDecoration: 'none', marginBottom: 18, fontWeight: 500 }}>
        <ArrowLeft size={14} /> Back to patient
      </Link>

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>
          {isFirstSession ? 'Start first session' : 'New session'}
        </h1>
        <p style={{ fontSize: 13.5, color: C.muted, marginTop: 5 }}>
          Import the transcript your Meet saved to Drive, or paste it in — the AI extracts symptoms, diet, habits and builds the Q&amp;A automatically.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ background: C.card, borderRadius: 16, padding: 24, border: `1px solid ${C.line}`, boxShadow: '0 1px 3px rgba(26,36,23,0.04)' }}>

        {/* Transcript — primary: Drive import */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.greenDeep, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Meeting transcript</label>

          {/* Primary action card */}
          <div style={{ background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: hasTranscript ? 12 : 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${C.greenBorder}` }}>
                <FileText size={18} color={C.green} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Import from Google Drive</div>
                <div style={{ fontSize: 12, color: C.greenDeep }}>Pick the transcript Doc Meet saved for this call</div>
              </div>
              <ImportFromDrive
                onImport={(text, fileName) => { setGeminiDoc(text); setImportedFileName(fileName); setImportError('') }}
                onError={(msg) => setImportError(msg)}
              />
            </div>
            {importedFileName && !importError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.greenDeep, fontWeight: 600, paddingTop: 4 }}>
                <CheckCircle2 size={14} /> Imported “{importedFileName}”
              </div>
            )}
            {importError && <p style={{ color: '#b91c1c', fontSize: 12, margin: '8px 0 0' }}>{importError}</p>}
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px', color: C.faint, fontSize: 11.5, fontWeight: 600 }}>
            <div style={{ flex: 1, height: 1, background: C.line }} />
            OR PASTE MANUALLY
            <div style={{ flex: 1, height: 1, background: C.line }} />
          </div>

          <div style={{ position: 'relative' }}>
            <textarea
              value={geminiDoc}
              onChange={e => setGeminiDoc(e.target.value)}
              rows={9}
              placeholder="Paste the full meeting transcript here…"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${hasTranscript ? C.greenBorder : C.line}`, fontSize: 13, resize: 'vertical', background: hasTranscript ? '#FCFEF9' : C.card, color: C.ink, fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
            />
            {hasTranscript && (
              <span style={{ position: 'absolute', top: 10, right: 12, fontSize: 11, fontWeight: 700, color: C.green, background: C.greenSoft, borderRadius: 20, padding: '2px 9px' }}>
                {geminiDoc.trim().split(/\s+/).length} words
              </span>
            )}
          </div>
        </div>

        {/* Gemini's own meeting-summary doc — separate from the raw transcript above */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.greenDeep, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Gemini meeting summary <span style={{ fontWeight: 500, color: C.faint, textTransform: 'none', letterSpacing: 0 }}>· optional</span>
          </label>

          <div style={{ background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: geminiSummary.trim().length > 0 ? 12 : 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${C.greenBorder}` }}>
                <FileText size={18} color={C.green} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Import from Google Drive</div>
                <div style={{ fontSize: 12, color: C.greenDeep }}>Pick the summary Doc Gemini auto-generated for this call</div>
              </div>
              <ImportFromDrive
                onImport={(text, fileName) => { setGeminiSummary(text); setImportedSummaryFileName(fileName); setSummaryImportError('') }}
                onError={(msg) => setSummaryImportError(msg)}
              />
            </div>
            {importedSummaryFileName && !summaryImportError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.greenDeep, fontWeight: 600, paddingTop: 4 }}>
                <CheckCircle2 size={14} /> Imported “{importedSummaryFileName}”
              </div>
            )}
            {summaryImportError && <p style={{ color: '#b91c1c', fontSize: 12, margin: '8px 0 0' }}>{summaryImportError}</p>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px', color: C.faint, fontSize: 11.5, fontWeight: 600 }}>
            <div style={{ flex: 1, height: 1, background: C.line }} />
            OR PASTE MANUALLY
            <div style={{ flex: 1, height: 1, background: C.line }} />
          </div>

          <textarea
            value={geminiSummary}
            onChange={e => setGeminiSummary(e.target.value)}
            rows={5}
            placeholder="Paste Gemini's auto-generated meeting summary here…"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 13, resize: 'vertical', color: C.ink, fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
          />
        </div>

        {/* Pre-session notes */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.greenDeep, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Pre-session notes <span style={{ fontWeight: 500, color: C.faint, textTransform: 'none', letterSpacing: 0 }}>· optional</span>
          </label>
          <textarea
            value={preNotes}
            onChange={e => setPreNotes(e.target.value)}
            rows={3}
            placeholder={isFirstSession ? 'Patient background, referral notes, anything to keep in mind…' : 'What to check on this visit, concerns from last time…'}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 13, resize: 'vertical', color: C.ink, fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
          />
        </div>

        {/* Status */}
        {parsing && (
          <div style={{ background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: '11px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={14} color={C.green} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.greenDeep, fontWeight: 600 }}>Reading the transcript and extracting clinical data…</span>
          </div>
        )}
        {parsed && (
          <div style={{ background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: '11px 14px', marginBottom: 14, fontSize: 13, color: C.greenDeep, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCircle2 size={15} /> Patient profile updated from transcript
          </div>
        )}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '11px 14px', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}

        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: 13, background: loading ? '#7BA84F' : C.green, color: '#fff', border: 'none', borderRadius: 11, fontSize: 14.5, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(83,138,34,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : hasTranscript ? 'Save & extract from transcript' : 'Save session'}
        </button>
      </form>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}