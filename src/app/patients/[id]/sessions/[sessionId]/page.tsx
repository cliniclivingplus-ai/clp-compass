import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wand2 } from 'lucide-react'
import CaseWorkspace from '@/components/CaseWorkspace'
export const revalidate = 0

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params

  const [{ data: session }, { data: patient }] = await Promise.all([
    supabase.from('sessions').select('*').eq('id', sessionId).single(),
    supabase.from('patients').select('*').eq('id', id).single(),
  ])

  if (!session || !patient) notFound()

  const hasContent = session.pre_meeting_notes || session.gemini_doc_raw || session.post_meeting_notes || (session.qa_pairs?.length > 0)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Link href={`/patients/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 20 }}>
        <ArrowLeft size={14} /> {patient.full_name}
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
            Session
          </h1>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 3 }}>
            {new Date(session.session_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {hasContent && (
          <Link href={`/patients/${id}/sessions/${sessionId}/interpret`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#538A22', color: '#fff', padding: '10px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
            <Wand2 size={15} /> Generate Dashboard
          </Link>
        )}
      </div>

      {/* Notes stay above the workspace */}
      {(session.pre_meeting_notes || session.post_meeting_notes) && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb', marginBottom: 16 }}>
          {session.pre_meeting_notes && (
            <div style={{ marginBottom: session.post_meeting_notes ? 14 : 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Pre-Meeting Notes</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{session.pre_meeting_notes}</p>
            </div>
          )}
          {session.post_meeting_notes && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Post-Meeting Notes</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{session.post_meeting_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Case summary (top card) + discussion — one component, one summary generation */}
      <CaseWorkspace
        sessionId={sessionId}
        patientId={id}
        patientName={patient.full_name}
        transcript={session.gemini_doc_raw ?? ''}
        geminiSummary={session.gemini_summary_raw ?? ''}
      />
    </div>
  )
}