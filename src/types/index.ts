export type Patient = {
  id: string
  clinic_patient_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  gender: 'male' | 'female' | 'other' | null
  medical_history: string | null
  primary_concern: string | null
  assigned_nutritionist: string | null
  nutritionist_id: string | null
  created_at: string
}

export type Session = {
  id: string
  patient_id: string
  session_date: string
  session_type?: 'first-meet' | 'follow-up' | 'review' // legacy DB default — no longer set or shown by the UI
  gemini_doc_raw: string | null
  pre_meeting_notes: string | null
  post_meeting_notes: string | null
  follow_up_notes: string | null
  status: 'pending' | 'notes-added' | 'interpreted' | 'pdf-ready'
  created_at: string
  patients?: Patient
}

export type Roadmap = {
  id: string
  session_id: string
  patient_id: string
  overview: string | null
  lifestyle_guidelines: string | null
  nutritionist_guidelines: string | null
  weekly_schedule: WeeklyPlan[] | null
  duration_months: number
  status: 'draft' | 'final'
  created_at: string
}

export type WeeklyPlan = {
  week_number: number
  focus_theme: string
  recipes: string[]
  supplements: string[]
  goals: string[]
}

export type KbDocument = {
  id: string
  title: string
  source_type: 'book' | 'podcast' | 'article' | 'gemini-note' | 'guideline'
  content: string
  tags: string[]
  created_at: string
}
