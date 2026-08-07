'use client'

// A third, read-only patient-facing presentation of the exact same GuideData
// Classic (DashboardClient.tsx) and Almanac (AlmanacTemplate.tsx) use — same
// real data, a third visual language: a light neutral page with white
// bordered cards in a grid, one teal accent, and a circular adherence ring
// as the centerpiece instead of Almanac's tree. A coach always edits content
// in the Classic editor regardless of which template is picked; this
// component never runs in editable mode.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  HeartPulse, Utensils, Pill, Phone, CalendarCheck, HelpCircle, ChefHat, MapPin, ChevronDown, ChevronRight, X, Download,
  CheckCircle2, Circle, Sparkles, Star, ShoppingCart, Video, MessageCircle, Activity, Stethoscope, Users, Flame, Target, TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { GuideData, DayMealSlot } from '@/lib/pdf/ClientGuideDocument'
import { parseNutritionistGuidelines } from '@/lib/pdf/parseNutritionistGuidelines'
import { selectRecipesForPatient } from '@/lib/pdf/matchRecipes'
import { reshapeRoadmapIntoMonths } from '@/lib/pdf/reshapeRoadmap'
import { getSlotRecipes } from '@/lib/pdf/weekRecipes'
import { renderMarkdownBold } from '@/lib/renderMarkdownBold'
import { splitRecipeLines } from '@/lib/recipeText'
import { FOOD_PLATES, GROCERY_CATEGORIES, type MealType } from '@/lib/foodPlates'
import { buildGroceryList } from '@/lib/groceryList'
import { matchGuideImageDistinct } from '@/lib/pdf/matchGuideImage'
import { buildInlineExportScript } from '@/lib/pdf/inlineExportScript'

const DAY_MEAL_SLOTS: DayMealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']
const SLOT_LABELS: Record<DayMealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', dessert: 'Desserts' }
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']

const CARE_ICON_MAP: Record<string, LucideIcon> = {
  coaching: Star, video: Video, phone: Phone, chat: MessageCircle, nutrition: Utensils,
  labs: Activity, wellness: HeartPulse, clinical: Stethoscope, group: Users, followup: CalendarCheck,
}

function shiftDateISO(dateISO: string, deltaDays: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function asPhrase(sentence: string): string {
  return sentence.trim().replace(/\.+$/, '')
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

type Checkin = { week_number: number; action_index: number; checkin_date: string }

function parseBullets(text: string): string[] {
  return (text || '')
    .split(/\n|(?=•)/)
    .map((s) => s.replace(/^[•\-\s]+/, '').trim())
    .filter(Boolean)
}

function splitKV(bullet: string): { k: string | null; v: string } {
  const m = bullet.match(/^([^:]{2,30}):\s*(.+)$/)
  return m ? { k: m[1].trim(), v: m[2].trim() } : { k: null, v: bullet }
}

const PULSE = {
  bg: '#F5F7F5', card: '#FFFFFF', border: '#E5E8EB',
  ink: '#1C2430', inkSoft: '#4B5563', muted: '#6B7280',
  accent: '#0F9B8E', accentSoft: '#E1F5EE', accentDeep: '#085041',
  warn: '#D85A30',
}

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'

const TOC_ITEMS: { label: string; id: string }[] = [
  { label: 'Founder’s note', id: 'founder' },
  { label: 'Meet your coach', id: 'coach' },
  { label: 'Your care team', id: 'careteam' },
  { label: 'How to use this guide', id: 'howto' },
  { label: 'Your roadmap', id: 'roadmap' },
  { label: 'Lifestyle guidelines', id: 'lifestyle' },
  { label: 'Nutrition guidelines', id: 'nutrition' },
  { label: 'Superfood of the week', id: 'superfood' },
  { label: 'Grocery list', id: 'grocery' },
  { label: 'Supplements', id: 'supplements' },
  { label: 'Services', id: 'services' },
  { label: 'Track your progress', id: 'track' },
  { label: 'When to reach us', id: 'reach' },
  { label: 'FAQ', id: 'faq' },
]

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: PULSE.accent, display: 'block', marginBottom: 8 }}>
      {children}
    </span>
  )
}

function SecTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
      <span style={{ color: PULSE.accent, display: 'flex' }}>{icon}</span>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: PULSE.ink }}>{children}</h2>
    </div>
  )
}

function Card({ id, hidden, children, style }: { id?: string; hidden?: boolean; children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div id={id} style={{
      background: PULSE.card, border: `1px solid ${PULSE.border}`, borderRadius: 20, padding: '1.75rem 1.9rem', marginBottom: 16,
      ...(hidden ? { display: 'none' } : {}), ...style,
    }}>
      {children}
    </div>
  )
}

function KVGrid({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 18 }}>
      {items.map((bullet, i) => {
        const { k, v } = splitKV(bullet)
        return (
          <div key={i} style={{ border: `1px solid ${PULSE.border}`, borderRadius: 12, padding: '12px 14px', background: PULSE.bg }}>
            {k && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.accent, marginBottom: 4 }}>{k}</span>}
            <span style={{ fontSize: '0.9rem', lineHeight: 1.5, color: PULSE.ink }}>{renderMarkdownBold(v)}</span>
          </div>
        )
      })}
    </div>
  )
}

// The centerpiece visual: a circular ring filled to the patient's real
// tracked adherence (goalsDone / totalActionsInPlan, the same number "Track
// your progress" shows) — grounded in real data, same principle as
// Almanac's growing tree, different visual mechanism (a clinical/vital-signs
// read rather than an organic one).
function AdherenceRing({ pct, size = 132 }: { pct: number; size?: number }) {
  const r = (size - 14) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - pct / 100)
  return (
    <svg data-adherence-ring width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={PULSE.border} strokeWidth={12} />
      <circle data-ring-fill cx={c} cy={c} r={r} fill="none" stroke={PULSE.accent} strokeWidth={12} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset} transform={`rotate(-90 ${c} ${c})`} />
      <text data-ring-pct-text x={c} y={c - 4} textAnchor="middle" fontSize={size * 0.19} fontWeight={800} fill={PULSE.ink} fontFamily="'Plus Jakarta Sans', sans-serif">{pct}%</text>
      <text x={c} y={c + 16} textAnchor="middle" fontSize={size * 0.075} fontWeight={700} letterSpacing="0.06em" fill={PULSE.muted} fontFamily="'Plus Jakarta Sans', sans-serif">ADHERENCE</text>
    </svg>
  )
}

export default function PulseTemplate({ roadmapId, data, initialCheckins }: { roadmapId: string; data: GuideData; initialCheckins: Checkin[] }) {
  const firstName = data.patient.full_name?.split(' ')[0] || 'there'
  const coachFirst = data.coach?.full_name?.split(' ')[0] || 'your coach'
  const hiddenSections = data.hiddenSections ?? []
  const isHidden = (id: string) => hiddenSections.includes(id)
  const parsed = useMemo(() => parseNutritionistGuidelines(data.roadmap.nutritionist_guidelines), [data.roadmap.nutritionist_guidelines])
  const lifestyleBullets = useMemo(() => parseBullets(data.roadmap.lifestyle_guidelines), [data.roadmap.lifestyle_guidelines])

  const months = useMemo(() => reshapeRoadmapIntoMonths(data.roadmap.weekly_schedule).filter((m) => m.planned), [data.roadmap.weekly_schedule])
  const totalActionsInPlan = useMemo(() => months.reduce((n, m) => n + m.weeks.reduce((nn, w) => nn + (w.actions?.length ?? 0), 0), 0), [months])

  const [checkins, setCheckins] = useState<Checkin[]>(initialCheckins)
  const goalsDone = useMemo(() => new Set(checkins.map((c) => `${c.week_number}:${c.action_index}`)).size, [checkins])
  const adherencePct = totalActionsInPlan > 0 ? Math.round((goalsDone / totalActionsInPlan) * 100) : 0

  const weekMealMatches = useMemo(() => selectRecipesForPatient(
    { primaryConcern: data.patient.primary_concern || '', dietProtocol: parsed.dietProtocol },
    data.recipeBank, 5
  ), [data.patient.primary_concern, parsed.dietProtocol, data.recipeBank])

  const [openMonth, setOpenMonth] = useState<number | null>(null)
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)

  const today = todayISO()
  const progress = useMemo(() => {
    const dateSet = new Set(checkins.map((c) => c.checkin_date))
    let streak = 0
    let cursor = dateSet.has(today) ? today : shiftDateISO(today, -1)
    while (dateSet.has(cursor)) { streak++; cursor = shiftDateISO(cursor, -1) }
    const doneKeys = new Set(checkins.map((c) => `${c.week_number}:${c.action_index}`))
    const monthStats = months.map((m) => {
      const total = m.weeks.reduce((n, w) => n + (w.actions?.length ?? 0), 0)
      const done = m.weeks.reduce((n, w) => n + (w.actions ?? []).filter((_, i) => doneKeys.has(`${w.week_number}:${i}`)).length, 0)
      return { monthNumber: m.monthNumber, monthLabel: m.monthLabel, doneActions: done, totalActions: total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
    })
    const bestMonth = monthStats.reduce<typeof monthStats[number] | null>((best, m) => (m.doneActions > 0 && m.pct > (best?.pct ?? -1) ? m : best), null)
    return { streak, totalDaysLogged: dateSet.size, monthStats, bestMonth }
  }, [checkins, months, today])

  const checkedSet = useMemo(() => new Set(checkins.map((c) => `${c.week_number}:${c.action_index}:${c.checkin_date}`)), [checkins])

  async function toggleGoal(weekNumber: number, actionIndex: number) {
    const key = `${weekNumber}:${actionIndex}:${today}`
    const wasChecked = checkedSet.has(key)
    const revert = () => setCheckins((prev) => wasChecked
      ? [...prev, { week_number: weekNumber, action_index: actionIndex, checkin_date: today }]
      : prev.filter((c) => !(c.week_number === weekNumber && c.action_index === actionIndex && c.checkin_date === today)))
    setCheckins((prev) => wasChecked
      ? prev.filter((c) => !(c.week_number === weekNumber && c.action_index === actionIndex && c.checkin_date === today))
      : [...prev, { week_number: weekNumber, action_index: actionIndex, checkin_date: today }])
    try {
      const r = await fetch(`/api/roadmaps/${roadmapId}/checkins`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_number: weekNumber, action_index: actionIndex, date: today }),
      })
      if (!r.ok) revert()
    } catch {
      revert()
    }
  }

  const [activeMeal, setActiveMeal] = useState<MealType>('breakfast')
  const mealMatches = { breakfast: weekMealMatches.breakfast.slice(0, 2), lunch: weekMealMatches.lunch.slice(0, 2), dinner: weekMealMatches.dinner.slice(0, 2) }

  const [openGroceryMonth, setOpenGroceryMonth] = useState<number | null>(null)
  const [openGroceryWeek, setOpenGroceryWeek] = useState<number | null>(null)

  const [boughtItems, setBoughtItems] = useState<Set<string>>(new Set())
  const groceryStorageKey = `clp-grocery-${roadmapId}`
  useEffect(() => {
    try {
      const raw = localStorage.getItem(groceryStorageKey)
      if (raw) setBoughtItems(new Set(JSON.parse(raw)))
    } catch { /* ignore */ }
  }, [groceryStorageKey])
  function toggleBought(key: string) {
    setBoughtItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { localStorage.setItem(groceryStorageKey, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  const [openService, setOpenService] = useState<number | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const superfoodImage = useMemo(() => matchGuideImageDistinct('superfood nutrition weekly pick seasonal', data.imageBank, new Set()), [data.imageBank])

  // Downloads exactly what's rendered — every collapsible block in this
  // template is always mounted (just `display:none` when closed, never
  // conditionally unmounted) specifically so a DOM clone captures the whole
  // plan regardless of what happened to be open at download time, then a
  // shared vanilla-JS "offline brain" (src/lib/pdf/inlineExportScript.ts,
  // same one Almanac uses) makes month/week/recipe/grocery/goal toggles
  // work with zero network calls once opened as a local file.
  function downloadDashboard() {
    const root = document.getElementById('pulse-export-root')
    if (!root) return
    const clone = root.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-no-export]').forEach((el) => el.remove())
    clone.querySelectorAll('[data-hidden-section]').forEach((el) => el.remove())
    clone.querySelectorAll('[data-month-trigger]').forEach((el) => el.setAttribute('onclick', `clpToggleMonth('${el.getAttribute('data-month-trigger')}')`))
    clone.querySelectorAll('[data-week-trigger]').forEach((el) => el.setAttribute('onclick', `clpToggleWeek('${el.getAttribute('data-week-trigger')}')`))
    clone.querySelectorAll('[data-recipe-trigger]').forEach((el) => el.setAttribute('onclick', `clpToggleRecipe('${el.getAttribute('data-recipe-trigger')}')`))
    clone.querySelectorAll('[data-grocery-month-trigger]').forEach((el) => el.setAttribute('onclick', `clpToggleGroceryMonth('${el.getAttribute('data-grocery-month-trigger')}')`))
    clone.querySelectorAll('[data-grocery-week-trigger]').forEach((el) => el.setAttribute('onclick', `clpToggleGroceryWeek('${el.getAttribute('data-grocery-week-trigger')}')`))
    clone.querySelectorAll('[data-meal-trigger]').forEach((el) => el.setAttribute('onclick', `clpSetMealTab('${el.getAttribute('data-meal-trigger')}')`))
    clone.querySelectorAll('[data-faq-trigger]').forEach((el) => el.setAttribute('onclick', `clpToggleFaq('${el.getAttribute('data-faq-trigger')}')`))
    clone.querySelectorAll('[data-care-trigger]').forEach((el) => el.setAttribute('onclick', `clpToggleCare('${el.getAttribute('data-care-trigger')}')`))
    clone.querySelectorAll('[data-goal-toggle]').forEach((el) => {
      const key = (el.getAttribute('data-goal-toggle') || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      el.setAttribute('onclick', `toggleGoalExport('${key}', this)`)
    })
    clone.querySelectorAll('[data-grocery-item]').forEach((el) => {
      const key = (el.getAttribute('data-grocery-item') || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      el.setAttribute('onclick', `toggleGroceryItemExport('${key}', this)`)
    })
    clone.querySelectorAll('[style*="position: sticky"]').forEach((el) => ((el as HTMLElement).style.position = 'static'))

    const monthsData = months.map((m) => ({ monthNumber: m.monthNumber, monthLabel: m.monthLabel, weeks: m.weeks.map((w) => ({ week_number: w.week_number, totalActions: w.actions?.length ?? 0 })) }))
    const script = buildInlineExportScript({
      roadmapId, checkins, monthsData,
      colors: { ink: PULSE.ink, inkSoft: PULSE.inkSoft, muted: PULSE.muted, accent: PULSE.accent, accentSoft: PULSE.accentSoft, border: PULSE.border, onAccent: '#fff' },
    })
    const title = (data.patient?.full_name || 'Your') + "'s Plan, Clinic Living Plus"
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title.replace(/</g, '&lt;')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="${FONT_LINK}" rel="stylesheet">
<style>body{margin:0;}</style>
</head>
<body>${clone.outerHTML}
<script>${script}</script>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(data.patient?.full_name || 'client').replace(/\s+/g, '-')}-plan.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div id="pulse-export-root" style={{ background: PULSE.bg, minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', sans-serif", color: PULSE.ink, WebkitFontSmoothing: 'antialiased' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href={FONT_LINK} rel="stylesheet" />
      <a href={`/roadmaps/${roadmapId}/edit`} data-no-export style={{ display: 'none' }} />

      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(245,247,245,0.9)', backdropFilter: 'blur(6px)', borderBottom: `1px solid ${PULSE.border}` }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: PULSE.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>CLP</div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: PULSE.ink }}>Clinic Living Plus</span>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto' }}>
              {TOC_ITEMS.filter((item) => !isHidden(item.id)).map((item) => (
                <a key={item.id} href={`#${item.id}`} style={{ fontSize: 11.5, fontWeight: 600, color: PULSE.muted, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.label}</a>
              ))}
            </div>
            <button onClick={downloadDashboard} data-no-export
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '7px 14px', borderRadius: 20, border: 'none', background: PULSE.accent, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
              <Download size={13} /> Download your plan
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 20px 60px' }}>

        {/* Hero */}
        <Card style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <AdherenceRing pct={adherencePct} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <Eyebrow>Hi {firstName}</Eyebrow>
            <div style={{ fontSize: 24, fontWeight: 800, color: PULSE.ink, marginBottom: 6 }}>Here&apos;s your plan</div>
            <div style={{ fontSize: 13.5, color: PULSE.muted }}>{data.goalLabel}</div>
            {totalActionsInPlan > 0 && <div style={{ fontSize: 12, color: PULSE.accentDeep, fontWeight: 700, marginTop: 10 }}><span data-goals-done>{goalsDone}</span>/{totalActionsInPlan} goals tracked</div>}
          </div>
        </Card>

        {/* Founder's note */}
        <Card id="founder" hidden={isHidden('founder')}>
          <Eyebrow>A note from the founder</Eyebrow>
          <SecTitle icon={<HeartPulse size={20} />}>Founder&apos;s note</SecTitle>
          <div style={{ marginTop: 16, fontSize: '0.92rem', lineHeight: 1.7, color: PULSE.inkSoft }}>
            <p>{firstName},</p>
            <p>There are eleven people in this building who already know something about you.</p>
            <p>Not just your name, though it&apos;s already underlined twice in your file. Someone has read the notes from your consult call. Someone already knows which foods actually excite you, the dish you&apos;d genuinely look forward to, not just tolerate. And if you&apos;ve already walked through our doors before today, one of us probably remembers exactly where you sat.</p>
            <p>Your wellness coach said a small, quiet word to herself before she uploaded this document, the kind of thing she does for every plan, whether or not anyone ever finds out. Your doctor has already opened a new tab on her computer, right next to your history. It&apos;s empty for now. She&apos;s waiting to fill it with everything you&apos;re about to do.</p>
            <p>Here&apos;s the part I want you to actually believe: we are genuinely excited for you. Not in the polite, clinical, thank-you-for-choosing-us way. In the way you&apos;d be excited watching someone you love finally get somewhere they&apos;ve been trying to reach for years. Every small win on the way to {asPhrase(data.goalLabel.toLowerCase())}, the first night you sleep straight through, the first craving that doesn&apos;t win, the first lab report that makes your doctor sit up a little straighter, somebody here is going to see it and quietly punch the air.</p>
            <p>None of that is a metaphor. It&apos;s Tuesday-morning-huddle real.</p>
            <p>A year before I started Clinic Living Plus, I was the patient across the table, asking a question and getting an answer that didn&apos;t hold up when I looked closer. That gap, between what people are told and what&apos;s actually true about their own body, is the entire reason this place exists.</p>
            <p>So here&apos;s what I can promise: this document was not templated. A coach spent ninety real minutes listening to your actual life before a single recipe in here was chosen. What happens next is mostly on you. What happens around you, the noticing, the small adjustments, the quiet cheering at every step, has already begun.</p>
            <p>Come find us when something in here surprises you. We&apos;d love to hear it.</p>
            <p style={{ marginTop: 16, marginBottom: 0, fontWeight: 700, fontSize: '0.95rem', color: PULSE.ink }}>Roshni Sanghvi</p>
            <p style={{ marginTop: 2, fontSize: '0.72rem', letterSpacing: '0.06em', color: PULSE.muted, textTransform: 'uppercase' }}>Founder, Clinic Living Plus</p>
          </div>
        </Card>

        {/* Coach */}
        {data.coach && (
          <Card id="coach" hidden={isHidden('coach')} style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, flexShrink: 0, background: data.coach.photo_url ? `url(${data.coach.photo_url}) center/cover` : PULSE.accentSoft, border: `1px solid ${PULSE.border}` }} />
            <div>
              <Eyebrow>Your coach</Eyebrow>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: -4 }}>{data.coach.full_name}</div>
              <div style={{ fontSize: '0.82rem', color: PULSE.muted, marginTop: 2 }}>{data.coach.designation}</div>
              {data.coachQuote && <div style={{ marginTop: 8, fontStyle: 'italic', color: PULSE.accentDeep, fontSize: '0.88rem', maxWidth: 560 }}>&ldquo;{renderMarkdownBold(data.coachQuote)}&rdquo;</div>}
            </div>
          </Card>
        )}

        {/* Care team */}
        {data.careTeam.length > 0 && (
          <Card id="careteam" hidden={isHidden('careteam')}>
            <Eyebrow>Beyond your coach</Eyebrow>
            <SecTitle icon={<HeartPulse size={20} />}>Your care team</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 16 }}>
              {data.careTeam.map((m, i) => (
                <div key={i} style={{ background: PULSE.bg, border: `1px solid ${PULSE.border}`, borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.98rem', fontWeight: 700 }}>{m.name}</div>
                  {m.role && <div style={{ fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.muted, marginTop: 2 }}>{m.role}</div>}
                  {m.intro && <p style={{ fontSize: '0.86rem', lineHeight: 1.5, marginTop: 8, color: PULSE.inkSoft }}>{renderMarkdownBold(m.intro)}</p>}
                  {m.date && (
                    <div style={{ fontSize: '0.78rem', color: PULSE.accentDeep, fontWeight: 700, marginTop: 8 }}>
                      {new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {m.time && ` · ${new Date(`2000-01-01T${m.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* How to use this guide + Your why */}
        <Card id="howto" hidden={isHidden('howto')}>
          <Eyebrow>Getting oriented</Eyebrow>
          <SecTitle icon={<HelpCircle size={20} />}>How to use this guide</SecTitle>
          <p style={{ marginTop: 14, marginBottom: 18, fontSize: '0.92rem', lineHeight: 1.6, color: PULSE.inkSoft }}>This page is built to be opened often, not read once and forgotten. Here&apos;s where everything lives:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {[
              { title: 'Your roadmap', text: 'Tap a month, then a week, to see that week’s goals. Tap a meal slot to see the recipes picked for you.' },
              { title: 'Check off as you go', text: 'Tap a goal each day you actually do it. It’s tracked under “Track your progress” below, so ' + coachFirst + ' can see real adherence before your next session, not a guess.' },
              { title: 'Recipes update as you go', text: 'Matched to your notes and diet. If one looks off or missing, tell ' + coachFirst + ' rather than skipping it.' },
              { title: 'Supplements, if any', text: 'A supplement table only shows up here once ' + coachFirst + ' has reviewed and confirmed it. If that section is empty, none is prescribed yet.' },
              { title: 'When in doubt, ask', text: 'If anything here feels unclear or off, reach ' + coachFirst + ' before improvising, that’s exactly what they’re there for.' },
            ].map(({ title, text }) => (
              <div key={title} style={{ background: PULSE.bg, border: `1px solid ${PULSE.border}`, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 4, color: PULSE.ink }}>{title}</div>
                <div style={{ fontSize: '0.83rem', color: PULSE.muted, lineHeight: 1.55 }}>{text}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${PULSE.border}` }}>
            <Eyebrow>Your why</Eyebrow>
            {data.whyReflection ? (
              <p style={{ fontSize: '0.92rem', lineHeight: 1.65, color: PULSE.inkSoft }}>{firstName}, from what you shared with us: {renderMarkdownBold(data.whyReflection)}</p>
            ) : (
              <p style={{ fontSize: '0.88rem', color: PULSE.muted }}>Not filled in yet.</p>
            )}
          </div>
        </Card>

        {/* Your roadmap */}
        {months.length > 0 && (
          <Card id="roadmap" hidden={isHidden('roadmap')}>
            <Eyebrow>Month by month</Eyebrow>
            <SecTitle icon={<MapPin size={20} />}>Your roadmap</SecTitle>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
              {months.map((m) => (
                <button key={m.monthNumber} data-month-trigger={m.monthNumber} onClick={() => { const next = openMonth === m.monthNumber ? null : m.monthNumber; setOpenMonth(next); setOpenWeek(null); setOpenRecipeId(null) }}
                  style={{
                    padding: '8px 16px', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                    border: `1px solid ${openMonth === m.monthNumber ? PULSE.accent : PULSE.border}`,
                    background: openMonth === m.monthNumber ? PULSE.accent : 'transparent', color: openMonth === m.monthNumber ? '#fff' : PULSE.ink,
                  }}>
                  {m.monthLabel}
                </button>
              ))}
            </div>

            {months.map((m) => (
              <div key={m.monthNumber} data-month-body={m.monthNumber} style={{ marginTop: 22, display: openMonth === m.monthNumber ? 'block' : 'none' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                  {m.weeks.map((w) => (
                    <button key={w.week_number} data-week-trigger={w.week_number} onClick={() => { const next = openWeek === w.week_number ? null : w.week_number; setOpenWeek(next); setOpenRecipeId(null) }}
                      style={{
                        textAlign: 'left', padding: '11px 15px', borderRadius: 12, cursor: 'pointer', minWidth: 150,
                        border: `1px solid ${openWeek === w.week_number ? PULSE.accent : PULSE.border}`,
                        background: openWeek === w.week_number ? PULSE.accentSoft : PULSE.bg,
                      }}>
                      <div style={{ color: PULSE.accentDeep, fontSize: '0.72rem', fontWeight: 700 }}>Week {w.week_number}</div>
                      <div style={{ color: PULSE.ink, fontSize: '0.83rem', marginTop: 3 }}>{w.focus_theme}</div>
                    </button>
                  ))}
                </div>

                {m.weeks.map((w) => (
                  <div key={w.week_number} data-week-body={w.week_number} style={{ display: openWeek === w.week_number ? 'block' : 'none', borderTop: `1px solid ${PULSE.border}`, paddingTop: 20 }}>
                    {(w.actions?.length ?? 0) > 0 && (
                      <div style={{ marginBottom: 24 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.accent }}>This week&apos;s goals, tap one you&apos;ve done today</span>
                        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                          {(w.actions ?? []).map((action, ai) => {
                            const checked = checkedSet.has(`${w.week_number}:${ai}:${today}`)
                            return (
                              <li key={ai} data-goal-toggle={`${w.week_number}:${ai}`} onClick={() => toggleGoal(w.week_number, ai)}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 8, padding: '2px 0' }}>
                                <span data-goal-icon-done style={{ display: checked ? 'inline-flex' : 'none', flexShrink: 0, marginTop: 2 }}><CheckCircle2 size={16} color={PULSE.accent} /></span>
                                <span data-goal-icon-undone style={{ display: checked ? 'none' : 'inline-flex', flexShrink: 0, marginTop: 2 }}><Circle size={16} color={PULSE.muted} /></span>
                                <span data-goal-text style={{ color: checked ? PULSE.muted : PULSE.inkSoft, fontSize: '0.9rem', lineHeight: 1.6, textDecoration: checked ? 'line-through' : 'none' }}>{action}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    {getSlotRecipes(w.week_number, DAY_MEAL_SLOTS, data.weeklyManualRecipes, data.manualRecipes, weekMealMatches, data.recipeBank, 'Picked for your plan.')
                      .filter(({ matches }) => matches.length > 0)
                      .map(({ slot, matches }) => (
                        <div key={slot} style={{ marginBottom: 22 }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.muted }}>{SLOT_LABELS[slot]}</span>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 10 }}>
                            {matches.map(({ recipe }) => {
                              const recipeKey = `${w.week_number}-${slot}-${recipe.id}`
                              return (
                              <button key={recipeKey} data-recipe-trigger={recipeKey} onClick={() => setOpenRecipeId(openRecipeId === recipeKey ? null : recipeKey)}
                                style={{ textAlign: 'left', padding: 0, cursor: 'pointer', background: openRecipeId === recipeKey ? PULSE.accentSoft : PULSE.bg, border: `1px solid ${openRecipeId === recipeKey ? PULSE.accent : PULSE.border}`, borderRadius: 14, overflow: 'hidden' }}>
                                {recipe.image_url ? (
                                  <img src={recipe.image_url} alt={recipe.name} style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }} />
                                ) : (
                                  <div style={{ width: '100%', height: 96, background: PULSE.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ChefHat size={20} color={PULSE.accent} />
                                  </div>
                                )}
                                <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                  <span style={{ color: PULSE.ink, fontSize: '0.83rem', fontWeight: 700 }}>{recipe.name}</span>
                                  {openRecipeId === recipeKey ? <ChevronDown size={14} color={PULSE.accent} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} color={PULSE.muted} style={{ flexShrink: 0 }} />}
                                </div>
                              </button>
                              )
                            })}
                          </div>

                          {matches.map(({ recipe }) => {
                            const recipeKey = `${w.week_number}-${slot}-${recipe.id}`
                            return (
                            <div key={recipeKey} data-recipe-body={recipeKey} style={{ display: openRecipeId === recipeKey ? 'block' : 'none', marginTop: 14, background: PULSE.bg, border: `1px solid ${PULSE.accent}`, borderRadius: 16, padding: '1.5rem', position: 'relative' }}>
                              <button onClick={() => setOpenRecipeId(null)} data-no-export style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: PULSE.muted }}><X size={18} /></button>
                              <div style={{ display: 'grid', gridTemplateColumns: recipe.image_url ? '1fr 1.3fr' : '1fr', gap: 22 }}>
                                {recipe.image_url && <img src={recipe.image_url} alt={recipe.name} style={{ width: '100%', borderRadius: 12, objectFit: 'cover', maxHeight: 300 }} />}
                                <div>
                                  {recipe.protein_label && <Eyebrow>{recipe.protein_label}</Eyebrow>}
                                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: PULSE.ink, margin: '0 0 14px' }}>{recipe.name}</h3>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.accent }}>Ingredients</span>
                                  <ul style={{ listStyle: 'none', margin: '8px 0 14px', padding: 0 }}>
                                    {splitRecipeLines(recipe.ingredients).map((line, i) => (
                                      <li key={i} style={{ color: PULSE.inkSoft, fontSize: '0.86rem', lineHeight: 1.6, marginBottom: 4 }}>{line}</li>
                                    ))}
                                  </ul>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.accent }}>Directions</span>
                                  <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                                    {splitRecipeLines(recipe.steps).map((line, i) => (
                                      <li key={i} style={{ color: PULSE.inkSoft, fontSize: '0.86rem', lineHeight: 1.65, marginBottom: 6 }}>{line}</li>
                                    ))}
                                  </ol>
                                  {recipe.benefits && recipe.benefits.length > 0 && (
                                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${PULSE.border}` }}>
                                      <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.accent }}>Why it works</span>
                                      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                                        {recipe.benefits.map((b, i) => <li key={i} style={{ color: PULSE.inkSoft, fontSize: '0.84rem', lineHeight: 1.55, marginBottom: 4 }}>{b}</li>)}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            )
                          })}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </Card>
        )}

        {/* Lifestyle guidelines */}
        {lifestyleBullets.length > 0 && (
          <Card id="lifestyle" hidden={isHidden('lifestyle')}>
            <Eyebrow>Every day</Eyebrow>
            <SecTitle icon={<HeartPulse size={20} />}>Lifestyle guidelines</SecTitle>
            <KVGrid items={lifestyleBullets} />
          </Card>
        )}

        {/* Diet protocol — tied to the 'nutrition' toggle, same as Almanac,
            since Classic/PDF don't have a separate section for this. */}
        {parsed.dietProtocol.length > 0 && (
          <Card id="dietprotocol" hidden={isHidden('nutrition')}>
            <Eyebrow>Nutrition</Eyebrow>
            <SecTitle icon={<Utensils size={20} />}>Diet protocol</SecTitle>
            <KVGrid items={parsed.dietProtocol} />
          </Card>
        )}

        {/* Your power plates */}
        <Card id="nutrition" hidden={isHidden('nutrition')}>
          <Eyebrow>Building your plate</Eyebrow>
          <SecTitle icon={<Utensils size={20} />}>Your power plates</SecTitle>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 18 }}>
            {MEAL_TYPES.map((meal) => (
              <button key={meal} data-meal-trigger={meal} onClick={() => setActiveMeal(meal)}
                style={{
                  padding: '7px 16px', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, textTransform: 'capitalize',
                  border: activeMeal === meal ? 'none' : `1px solid ${PULSE.border}`,
                  background: activeMeal === meal ? PULSE.accent : 'transparent', color: activeMeal === meal ? '#fff' : PULSE.ink,
                }}>
                {meal}
              </button>
            ))}
          </div>
          {MEAL_TYPES.map((meal) => {
            const plate = FOOD_PLATES[meal]
            const recipes = mealMatches[meal]
            return (
              <div key={meal} data-meal-body={meal} style={{ display: meal === activeMeal ? 'block' : 'none' }}>
                <div style={{ fontSize: '0.8rem', color: PULSE.muted, marginBottom: 14 }}>{plate.ratios}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {plate.columns.map((col) => (
                    <div key={col.head}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.accentDeep }}>{col.head}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {col.items.map((item) => (
                          <span key={item} style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 14, background: PULSE.accentSoft, color: PULSE.accentDeep, border: `1px solid ${PULSE.border}` }}>{item}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {recipes.length > 0 && (
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${PULSE.border}` }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.muted }}>Picked for {meal}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      {recipes.map((m) => (
                        <div key={m.recipe.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 12, border: `1px solid ${PULSE.border}` }}>
                          {m.recipe.image_url ? (
                            <img src={m.recipe.image_url} alt={m.recipe.name} style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 42, height: 42, borderRadius: 8, background: PULSE.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ChefHat size={16} color={PULSE.accent} /></div>
                          )}
                          <div style={{ fontSize: '0.83rem', fontWeight: 600, color: PULSE.ink }}>{m.recipe.name}{m.recipe.protein_label ? ` · ${m.recipe.protein_label}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </Card>

        {/* Superfood of the week */}
        <Card id="superfood" hidden={isHidden('superfood')}>
          <Eyebrow>Fresh each week</Eyebrow>
          <SecTitle icon={<Sparkles size={20} />}>Superfood of the week</SecTitle>
          {superfoodImage && <img src={superfoodImage.image_url} alt={superfoodImage.label} style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 14, margin: '16px 0' }} />}
          <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: PULSE.inkSoft, marginTop: superfoodImage ? 0 : 16 }}>{coachFirst} picks this fresh each week around what&apos;s in season and what&apos;s actually useful for where you are right now, rather than a fixed pick that goes stale.</p>
          <p style={{ fontSize: '0.82rem', color: PULSE.muted, marginTop: 6 }}>You&apos;ll get this alongside your recipes each week, with a short note on why it was chosen for you specifically.</p>
        </Card>

        {/* Shopping list */}
        <Card id="grocery" hidden={isHidden('grocery')}>
          <Eyebrow>What to buy</Eyebrow>
          <SecTitle icon={<ShoppingCart size={20} />}>Your shopping list</SecTitle>
          <p style={{ fontSize: '0.87rem', color: PULSE.muted, marginTop: 14, marginBottom: 18 }}>Pulled straight from the ingredients of your matched recipes. Pick a week below to see it.</p>
          {months.length === 0 ? (
            <p style={{ fontSize: '0.87rem', color: PULSE.muted }}>Not planned yet, check back once your coach generates your roadmap.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {months.map((m) => (
                  <button key={m.monthNumber} data-grocery-month-trigger={m.monthNumber} onClick={() => { const next = openGroceryMonth === m.monthNumber ? null : m.monthNumber; setOpenGroceryMonth(next); setOpenGroceryWeek(null) }}
                    style={{
                      padding: '8px 16px', borderRadius: 20, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                      border: `1px solid ${openGroceryMonth === m.monthNumber ? PULSE.accent : PULSE.border}`,
                      background: openGroceryMonth === m.monthNumber ? PULSE.accent : 'transparent', color: openGroceryMonth === m.monthNumber ? '#fff' : PULSE.ink,
                    }}>
                    {m.monthLabel}
                  </button>
                ))}
              </div>
              {months.map((m) => (
                <div key={m.monthNumber} data-grocery-month-body={m.monthNumber} style={{ marginTop: 18, display: openGroceryMonth === m.monthNumber ? 'block' : 'none' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                    {m.weeks.map((w) => (
                      <button key={w.week_number} data-grocery-week-trigger={w.week_number} onClick={() => setOpenGroceryWeek(openGroceryWeek === w.week_number ? null : w.week_number)}
                        style={{
                          padding: '7px 13px', borderRadius: 10, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                          border: `1px solid ${openGroceryWeek === w.week_number ? PULSE.accent : PULSE.border}`,
                          background: openGroceryWeek === w.week_number ? PULSE.accentSoft : 'transparent', color: PULSE.ink,
                        }}>
                        Week {w.week_number}
                      </button>
                    ))}
                  </div>
                  {m.weeks.map((w) => {
                    const weekRecipes = getSlotRecipes(w.week_number, DAY_MEAL_SLOTS, data.weeklyManualRecipes, data.manualRecipes, weekMealMatches, data.recipeBank, 'Picked for your plan.').flatMap((s) => s.matches).map((mm) => mm.recipe)
                    const cats = buildGroceryList(weekRecipes)
                    const finalCats = cats.length > 0 ? cats : GROCERY_CATEGORIES
                    return (
                      <div key={w.week_number} data-grocery-week-body={w.week_number} style={{ display: openGroceryWeek === w.week_number ? 'grid' : 'none', borderTop: `1px solid ${PULSE.border}`, paddingTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 18 }}>
                        {finalCats.map((cat) => (
                          <div key={cat.head}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.accentDeep }}>{cat.head}</span>
                            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                              {cat.items.map((item) => {
                                const itemKey = `${w.week_number}:${cat.head}:${item}`
                                const bought = boughtItems.has(itemKey)
                                return (
                                  <li key={item} data-grocery-item={itemKey} onClick={() => toggleBought(itemKey)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.81rem', color: bought ? PULSE.muted : PULSE.inkSoft, padding: '3px 0', cursor: 'pointer' }}>
                                    <span data-grocery-icon-done style={{ display: bought ? 'inline-flex' : 'none', flexShrink: 0 }}><CheckCircle2 size={13} color={PULSE.accent} /></span>
                                    <span data-grocery-icon-undone style={{ display: bought ? 'none' : 'inline-flex', flexShrink: 0 }}><Circle size={13} color={PULSE.muted} /></span>
                                    <span data-grocery-item-text style={{ textDecoration: bought ? 'line-through' : 'none' }}>{item}</span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </>
          )}
        </Card>

        {/* Supplements */}
        {data.confirmedSupplements.length > 0 && (
          <Card id="supplements" hidden={isHidden('supplements')}>
            <Eyebrow>Confirmed by {coachFirst}</Eyebrow>
            <SecTitle icon={<Pill size={20} />}>Your supplement plan</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 16 }}>
              {data.confirmedSupplements.map((s, i) => (
                <div key={i} style={{ background: PULSE.bg, border: `1px solid ${PULSE.border}`, borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ color: PULSE.ink, fontWeight: 700, fontSize: '0.9rem' }}>{s.name}</div>
                  <div style={{ color: PULSE.inkSoft, fontSize: '0.82rem', marginTop: 4 }}>{[s.dose, s.timing, s.duration].filter(Boolean).join(' · ')}</div>
                  {s.notes && <div style={{ color: PULSE.warn, fontSize: '0.78rem', marginTop: 6 }}>⚠ {s.notes}</div>}
                </div>
              ))}
            </div>
            <div style={{ color: PULSE.muted, fontSize: '0.76rem', marginTop: 14 }}>Don&apos;t start, stop, or change a dose without confirming with {coachFirst} first.</div>
          </Card>
        )}

        {/* What's included in your care */}
        {data.careServices.length > 0 && (
          <Card id="services" hidden={isHidden('services')}>
            <Eyebrow>Your plan</Eyebrow>
            <SecTitle icon={<Star size={20} />}>What&apos;s included in your care</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10, marginTop: 16 }}>
              {data.careServices.map((svc, i) => {
                const Icon = CARE_ICON_MAP[svc.icon] || Star
                const isOpen = openService === i
                return (
                  <button key={i} data-care-trigger={i} onClick={() => setOpenService(isOpen ? null : i)}
                    style={{ textAlign: 'left', padding: '13px 12px', borderRadius: 14, cursor: 'pointer', border: `1px solid ${isOpen ? PULSE.accent : PULSE.border}`, background: isOpen ? PULSE.accentSoft : PULSE.bg }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: '#fff', border: `1px solid ${PULSE.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 9 }}>
                      <Icon size={15} color={PULSE.accent} />
                    </div>
                    <div style={{ fontSize: '0.83rem', fontWeight: 700, color: PULSE.ink }}>{svc.name}</div>
                    {svc.sessions && <div style={{ fontSize: '0.73rem', color: PULSE.muted, marginTop: 2 }}>{svc.sessions}</div>}
                  </button>
                )
              })}
            </div>
            {data.careServices.map((svc, i) => svc.description && (
              <div key={i} data-care-body={i} style={{ display: openService === i ? 'block' : 'none', marginTop: 14, padding: '14px 16px', borderRadius: 12, border: `1px solid ${PULSE.border}`, background: PULSE.bg }}>
                <div style={{ fontWeight: 700, fontSize: '0.87rem', marginBottom: 6, color: PULSE.ink }}>{svc.name}</div>
                <p style={{ fontSize: '0.85rem', lineHeight: 1.55, margin: 0, color: PULSE.inkSoft }}>{renderMarkdownBold(svc.description || '')}</p>
              </div>
            ))}
          </Card>
        )}

        {/* Track your progress */}
        <Card id="track" hidden={isHidden('track')}>
          <Eyebrow>Real numbers, not a guess</Eyebrow>
          <SecTitle icon={<CheckCircle2 size={20} />}>Track your progress</SecTitle>
          <p data-track-empty style={{ fontSize: '0.87rem', color: PULSE.muted, marginTop: 14, display: progress.totalDaysLogged === 0 ? 'block' : 'none' }}>No check-ins logged yet, tap a goal in your roadmap above each day you complete it, and your progress will show up here.</p>
          <div data-track-content style={{ display: progress.totalDaysLogged === 0 ? 'none' : 'block' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18, marginBottom: 22 }}>
              {[
                { key: 'streak', icon: <Flame size={14} />, value: progress.streak, label: 'day streak' },
                { key: 'days', icon: <CalendarCheck size={14} />, value: progress.totalDaysLogged, label: 'days logged, total' },
                { key: 'goals', icon: <Target size={14} />, value: `${goalsDone}/${totalActionsInPlan}`, label: 'goals accomplished' },
                { key: 'best', icon: <TrendingUp size={14} />, value: progress.bestMonth ? `${progress.bestMonth.pct}%` : '0%', label: progress.bestMonth ? `best month · ${progress.bestMonth.monthLabel}` : 'best month' },
              ].map((s) => (
                <div key={s.key} style={{ flex: '1 1 125px', padding: '12px 14px', borderRadius: 12, border: `1px solid ${PULSE.border}`, background: PULSE.bg }}>
                  <span style={{ color: PULSE.accent }}>{s.icon}</span>
                  <div data-stat={s.key} style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 8, color: PULSE.ink }}>{s.value}</div>
                  <div data-stat-label={s.key} style={{ fontSize: '0.73rem', color: PULSE.muted, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: PULSE.muted }}>Goals completed by month</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 12 }}>
              {progress.monthStats.map((m) => (
                <div key={m.monthNumber} style={{ textAlign: 'center' }}>
                  <div data-stat-pct={m.monthNumber} style={{ fontSize: '1.25rem', fontWeight: 800, color: m.pct >= 70 ? PULSE.accent : PULSE.ink }}>{m.pct}%</div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, marginTop: 2, color: PULSE.ink }}>{m.monthLabel}</div>
                  <div data-stat-sub={m.monthNumber} style={{ fontSize: '0.7rem', color: PULSE.muted }}>{m.doneActions}/{m.totalActions} goals</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* When to reach us */}
        <Card id="reach" hidden={isHidden('reach')}>
          <Eyebrow>Reach us</Eyebrow>
          <SecTitle icon={<Phone size={20} />}>When to reach us</SecTitle>
          {data.nextAppointment.date ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: PULSE.accentDeep, fontSize: '0.83rem', fontWeight: 700, marginBottom: 12, background: PULSE.accentSoft, padding: '6px 12px', borderRadius: 20 }}>
                <CalendarCheck size={15} />
                {new Date(data.nextAppointment.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {data.nextAppointment.time && ` · ${new Date(`2000-01-01T${data.nextAppointment.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                {data.nextAppointment.mode && ` · ${data.nextAppointment.mode}`}
              </div>
              <p style={{ color: PULSE.inkSoft, fontSize: '0.89rem', lineHeight: 1.6 }}>Please continue following your personalized plan as recommended. Keep track of any changes, questions, or concerns so they can be discussed during your next visit.</p>
              <p style={{ color: PULSE.inkSoft, fontSize: '0.89rem', lineHeight: 1.6 }}>If you experience any unexpected or worsening symptoms, have difficulty following your plan, or are unsure about any recommendations, please contact our team before your scheduled appointment.</p>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: PULSE.inkSoft, fontSize: '0.89rem', lineHeight: 1.6 }}>Continue following your personalized care plan as recommended.</p>
              <p style={{ color: PULSE.inkSoft, fontSize: '0.89rem', lineHeight: 1.6 }}>Keep track of your progress and any questions or concerns.</p>
              <p style={{ color: PULSE.inkSoft, fontSize: '0.89rem', lineHeight: 1.6 }}>In a medical emergency, seek immediate emergency medical care.</p>
              <p style={{ color: PULSE.inkSoft, fontSize: '0.89rem', lineHeight: 1.6 }}>Contact our team if you need guidance or notice any unexpected changes in your health.</p>
            </div>
          )}
          {data.coach?.email && (
            <p style={{ color: PULSE.accentDeep, fontSize: '0.83rem', marginTop: 12, fontWeight: 600 }}>Message {coachFirst} directly at {data.coach.email}.</p>
          )}
        </Card>

        {/* FAQ */}
        <Card id="faq" hidden={isHidden('faq')} style={{ marginBottom: 0 }}>
          <Eyebrow>Questions we hear most</Eyebrow>
          <SecTitle icon={<HelpCircle size={20} />}>FAQ</SecTitle>
          <div style={{ marginTop: 16 }}>
            {[
              ['What if I can’t finish everything on my plate exactly as shown?', 'Getting the food groups roughly right matters far more than hitting exact portions.'],
              ['What if I miss a few days on my habit tracker?', 'Log what actually happened, not what you wish had happened. An honest gap tells your coach more than a perfect-looking week.'],
              ['Can I eat something that’s not on the lists?', 'Yes, the lists are what to lean on, not a ban on everything else. Ask your coach if unsure.'],
            ].map(([q, a], i) => {
              const isOpen = openFaq === i
              return (
                <div key={i} style={{ borderBottom: i < 2 ? `1px solid ${PULSE.border}` : 'none' }}>
                  <button data-faq-trigger={i} onClick={() => setOpenFaq(isOpen ? null : i)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ color: PULSE.ink, fontWeight: 700, fontSize: '0.92rem' }}>{q}</span>
                    {isOpen ? <ChevronDown size={16} color={PULSE.accent} style={{ flexShrink: 0 }} /> : <ChevronRight size={16} color={PULSE.muted} style={{ flexShrink: 0 }} />}
                  </button>
                  <div data-faq-body={i} style={{ display: isOpen ? 'block' : 'none', color: PULSE.inkSoft, fontSize: '0.86rem', paddingBottom: 15 }}>{a}</div>
                </div>
              )
            })}
          </div>
        </Card>

        <div style={{ color: PULSE.muted, fontSize: '0.75rem', marginTop: 24, textAlign: 'center' }}>Clinic Living Plus Pvt Ltd™</div>
      </div>
    </div>
  )
}
