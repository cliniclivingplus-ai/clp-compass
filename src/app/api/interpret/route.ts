import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'
import Groq from 'groq-sdk'
import { embedText } from '@/lib/embeddings'

export const maxDuration = 60
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

function extractJSON(text: string): unknown {
  const clean = text.replace(/```json|```/g, '').trim()
  for (const t of [clean, text]) {
    try { return JSON.parse(t) } catch {}
    const arr = t.match(/\[[\s\S]*\]/)
    if (arr) { try { return JSON.parse(arr[0]) } catch {} }
  }
  throw new Error(`Cannot parse JSON: ${text.slice(0, 200)}`)
}

export async function POST(req: NextRequest) {
  try {
    const { session_id, patient_id, duration_months = 1 } = await req.json()
    if (!session_id || !patient_id) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

    const [{ data: session }, { data: patient }, { data: reports }] = await Promise.all([
      supabaseAdmin.from('sessions').select('*').eq('id', session_id).single(),
      supabaseAdmin.from('patients').select('*').eq('id', patient_id).single(),
      supabaseAdmin.from('patient_reports').select('report_type, patient_summary').eq('patient_id', patient_id).eq('status', 'ready'),
    ])
    if (!session || !patient) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const qaPairs: { question: string; answer: string }[] = session.qa_pairs ?? []
    const roadmapInstructions = session.roadmap_instructions ?? ''

    const fullQA = qaPairs.map((qa, i) => `Q${i+1}: ${qa.question}\nAnswer: ${qa.answer}`).join('\n\n')
    const geminiSnippet = session.gemini_doc_raw?.slice(0, 800) ?? ''
    const reportsBlock = (reports ?? []).length
      ? (reports ?? []).map((r) => `${r.report_type}:\n${r.patient_summary}`).join('\n\n')
      : ''

    // ── KB Search ────────────────────────────────────────────
    let kbContext = ''
    let kbSources: { title: string; source_type: string; chunk_preview: string }[] = []
    try {
      const stopWords = new Set(['the','patient','is','are','was','with','and','has','have','been','their','they','this','that','from','for','not','but','can','also','more','very','some','into','over','after','history','experiencing','currently'])
      const rawText = [patient.primary_concern, patient.medical_history, ...qaPairs.slice(0, 5).map(qa => qa.answer)].filter(Boolean).join(' ')
      const keywords = [...new Set(rawText.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w)).slice(0, 10))].join(' | ')
      console.log('KB keywords:', keywords)

          // Build query for embedding — use clinical terms from patient data
      const queryText = [
        patient.primary_concern ?? '',
        patient.medical_history ?? '',
        ...qaPairs.slice(0, 5).map(qa => `${qa.question} ${qa.answer}`)
      ].filter(Boolean).join(' ').slice(0, 512)

      console.log('KB query:', queryText.slice(0, 100))

      let chunks: {content: string; document_id: string}[] = []
      let usedVectorSearch = false

      // ── Try vector search first ──────────────────────────
      const queryEmbedding = await embedText(queryText)

      if (queryEmbedding && queryEmbedding.length === 384) {
        console.log('Using vector search (pgvector)')
        const { data: vectorChunks, error: vecError } = await supabaseAdmin
          .rpc('match_kb_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.25,
            match_count: 12,
          })

        if (!vecError && vectorChunks?.length > 0) {
          // Limit to 2 chunks per document for diversity
          const seen: Record<string, number> = {}
          for (const chunk of vectorChunks) {
            const docCount = seen[chunk.document_id] ?? 0
            if (docCount < 2) {
              chunks.push({ content: chunk.content, document_id: chunk.document_id })
              seen[chunk.document_id] = docCount + 1
            }
          }
          usedVectorSearch = true
          console.log('Vector search:', chunks.length, 'chunks, top similarity:', vectorChunks[0]?.similarity?.toFixed(3))
        } else {
          console.log('Vector search returned nothing:', vecError?.message)
        }
      }

      // ── Fallback: keyword search per medical term ────────
      if (!usedVectorSearch || chunks.length < 4) {
        console.log('Using text search fallback')
        const medicalTermMap: Record<string, string[]> = {
          'pcos': ['polycystic', 'ovarian', 'insulin', 'menstrual', 'testosterone'],
          'thyroid': ['thyroid', 'hypothyroid', 'hashimoto', 'iodine'],
          'gut': ['microbiome', 'intestinal', 'constipation', 'probiotic', 'digestive'],
          'inflammation': ['inflammation', 'inflammatory', 'anti-inflammatory', 'cytokine'],
          'weight': ['obesity', 'metabolism', 'adipose', 'insulin resistance'],
          'diabetes': ['glucose', 'insulin', 'glycemic', 'blood sugar'],
          'fatigue': ['fatigue', 'adrenal', 'mitochondria', 'energy'],
          'sleep': ['circadian', 'melatonin', 'cortisol', 'insomnia'],
          'hormone': ['estrogen', 'progesterone', 'cortisol', 'endocrine'],
        }

        const patientText = queryText.toLowerCase()
        const searchTerms = new Set<string>()

        keywords.split(' | ').filter(Boolean).forEach((k: string) => searchTerms.add(k))
        for (const [trigger, synonyms] of Object.entries(medicalTermMap)) {
          if (patientText.includes(trigger)) synonyms.forEach(s => searchTerms.add(s))
        }

        const textChunks: {content: string; document_id: string}[] = [...chunks]
        for (const kw of [...searchTerms].slice(0, 8)) {
          const { data: kwChunks } = await supabaseAdmin
            .from('kb_chunks').select('content, document_id')
            .textSearch('content', kw, { type: 'websearch', config: 'english' })
            .limit(2)
          if (kwChunks?.length) {
            for (const chunk of kwChunks) {
              const alreadyIn = textChunks.some(c => c.content === chunk.content)
              const docCount = textChunks.filter(c => c.document_id === chunk.document_id).length
              if (!alreadyIn && docCount < 2) textChunks.push(chunk)
            }
          }
        }
        chunks = textChunks.slice(0, 12)
      }

      if (chunks?.length) {
        const docIds = [...new Set(chunks.map((c: {document_id:string}) => c.document_id))]
        const { data: docs } = await supabaseAdmin.from('kb_documents').select('id, title, source_type').in('id', docIds)
        const docMap = Object.fromEntries((docs ?? []).map((d: {id:string;title:string;source_type:string}) => [d.id, d]))
        kbContext = chunks.map((c: {content:string}, i: number) => `[KB ${i+1}]: ${c.content.slice(0, 350)}`).join('\n\n')
        kbSources = docIds.map(id => ({ title: docMap[id]?.title ?? 'Unknown', source_type: docMap[id]?.source_type ?? 'unknown', chunk_preview: chunks.find((c: {document_id:string}) => c.document_id === id)?.content?.slice(0, 80) ?? '' }))
        console.log('KB chunks:', chunks.length, 'from', docIds.length, 'books:', kbSources.map(s => s.title.split('(')[0].trim()).join(', '))
      } else {
        const { data: fb } = await supabaseAdmin.from('kb_chunks').select('content, document_id').limit(6)
        if (fb?.length) {
          const docIds = [...new Set(fb.map((c: {document_id:string}) => c.document_id))]
          const { data: docs } = await supabaseAdmin.from('kb_documents').select('id, title, source_type').in('id', docIds)
          const docMap = Object.fromEntries((docs ?? []).map((d: {id:string;title:string;source_type:string}) => [d.id, d]))
          kbContext = fb.map((c: {content:string}, i: number) => `[KB ${i+1}]: ${c.content.slice(0, 300)}`).join('\n\n')
          kbSources = docIds.map(id => ({ title: docMap[id]?.title ?? 'Unknown', source_type: docMap[id]?.source_type ?? 'unknown', chunk_preview: fb.find((c: {document_id:string}) => c.document_id === id)?.content?.slice(0, 80) ?? '' }))
          console.log('KB fallback:', fb.length, 'chunks')
        }
      }
    } catch (e) { console.log('KB error:', e) }

    // ── STEP 1: Extract specific patient facts ────────────────
    // This is the key step — pull exact facts before generating
    console.log('Step 1: Extracting patient facts...')
    const factsRes = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'Extract specific clinical facts from the consultation. Return only a bullet list of specific, measurable, named facts. No generalisations. Only what is explicitly stated.' },
        { role: 'user', content: `Patient: ${patient.full_name}, ${patient.gender ?? ''}, Concern: ${patient.primary_concern}

Gemini meeting notes:
${geminiSnippet}

Q&A:
${fullQA || 'None'}
${reportsBlock ? `\nLab/diagnostic reports on file:\n${reportsBlock}\n` : ''}
Extract every specific fact mentioned:
- Exact symptoms (with duration, frequency, severity)
- Exact diet details (what they eat, when, how much)
- Exact lifestyle (sleep times, work hours, exercise history)
- Exact medical history (conditions, dates, medications, test results)
- Exact measurements (weight, height, lab values)
- Specific habits (good and bad)
- What has worked or failed before
${reportsBlock ? '- Exact lab/report findings (values, whether in/out of normal range)' : ''}

Return as a bullet list. Every point must be specific and sourced from the data above. NO generalisations.` }
      ],
      temperature: 0.1,
      max_tokens: 600,
    })
    const patientFacts = factsRes.choices[0]?.message?.content?.trim() ?? ''
    console.log('Facts extracted:', patientFacts.slice(0, 200))

    // ── STEP 2: Overview ─────────────────────────────────────
    const overviewRes = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: `You are ${patient.full_name}'s treating nutritionist at Clinic Living Plus. Write directly to her/him.
STRICT RULES:
- Every sentence MUST reference a specific fact from the PATIENT FACTS list below
- Use exact details: their real food, their real symptoms, their real schedule
- FORBIDDEN words: "may", "might", "could", "possibly", "often", "many people", "typically", "generally"
- If you write something not in the facts list, delete it
- Tone: warm, direct, like a doctor who knows them personally` },
        { role: 'user', content: `PATIENT FACTS (use ONLY these):
${patientFacts}

NUTRITIONIST INSTRUCTIONS:
${roadmapInstructions || 'Focus on root cause healing based on their specific condition.'}

KB CLINICAL KNOWLEDGE:
${kbContext || 'Use clinical expertise.'}

Write 2 paragraphs directly to ${patient.full_name}.
Paragraph 1: Describe exactly what is happening in their body right now — using their specific symptoms, test results, eating patterns from the facts list.
Paragraph 2: Tell them exactly what will change over ${duration_months} months — specific to their condition and goals.
Use "you" throughout. Reference their real details. No generic health advice.` }
      ],
      temperature: 0.5,
      max_tokens: 400,
    })
    const overview = overviewRes.choices[0]?.message?.content?.trim() ?? ''

    // ── STEP 3: Lifestyle guidelines ─────────────────────────
    const lifestyleRes = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'Clinical nutritionist. Write 4 lifestyle prescriptions directly to the patient. Each must reference a specific fact from their consultation. No generic advice.' },
        { role: 'user', content: `PATIENT FACTS:
${patientFacts}

KB:
${kbContext || 'Use expertise.'}

Write 4 lifestyle changes for this specific patient.
Each must:
- Start with • 
- Reference their actual habit/pattern (e.g. "Your habit of sleeping at 1am..." not "You should sleep earlier")
- Give a specific, actionable change
- Explain why in 1 sentence based on their condition
- Be 20-25 words

Return only 4 bullet points. No intro, no outro.` }
      ],
      temperature: 0.3,
      max_tokens: 300,
    })
    const lifestyle_guidelines = lifestyleRes.choices[0]?.message?.content?.trim() ?? ''

    // ── STEP 4: Clinical notes ────────────────────────────────
    const clinicalRes = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'Clinical nutritionist writing notes. Use only patient facts and KB. Be specific and clinical.' },
        { role: 'user', content: `PATIENT FACTS:
${patientFacts}

KB:
${kbContext || 'Use expertise.'}

Write 4 clinical notes:
• Biomarkers: specific tests to track for this patient's exact condition with target ranges
• Diet protocol: specific dietary intervention based on their actual eating patterns
• Supplements: 2-3 specific supplements with exact doses, timing, and clinical reason for this patient
• Red flags: specific warning signs to watch for given their history

Each starts with •. Specific to this patient. No generic statements.` }
      ],
      temperature: 0.2,
      max_tokens: 800, // was 400 — four multi-bullet sections (biomarkers,
      // diet protocol, supplements, red flags) reliably ran out of budget
      // mid-sentence on the last section (observed: "Red flags" cut off at
      // "Monitor Kalika" with nothing after it). This is now patient-facing
      // (Supplements + When-to-reach-us PDF pages), so a truncated bullet
      // isn't just an internal-notes annoyance anymore.
    })
    const nutritionist_guidelines = clinicalRes.choices[0]?.message?.content?.trim() ?? ''

    // ── STEP 5: Weekly schedule ───────────────────────────────
    // Handle short durations: 0.25 = 1 week, 0.5 = 2 weeks
    const totalWeeks = duration_months < 1
      ? Math.round(duration_months * 4)
      : duration_months * 4
    const weeklyRes = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Return only a valid JSON array. No markdown. Write cause and actions directly to the patient using their specific facts. Never write generic health advice.' },
        { role: 'user', content: `PATIENT FACTS (the only source of truth — use these specific details):
${patientFacts}

KB CLINICAL KNOWLEDGE:
${kbContext || 'Use expertise.'}

NUTRITIONIST INSTRUCTIONS:
${roadmapInstructions || `Weeks 1-${Math.ceil(totalWeeks/3)}: address root causes from facts. Weeks ${Math.ceil(totalWeeks/3)+1}-${Math.ceil(totalWeeks*2/3)}: build on improvements. Weeks ${Math.ceil(totalWeeks*2/3)+1}-${totalWeeks}: optimise and sustain.`}

Create exactly ${totalWeeks} weekly plans.

RULES FOR CAUSE:
- Explain the BIOCHEMICAL MECHANISM — what is actually happening in the body at a cellular/hormonal level
- E.g. "Your elevated cortisol from 10-12hr workdays is suppressing progesterone production, which explains your irregular cycle. Cortisol and progesterone compete for the same receptor sites — when cortisol dominates, progesterone cannot bind, disrupting your luteal phase."
- Be scientific. Use medical terms but explain them. Reference their actual symptoms.
- Never say "may", "might", "could", "typically"

RULES FOR ACTIONS:
- Each action must be SPECIFIC and MEASURABLE: include exact quantities, timings, durations
- E.g. "Eat 2 tablespoons of ground flaxseed in warm water at 7am daily — lignans in flaxseed bind excess oestrogen and support progesterone balance"
- Include the WHY in one sentence after the action
- Reference their actual food/schedule from Q&A and patient facts
- Actions should NOT suggest "consult a doctor" or "consult a nutritionist" — she is already at CLP

[{
  "week_number": 1,
  "focus_theme": "Specific clinical theme",
  "cause": "3 sentences explaining the exact biochemical mechanism happening in their body. Scientific, specific to their condition and facts. Direct to patient.",
  "actions": [
    "Specific measurable action with exact quantity/timing — why it works in one sentence",
    "Second specific action with quantity and timing — scientific rationale",
    "Third specific action tied to their actual daily schedule"
  ],
  "milestone": "By end of this week, if you follow all actions: [1-2 specific, measurable changes the patient will notice — e.g. bloating reduces, energy improves by afternoon, bowel movement becomes regular]. Be specific and realistic."
}]

Exactly ${totalWeeks} items. Each week must address a different physiological system or mechanism. Progression: weeks 1-2 eliminate triggers, weeks 3-4 repair damage, weeks 5+ rebuild and optimise.\`` }
      ],
      temperature: 0.3,
      max_tokens: 2500,
    })

    const weeklyRaw = weeklyRes.choices[0]?.message?.content ?? ''
    let weeklySchedule: unknown[]
    try {
      weeklySchedule = extractJSON(weeklyRaw) as unknown[]
      if (!Array.isArray(weeklySchedule)) throw new Error('Not an array')
      console.log('Weeks:', weeklySchedule.length)
    } catch {
      return NextResponse.json({ error: `Weekly parse failed. Raw: ${weeklyRaw.slice(0, 300)}` }, { status: 500 })
    }

    // ── Save ─────────────────────────────────────────────────
    const { data: roadmap, error: roadmapError } = await supabaseAdmin
      .from('roadmaps')
      .insert({ session_id, patient_id, overview, lifestyle_guidelines, nutritionist_guidelines, weekly_schedule: weeklySchedule, kb_sources: kbSources, duration_months, status: 'draft' })
      .select().single()

    if (roadmapError) throw new Error(roadmapError.message)
    await supabaseAdmin.from('sessions').update({ status: 'interpreted' }).eq('id', session_id)
    console.log('=== DONE ===')

    return NextResponse.json({ success: true, roadmap_id: roadmap.id, roadmap: { ...roadmap, weekly_schedule: weeklySchedule } })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
