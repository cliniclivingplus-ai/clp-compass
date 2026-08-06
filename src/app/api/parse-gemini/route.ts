import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { gemini_doc, patient_id, session_id } = await req.json()
    if (!gemini_doc || !patient_id) {
      return NextResponse.json({ error: 'Missing gemini_doc or patient_id' }, { status: 400 })
    }

    // ── Extract structured data from Gemini doc ───────────────
    const extractRes = await groq.chat.completions.create({
      // 120b, not 20b: this runs automatically right after session creation, back-to-
      // back with qa-chat's own summary generation (also on 20b). Sharing one model
      // means sharing one free-tier TPM budget between two calls fired seconds apart —
      // using the other model gives this its own separate rate-limit pool.
      model: 'openai/gpt-oss-120b',
      messages: [
        {
          role: 'system',
          content: 'You are a clinical data extractor. Extract structured information from a medical consultation note. Return ONLY valid JSON, no markdown, no explanation. Never use an em dash (—) in any field; use a comma, period, or "and" instead.'
        },
        {
          role: 'user',
          content: `Extract all clinical information from this consultation note and return as JSON:

${gemini_doc.slice(0, 4000)}

Return this exact JSON structure (use null for missing fields):
{
  "patient": {
    "gender": "male or female or other or null",
    "primary_concern": "Most specific 1-sentence summary of their main health concern with all relevant conditions mentioned",
    "medical_history": "All past diagnoses, surgeries, medications, family history as a paragraph"
  },
  "qa_pairs": [
    {
      "question": "Clinical question that this answer addresses",
      "answer": "Specific answer extracted from the consultation notes"
    }
  ]
}

For qa_pairs, extract ALL clinical details as question-answer pairs covering:
- Current symptoms and complaints
- Diet and eating patterns  
- Sleep quality and schedule
- Physical activity level
- Stress and mental health
- Gut health and digestion
- Hormonal or menstrual health
- Past treatments that worked or failed
- Lab results or test findings
- Lifestyle and work context

Extract as many qa_pairs as the document supports. Be specific and clinical in both questions and answers.`
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
    })

    const raw = extractRes.choices[0]?.message?.content ?? ''
    console.log('Gemini parse raw:', raw.slice(0, 300))

    let extracted: {
      patient: { gender: string | null; primary_concern: string | null; medical_history: string | null }
      qa_pairs: { question: string; answer: string }[]
    }

    try {
      const clean = raw.replace(/```json|```/g, '').trim()
      const match = clean.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON found')
      extracted = JSON.parse(match[0])
    } catch (e) {
      return NextResponse.json({ error: `Parse failed: ${e instanceof Error ? e.message : e}. Raw: ${raw.slice(0, 200)}` }, { status: 500 })
    }

    // ── Update patient profile ────────────────────────────────
    const patientUpdate: Record<string, string | null> = {}
    if (extracted.patient?.gender) patientUpdate.gender = extracted.patient.gender
    if (extracted.patient?.primary_concern) patientUpdate.primary_concern = extracted.patient.primary_concern
    if (extracted.patient?.medical_history) patientUpdate.medical_history = extracted.patient.medical_history

    if (Object.keys(patientUpdate).length > 0) {
      await supabaseAdmin.from('patients').update(patientUpdate).eq('id', patient_id)
    }

    // ── Update session with Q&A pairs ─────────────────────────
    if (session_id && extracted.qa_pairs?.length > 0) {
      await supabaseAdmin.from('sessions').update({
        qa_pairs: extracted.qa_pairs,
        status: 'notes-added',
      }).eq('id', session_id)
    }

    return NextResponse.json({
      success: true,
      extracted: {
        patient: extracted.patient,
        qa_count: extracted.qa_pairs?.length ?? 0,
      }
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Parse Gemini error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
