'use client'
import { useState, useEffect, useRef } from 'react'
import { Loader2, Sparkles, Send, MessageSquare, AlertCircle, RotateCw, FileText, ChevronDown, ChevronUp, BookOpen, Circle, CheckCircle2, Clock } from 'lucide-react'

const C = {
  green: '#538A22', greenDeep: '#2F5214', greenSoft: '#F2F9EC', greenBorder: '#C8E9A8',
  amber: '#D98A2B', amberSoft: '#FBF1E3', ink: '#1A2417', muted: '#6b7280',
  faint: '#8A9284', line: '#ECEBE3', card: '#FFFFFF',
}
type KbSource = { title: string; source_type: string }
type Msg = { role: 'user' | 'assistant'; content: string; sources?: KbSource[]; generalAnswer?: boolean; kbMiss?: boolean }
// A step is a concrete, RAG-grounded action toward a milestone — validated
// against this specific patient's known constraints (allergies, intolerances,
// preferences) before being marked 'validated'. 'rejected' means the AI (or
// coach) ruled it out as unsafe/inappropriate for this patient specifically.
type Step = { index: number; text: string; status: 'pending' | 'validated' | 'rejected'; sources: KbSource[] }
// A concern can produce more than one milestone (e.g. "insulin resistance"
// might need both a fiber milestone and an exercise milestone).
type Milestone = { index: number; text: string; steps: Step[] }
type ChecklistItem = { index: number; text: string; priority: number; status: 'pending' | 'discussed' | 'deferred'; milestones: Milestone[] }

export default function CaseWorkspace({
  sessionId, patientId, patientName = 'the patient', transcript = '', geminiSummary = '',
}: { sessionId: string; patientId?: string; patientName?: string; transcript?: string; geminiSummary?: string }) {
  const [summary, setSummary] = useState('')
  const [goal, setGoal] = useState('')
  const [coachQuote, setCoachQuote] = useState('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [summaryError, setSummaryError] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [showTranscript, setShowTranscript] = useState(false)
  const [opening, setOpening] = useState(false)

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  function persistChecklist(list: ChecklistItem[]) {
    fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_summary: { summary, checklist: list, goal, coach_quote: coachQuote } }),
    }).catch(() => {})
  }

  async function generateSummary(name: string) {
    setSummaryLoading(true); setSummaryError('')
    try {
      const r = await fetch('/api/qa-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'summary', patientName: name, transcript, geminiSummary }),
      })
      const j = await r.json()
      if (j.error) { setSummaryError(j.error); return }
      if (!j.summary && !(Array.isArray(j.checklist) && j.checklist.length)) {
        setSummaryError('The summary came back empty — tap retry, or just start the discussion below.'); return
      }
      setSummary(j.summary || ''); setChecklist(Array.isArray(j.checklist) ? j.checklist : []); setGoal(j.goal || ''); setCoachQuote(j.coachQuote || '')
      fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_summary: { summary: j.summary, checklist: j.checklist, goal: j.goal, coach_quote: j.coachQuote } }),
      }).catch(() => {})
    } catch { setSummaryError('Could not reach the co-pilot. Check your connection and retry.') }
    finally { setSummaryLoading(false) }
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      let existing: Msg[] = []; let cached: any = null; let name = patientName
      try {
        const s = await (await fetch(`/api/sessions/${sessionId}`)).json()
        cached = s?.case_summary || null
        if (Array.isArray(s?.qa_pairs)) {
          for (const p of s.qa_pairs) {
            if (p.mode !== 'discussion') continue   // ignore old patient-interview Q&A
            if (p.question) existing.push({ role: 'user', content: p.question })
            if (p.answer) existing.push({ role: 'assistant', content: p.answer })
          }
        }
        if (!name || name === 'the patient') {
          const pid = patientId || s?.patient_id
          if (pid) { try { name = (await (await fetch(`/api/patients/${pid}`)).json())?.full_name || name } catch {} }
        }
      } catch {}
      if (!alive) return
      setMessages(existing)

      if (cached?.summary || (cached?.checklist?.length)) {
        setSummary(cached.summary || ''); setChecklist(cached.checklist || []); setGoal(cached.goal || ''); setCoachQuote(cached.coach_quote || ''); setSummaryLoading(false)
      } else if (transcript) {
        generateSummary(name)
      } else {
        setSummaryError('No transcript on this session yet — import or paste it first.'); setSummaryLoading(false)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, thinking])

  // The AI leads: the moment a checklist is ready and nobody's said anything
  // yet, it opens with the highest-priority item — no click needed from the coach.
  useEffect(() => {
    if (summaryLoading || opening || thinking) return
    if (messages.length > 0 || checklist.length === 0) return
    openDiscussion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryLoading, checklist, messages.length])

  async function persist(next: Msg[]) {
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qa_pairs: pairFor(next) }),
      })
    } catch {}
  }
  async function openDiscussion() {
    setOpening(true); setThinking(true)
    try {
      const r = await fetch('/api/qa-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'chat', patientName, transcript, geminiSummary, checklist, messages: [] }),
      })
      const j = await r.json()
      const opener: Msg[] = [{ role: 'assistant', content: j.reply || j.error || '…', sources: Array.isArray(j.sources) ? j.sources : [], generalAnswer: !!j.generalAnswer, kbMiss: !!j.kbMiss }]
      setMessages(opener); persist(opener)
      if (Array.isArray(j.checklist) && j.checklist.length) { setChecklist(j.checklist); persistChecklist(j.checklist) }
    } catch {}
    finally { setOpening(false); setThinking(false) }
  }
  async function send(text: string) {
    const clean = text.trim(); if (!clean || thinking) return
    const next = [...messages, { role: 'user' as const, content: clean }]
    setMessages(next); setInput(''); setThinking(true)
    try {
      const r = await fetch('/api/qa-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'chat', patientName, transcript, geminiSummary, checklist, messages: next }),
      })
      const j = await r.json()
      const withReply = [...next, { role: 'assistant' as const, content: j.reply || j.error || '…', sources: Array.isArray(j.sources) ? j.sources : [], generalAnswer: !!j.generalAnswer, kbMiss: !!j.kbMiss }]
      setMessages(withReply); persist(withReply)
      if (Array.isArray(j.checklist) && j.checklist.length) { setChecklist(j.checklist); persistChecklist(j.checklist) }
    } catch { setMessages([...next, { role: 'assistant', content: 'Connection issue — try again.' }]) }
    finally { setThinking(false) }
  }
  const cardBase = { background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, boxShadow: '0 1px 3px rgba(26,36,23,0.04)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── CASE SUMMARY (replaces the raw transcript card) ── */}
      <div style={{ ...cardBase, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: C.greenDeep, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          <Sparkles size={14} /> Case summary
        </div>
        {summaryLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13 }}>
            <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Reading the transcript…
          </div>
        ) : summaryError ? (
          <div style={{ background: C.amberSoft, border: '1px solid #F0D9B5', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#9A6316', fontWeight: 600, marginBottom: 4 }}>
              <AlertCircle size={14} /> Couldn’t build the summary
            </div>
            <div style={{ fontSize: 12.5, color: '#7A5012', lineHeight: 1.5 }}>{summaryError}</div>
            {transcript && (
              <button onClick={() => generateSummary(patientName)}
                style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: C.greenDeep, background: C.card, border: `1px solid ${C.greenBorder}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                <RotateCw size={13} /> Try again
              </button>
            )}
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, color: C.ink, margin: 0, lineHeight: 1.6 }}>{summary}</p>
            {goal && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.greenDeep, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Guide goal</span>
                <span style={{ fontSize: 13, color: C.ink, fontStyle: 'italic' }}>{goal}</span>
              </div>
            )}
            {coachQuote && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.greenDeep, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Coach quote</span>
                <span style={{ fontSize: 13, color: C.ink, fontStyle: 'italic' }}>&ldquo;{coachQuote}&rdquo;</span>
              </div>
            )}
          </>
        )}

        {transcript && (
          <>
            <button onClick={() => setShowTranscript(v => !v)}
              style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: C.faint, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <FileText size={13} /> {showTranscript ? 'Hide' : 'View'} full transcript {showTranscript ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {showTranscript && (
              <p style={{ marginTop: 10, fontSize: 12.5, color: C.muted, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', background: '#FBFBF8', borderRadius: 10, padding: 12, border: `1px solid ${C.line}` }}>
                {transcript}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── CASE DISCUSSION ── */}
      <div style={{ ...cardBase, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={16} color={C.green} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Case discussion</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>Think through {patientName}'s plan with your clinical co-pilot</div>
          </div>
        </div>

        {/* Discussion checklist — the AI's prioritized list of concerns to work through,
            each expandable to show the milestones/steps built for it. Stays visible for
            the whole discussion so progress is always clear. */}
        {checklist.length > 0 && (
          <div style={{ padding: '14px 18px', background: '#FCFBF7', borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.greenDeep, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Discussion checklist
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {checklist.map((c) => (
                <div key={c.index}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, lineHeight: 1.4 }}>
                    {c.status === 'discussed' ? <CheckCircle2 size={14} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} />
                      : c.status === 'deferred' ? <Clock size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                      : <Circle size={14} color={C.faint} style={{ flexShrink: 0, marginTop: 1 }} />}
                    <span style={{
                      color: c.status === 'discussed' ? C.muted : c.status === 'deferred' ? '#9A6316' : C.ink,
                      textDecoration: c.status === 'discussed' ? 'line-through' : 'none',
                    }}>{c.text}</span>
                  </div>
                  {!!c.milestones?.length && (
                    <div style={{ marginLeft: 22, marginTop: 5, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {c.milestones.map((m) => (
                        <div key={m.index} style={{ borderLeft: `2px solid ${C.greenBorder}`, paddingLeft: 9 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.greenDeep }}>{m.text}</div>
                          {!!m.steps?.length && (
                            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {m.steps.map((s) => (
                                <div key={s.index} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5 }}>
                                  {s.status === 'validated' ? <CheckCircle2 size={12} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} />
                                    : s.status === 'rejected' ? <AlertCircle size={12} color="#C0392B" style={{ flexShrink: 0, marginTop: 1 }} />
                                    : <Circle size={12} color={C.faint} style={{ flexShrink: 0, marginTop: 1 }} />}
                                  <div>
                                    <span style={{
                                      color: s.status === 'rejected' ? '#C0392B' : C.ink,
                                      textDecoration: s.status === 'rejected' ? 'line-through' : 'none',
                                    }}>{s.text}</span>
                                    {!!s.sources?.length && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6, color: C.faint, fontSize: 10.5 }}>
                                        <BookOpen size={10} /> {s.sources.map((src) => src.title).join(', ')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} style={{ maxHeight: 440, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.length === 0 && checklist.length === 0 && !summaryLoading && !opening && (
            <div style={{ fontSize: 12.5, color: C.faint, textAlign: 'center', padding: '8px 0' }}>Start the discussion below whenever you're ready.</div>
          )}
          {messages.length === 0 && opening && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.faint, fontSize: 12.5, justifyContent: 'center', padding: '8px 0' }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Your co-pilot is opening the discussion…
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '82%' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: m.role === 'user' ? C.faint : C.greenDeep, marginBottom: 4, textAlign: m.role === 'user' ? 'right' : 'left' }}>
                  {m.role === 'user' ? 'You' : 'Clinical co-pilot'}
                </div>
                <div style={{ background: m.role === 'user' ? C.green : C.greenSoft, color: m.role === 'user' ? '#fff' : C.ink, border: m.role === 'user' ? 'none' : `1px solid ${C.greenBorder}`, borderRadius: 14, padding: '11px 14px', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                  {m.content}
                </div>
                {m.role === 'assistant' && !!m.sources?.length && (
                  <details className="source-popover" style={{ marginTop: 5 }}>
                    <summary style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.greenDeep, fontWeight: 600, cursor: 'pointer', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 20, padding: '3px 10px' }}>
                      <BookOpen size={11} /> {m.sources.length} source{m.sources.length > 1 ? 's' : ''}
                    </summary>
                    <ul style={{ margin: '6px 0 0', padding: '8px 12px', listStyle: 'none', background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, color: C.ink, lineHeight: 1.6 }}>
                      {m.sources.map((s, si) => (
                        <li key={si} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ color: C.faint }}>•</span> {s.title}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {m.role === 'assistant' && !m.sources?.length && m.generalAnswer && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 11, color: '#9A6316', fontWeight: 600, background: C.amberSoft, border: '1px solid #F0D9B5', borderRadius: 20, padding: '3px 10px' }}>
                    <Sparkles size={11} /> General AI knowledge — not from knowledge base
                  </div>
                )}
                {m.role === 'assistant' && !m.sources?.length && m.kbMiss && !m.generalAnswer && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 11, color: C.faint, fontWeight: 600, background: '#FBFBF8', border: `1px solid ${C.line}`, borderRadius: 20, padding: '3px 10px' }}>
                    <AlertCircle size={11} /> Not in knowledge base
                  </div>
                )}
              </div>
            </div>
          ))}
          {thinking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.faint, fontSize: 12.5 }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Thinking through the case…
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.line}`, display: 'flex', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder={`Discuss ${patientName}'s case, ask for a mechanism, propose an approach…`}
            style={{ flex: 1, padding: '11px 14px', borderRadius: 11, border: `1px solid ${C.line}`, fontSize: 13.5, color: C.ink, fontFamily: 'inherit', outline: 'none' }} />
          <button onClick={() => send(input)} disabled={thinking || !input.trim()}
            style={{ padding: '0 16px', borderRadius: 11, border: 'none', background: input.trim() ? C.green : '#C9D4BE', color: '#fff', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}>
            <Send size={16} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        .source-popover summary { list-style: none; }
        .source-popover summary::-webkit-details-marker { display: none; }
      `}</style>
    </div>
  )
}

function pairFor(msgs: Msg[]) {
  const pairs: { question: string; answer: string; mode: string }[] = []
  // The AI now opens the discussion itself, so msgs[0] can be an assistant
  // message with no preceding user turn — store it with an empty question so
  // the reload logic (which only pushes a user message when question is
  // truthy) reconstructs it as a lone opening assistant message.
  if (msgs[0]?.role === 'assistant') {
    pairs.push({ question: '', answer: msgs[0].content, mode: 'discussion' })
  }
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === 'user') {
      const reply = msgs[i + 1]?.role === 'assistant' ? msgs[i + 1].content : ''
      pairs.push({ question: msgs[i].content, answer: reply, mode: 'discussion' })
    }
  }
  return pairs
}