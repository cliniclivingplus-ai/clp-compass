'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Pencil, FileText, StickyNote, LayoutDashboard, Calendar, ChevronRight, Microscope } from 'lucide-react'
import ReportsTab from '@/components/ReportsTab'

// ── Design tokens ────────────────────────────────────────────────────
const C = {
  green: '#538A22',
  greenDeep: '#2F5214',
  greenSoft: '#F2F9EC',
  greenBorder: '#C8E9A8',
  amber: '#D98A2B',
  amberSoft: '#FBF1E3',
  ink: '#1A2417',
  muted: '#6b7280',
  faint: '#8A9284',
  line: '#ECEBE3',
  card: '#FFFFFF',
}

type Patient = {
  id: string
  clinic_patient_id?: string
  full_name: string
  gender?: string
  primary_concern?: string
  medical_history?: string
  assigned_nutritionist?: string
  created_at?: string
}
type Session = {
  id: string
  session_type?: string
  session_date?: string
  created_at?: string
  status?: string
  qa_pairs?: unknown[]
  pre_meeting_notes?: string
  post_meeting_notes?: string
  gemini_doc_raw?: string
}
type Roadmap = {
  id: string
  session_id?: string
  overview?: string
  duration_months?: number
  status?: string
  created_at?: string
}

const TABS = [
  { key: 'sessions', label: 'Sessions', icon: FileText },
  { key: 'reports', label: 'Reports', icon: Microscope },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
] as const
type TabKey = (typeof TABS)[number]['key']

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function daysAgo(d?: string) {
  if (!d) return null
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (diff <= 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 30) return `${diff}d ago`
  return fmtDate(d)
}

export default function PatientPage() {
  const params = useParams()
  const router = useRouter()
  const patientId = params.id as string

  const [patient, setPatient] = useState<Patient | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('sessions')

  useEffect(() => {
    let alive = true
    async function load() {
      const safe = async (url: string) => {
        try {
          const r = await fetch(url)
          const j = await r.json()
          return j
        } catch {
          return null
        }
      }
      const [p, s, r] = await Promise.all([
        safe(`/api/patients/${patientId}`),
        safe(`/api/sessions?patient_id=${patientId}`),
        safe(`/api/roadmaps?patient_id=${patientId}`),
      ])
      if (!alive) return
      setPatient(p && !p.error ? p : null)
      setSessions(Array.isArray(s) ? s : [])
      setRoadmaps(Array.isArray(r) ? r : [])
      setLoading(false)
    }
    load()
    return () => {
      alive = false
    }
  }, [patientId])

  const lastSession = sessions
    .map(s => s.session_date || s.created_at)
    .filter(Boolean)
    .sort()
    .reverse()[0]

  if (loading) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ height: 120, background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, opacity: 0.6 }} />
      </div>
    )
  }

  if (!patient) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center', paddingTop: 80 }}>
        <p style={{ color: C.muted }}>This patient could not be found.</p>
        <Link href="/patients" style={{ color: C.green, fontWeight: 600 }}>Back to patients</Link>
      </div>
    )
  }

  const counts = { sessions: sessions.length, roadmaps: roadmaps.length }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <Link href="/patients" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.faint, textDecoration: 'none', marginBottom: 18, fontWeight: 500 }}>
        <ArrowLeft size={14} /> All patients
      </Link>

      {/* ── Patient summary header ── */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: '22px 24px', boxShadow: '0 1px 3px rgba(26,36,23,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: C.greenDeep, flexShrink: 0 }}>
              {patient.full_name?.trim()?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 21, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>{patient.full_name}</h1>
                {patient.clinic_patient_id && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.greenDeep, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 20, padding: '2px 9px' }}>
                    {patient.clinic_patient_id}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 5, fontSize: 12.5, color: C.muted }}>
                {patient.gender && <span style={{ textTransform: 'capitalize' }}>{patient.gender}</span>}
                {patient.primary_concern && <><span>·</span><span style={{ color: C.greenDeep, fontWeight: 600 }}>{patient.primary_concern}</span></>}
                {patient.assigned_nutritionist && <><span>·</span><span>Coach: {patient.assigned_nutritionist}</span></>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link
              href={`/patients/${patientId}/edit`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.muted, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              <Pencil size={13} /> Edit
            </Link>
            <Link
              href={`/patients/${patientId}/sessions/new`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', boxShadow: '0 2px 6px rgba(83,138,34,0.25)' }}
            >
              <Plus size={14} /> New session
            </Link>
          </div>
        </div>

        {/* stat strip */}
        <div style={{ display: 'flex', gap: 28, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
          <Stat label="Sessions" value={String(counts.sessions)} />
          <Stat label="Roadmaps" value={String(counts.roadmaps)} />
          <Stat label="Last seen" value={daysAgo(lastSession) || '—'} />
          <Stat label="Since" value={fmtDate(patient.created_at)} />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginTop: 22, borderBottom: `1px solid ${C.line}`, overflowX: 'auto' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          const badge = t.key === 'sessions' ? counts.sessions : t.key === 'dashboard' ? counts.roadmaps : null
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '11px 16px',
                background: 'none',
                border: 'none',
                borderBottom: active ? `2px solid ${C.green}` : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                fontSize: 13.5,
                fontWeight: active ? 700 : 500,
                color: active ? C.greenDeep : C.muted,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={15} />
              {t.label}
              {badge != null && badge > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, background: active ? C.greenSoft : '#F1F0EB', color: active ? C.greenDeep : C.faint, borderRadius: 20, padding: '1px 7px' }}>{badge}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab panels ── */}
      <div style={{ marginTop: 22 }}>
        {tab === 'sessions' && <SessionsTab sessions={sessions} roadmaps={roadmaps} patientId={patientId} router={router} />}
        {tab === 'reports' && <ReportsTab patientId={patientId} />}
        {tab === 'notes' && <NotesTab sessions={sessions} />}
        {tab === 'dashboard' && <DashboardTab roadmaps={roadmaps} />}
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function StatusChip({ status }: { status?: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    interpreted: { bg: C.greenSoft, fg: C.greenDeep, label: 'Roadmap ready' },
    'notes-added': { bg: C.amberSoft, fg: C.amber, label: 'In progress' },
    pending: { bg: '#F1F0EB', fg: C.faint, label: 'Pending' },
  }
  const s = map[status || 'pending'] || map.pending
  return <span style={{ fontSize: 11, fontWeight: 700, background: s.bg, color: s.fg, borderRadius: 20, padding: '3px 9px' }}>{s.label}</span>
}

function EmptyState({ icon: Icon, title, body, cta }: { icon: any; title: string; body: string; cta?: React.ReactNode }) {
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px dashed ${C.greenBorder}`, padding: '44px 24px', textAlign: 'center' }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Icon size={22} color={C.green} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{title}</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 5, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>{body}</div>
      {cta && <div style={{ marginTop: 16 }}>{cta}</div>}
    </div>
  )
}

function SessionsTab({ sessions, roadmaps, patientId, router }: { sessions: Session[]; roadmaps: Roadmap[]; patientId: string; router: ReturnType<typeof useRouter> }) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No sessions yet"
        body="Import a Meet transcript from Drive or paste the meeting doc to start this patient's first session."
        cta={
          <Link href={`/patients/${patientId}/sessions/new`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 9, background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            <Plus size={14} /> Start first session
          </Link>
        }
      />
    )
  }

  const ordered = [...sessions].sort((a, b) => new Date(b.session_date || b.created_at || 0).getTime() - new Date(a.session_date || a.created_at || 0).getTime())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ordered.map((s, i) => {
        const linkedRoadmap = roadmaps.find(r => r.session_id === s.id)
        const qaCount = Array.isArray(s.qa_pairs) ? s.qa_pairs.length : 0
        return (
          <button
            key={s.id}
            onClick={() => router.push(`/patients/${patientId}/sessions/${s.id}`)}
            style={{ textAlign: 'left', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 2px rgba(26,36,23,0.03)' }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 11, background: i === 0 ? C.greenSoft : '#F6F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Calendar size={17} color={i === 0 ? C.green : C.faint} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>Session {ordered.length - i}</span>
                <StatusChip status={s.status} />
                {i === 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.green, background: C.greenSoft, borderRadius: 20, padding: '2px 8px' }}>LATEST</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span>{fmtDate(s.session_date || s.created_at)}</span>
                {qaCount > 0 && <><span>·</span><span>{qaCount} Q&amp;A</span></>}
                {linkedRoadmap && <><span>·</span><span style={{ color: C.greenDeep, fontWeight: 600 }}>Roadmap generated</span></>}
              </div>
            </div>
            <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />
          </button>
        )
      })}
    </div>
  )
}

function NotesTab({ sessions }: { sessions: Session[] }) {
  const withNotes = sessions.filter(s => (s.pre_meeting_notes && s.pre_meeting_notes.trim()) || (s.post_meeting_notes && s.post_meeting_notes.trim()))
  if (withNotes.length === 0) {
    return <EmptyState icon={StickyNote} title="No notes recorded" body="Pre- and post-session notes you add on any session are collected here, so a patient's full clinical narrative stays in one place across visits." />
  }
  const ordered = [...withNotes].sort((a, b) => new Date(b.session_date || b.created_at || 0).getTime() - new Date(a.session_date || a.created_at || 0).getTime())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ordered.map(s => (
        <div key={s.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.greenDeep, marginBottom: 10 }}>
            {fmtDate(s.session_date || s.created_at)}
          </div>
          {s.pre_meeting_notes?.trim() && (
            <div style={{ marginBottom: s.post_meeting_notes?.trim() ? 12 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Before session</div>
              <p style={{ fontSize: 13.5, color: C.ink, margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{s.pre_meeting_notes}</p>
            </div>
          )}
          {s.post_meeting_notes?.trim() && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>After session</div>
              <p style={{ fontSize: 13.5, color: C.ink, margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{s.post_meeting_notes}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function DashboardTab({ roadmaps }: { roadmaps: Roadmap[] }) {
  if (roadmaps.length === 0) {
    return <EmptyState icon={LayoutDashboard} title="No dashboard yet" body="Generate a dashboard from any session to build the patient's personalised plan. It'll appear here for easy reference across visits." />
  }
  // A patient can accumulate a roadmap per session over time — list every
  // one rather than only ever opening the latest, so a coach can pick the
  // specific plan they actually want the shareable dashboard link for.
  const ordered = [...roadmaps].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ordered.map((r, i) => (
        <div key={r.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 2px rgba(26,36,23,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>
                {r.duration_months ? `${r.duration_months >= 1 ? r.duration_months : Math.round(r.duration_months * 4)}${r.duration_months >= 1 ? '-month' : '-week'} plan` : 'Roadmap'}
              </span>
              {i === 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.green, background: C.greenSoft, borderRadius: 20, padding: '2px 8px' }}>CURRENT</span>}
              <span style={{ fontSize: 12, color: C.faint }}>{fmtDate(r.created_at)}</span>
            </div>
            <Link href={`/dashboard/${r.id}`} target="_blank" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: C.green, color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
              <LayoutDashboard size={13} /> Open dashboard
            </Link>
          </div>
          {r.overview && <p style={{ fontSize: 13, color: C.muted, margin: '8px 0 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.overview}</p>}
        </div>
      ))}
    </div>
  )
}