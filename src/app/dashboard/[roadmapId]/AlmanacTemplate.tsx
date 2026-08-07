'use client'

// An alternate, read-only patient-facing presentation of the exact same
// GuideData the Classic template (DashboardClient.tsx) uses — same real
// data, different visual language (inspired by a reference design the
// coach liked: warm paper/gold/dusk color bands, Fraunces/Work
// Sans/IBM Plex Mono typography, scroll-reveal). A coach always edits
// content in the Classic editor regardless of which template is picked;
// this component never runs in editable mode.
//
// The reference design's centerpiece was a literal minute-by-minute daily
// schedule wheel — this app doesn't collect timestamped schedules, and
// inventing one would violate the "never fabricate" rule that's shaped
// every other feature in this app. In its place: a tree that grows through
// real stages as the patient's actual tracked adherence (goalsDone /
// totalActionsInPlan, the same number "Track your progress" already shows)
// increases — a meaningful visual grounded in real data instead.
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

// Same icon set as the Classic editor's care-service picker (src/app/dashboard/[roadmapId]/DashboardClient.tsx)
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

// A guideline bullet is often "Category: detail" (e.g. "Fasting window: 12-14
// hour overnight fast") — splits it into a key/value chip when that shape is
// present, otherwise just shows the whole line as the value.
function splitKV(bullet: string): { k: string | null; v: string } {
  const m = bullet.match(/^([^:]{2,30}):\s*(.+)$/)
  return m ? { k: m[1].trim(), v: m[2].trim() } : { k: null, v: bullet }
}

const PALETTE = {
  paper1: '#F7EFE0', paper2: '#F2E6CE', paper3: '#EAD9B4',
  gold1: '#E0C384', gold2: '#C9A24E',
  dusk1: '#8C5B45', dusk2: '#6E4740',
  night1: '#3E4436', night2: '#2B2F26', night3: '#211F19',
  ink: '#2B2A22', cream: '#F3ECDA', goldAccent: '#C89B3C', berry: '#7A3346',
  line: 'rgba(43,42,34,0.18)',
}

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,600;1,9..144,500&family=Work+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap'

function Eyebrow({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.65, color: dark ? PALETTE.cream : PALETTE.ink, display: 'block', marginBottom: 12 }}>
      {children}
    </span>
  )
}

function SecTitle({ icon, children, dark }: { icon: React.ReactNode; children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <span style={{ color: dark ? PALETTE.cream : PALETTE.ink, opacity: 0.85 }}>{icon}</span>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 'clamp(1.6rem,3.6vw,2.2rem)', margin: 0, color: dark ? PALETTE.cream : PALETTE.ink }}>{children}</h2>
    </div>
  )
}

function KVGrid({ items, dark }: { items: string[]; dark?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 24 }}>
      {items.map((bullet, i) => {
        const { k, v } = splitKV(bullet)
        return (
          <div key={i} style={{
            border: `1px solid ${dark ? 'rgba(243,236,218,0.22)' : PALETTE.line}`, borderRadius: 10, padding: '14px 16px',
            background: dark ? 'rgba(243,236,218,0.06)' : 'rgba(255,255,255,0.35)',
          }}>
            {k && <span style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, marginBottom: 4, color: dark ? PALETTE.cream : PALETTE.ink }}>{k}</span>}
            <span style={{ fontSize: '0.95rem', lineHeight: 1.5, color: dark ? PALETTE.cream : PALETTE.ink }}>{renderMarkdownBold(v)}</span>
          </div>
        )
      })}
    </div>
  )
}

// A tree that grows through 5 real stages as tracked adherence (pct,
// 0-100) increases — replaces the reference design's fabricated schedule
// wheel with something grounded in data this app actually has. Renders all
// 5 stages up front (only the current one visible via CSS) rather than just
// the one matching today's pct, so the downloaded static file can switch
// stages live as the patient checks off goals offline — a stage the SVG
// was never rendered for in the first place can't be revealed by any
// amount of vanilla JS after the fact.
function stageForPct(pct: number): number {
  return pct >= 85 ? 4 : pct >= 60 ? 3 : pct >= 35 ? 2 : pct >= 10 ? 1 : 0
}
function TreeStage({ stage, visible }: { stage: number; visible: boolean }) {
  const trunkH = 20 + stage * 15
  const canopyR = 8 + stage * 13
  const leafOn = stage >= 1
  return (
    <svg data-tree-stage={stage} width="220" height="240" viewBox="0 0 220 240" style={{ display: visible ? 'block' : 'none', margin: '0 auto' }}>
      <ellipse cx="110" cy="220" rx="70" ry="8" fill={PALETTE.ink} opacity="0.08" />
      <rect x="105" y={220 - trunkH} width="10" height={trunkH} rx="4" fill={PALETTE.dusk1} />
      {leafOn && (
        <>
          <circle cx="110" cy={220 - trunkH - canopyR * 0.6} r={canopyR} fill={PALETTE.gold2} opacity="0.9" />
          {stage >= 2 && <circle cx={110 - canopyR * 0.55} cy={220 - trunkH - canopyR * 0.3} r={canopyR * 0.7} fill={PALETTE.goldAccent} opacity="0.85" />}
          {stage >= 2 && <circle cx={110 + canopyR * 0.55} cy={220 - trunkH - canopyR * 0.3} r={canopyR * 0.7} fill={PALETTE.goldAccent} opacity="0.85" />}
          {stage >= 3 && <circle cx="110" cy={220 - trunkH - canopyR * 1.15} r={canopyR * 0.65} fill={PALETTE.gold1} opacity="0.95" />}
          {stage >= 4 && [...Array(6)].map((_, i) => {
            const angle = (i / 6) * Math.PI * 2
            return <circle key={i} cx={110 + Math.cos(angle) * canopyR * 1.3} cy={220 - trunkH - canopyR * 0.6 + Math.sin(angle) * canopyR * 0.5} r={5} fill={PALETTE.berry} />
          })}
        </>
      )}
      {stage === 0 && <circle cx="110" cy="216" r="5" fill={PALETTE.dusk2} />}
    </svg>
  )
}
function GrowthTree({ pct }: { pct: number }) {
  const stage = stageForPct(pct)
  return (
    <div data-growth-tree style={{ position: 'relative' }}>
      {[0, 1, 2, 3, 4].map((s) => <TreeStage key={s} stage={s} visible={s === stage} />)}
    </div>
  )
}

const GROWTH_LABELS = ['Just planted', 'First sprout', 'Taking root', 'Growing strong', 'In full bloom']

export default function AlmanacTemplate({ roadmapId, data, initialCheckins }: { roadmapId: string; data: GuideData; initialCheckins: Checkin[] }) {
  const firstName = data.patient.full_name?.split(' ')[0] || 'there'
  const coachFirst = data.coach?.full_name?.split(' ')[0] || 'your coach'
  // Always read-only — a coach's hide/show choice (made in the Classic
  // editor, the only place editing happens) is just a saved fact here.
  const hiddenStyle = (id: string): CSSProperties => ((data.hiddenSections ?? []).includes(id) ? { display: 'none' } : {})
  const parsed = useMemo(() => parseNutritionistGuidelines(data.roadmap.nutritionist_guidelines), [data.roadmap.nutritionist_guidelines])
  const lifestyleBullets = useMemo(() => parseBullets(data.roadmap.lifestyle_guidelines), [data.roadmap.lifestyle_guidelines])

  const months = useMemo(() => reshapeRoadmapIntoMonths(data.roadmap.weekly_schedule).filter((m) => m.planned), [data.roadmap.weekly_schedule])
  const totalActionsInPlan = useMemo(() => months.reduce((n, m) => n + m.weeks.reduce((nn, w) => nn + (w.actions?.length ?? 0), 0), 0), [months])

  // Same real, tappable goal check-off as Classic — striking a goal here
  // persists to the same checkins table, so "Track your progress" and the
  // tree above update immediately, live, not just on the next page load.
  const [checkins, setCheckins] = useState<Checkin[]>(initialCheckins)
  const goalsDone = useMemo(() => new Set(checkins.map((c) => `${c.week_number}:${c.action_index}`)).size, [checkins])
  const adherencePct = totalActionsInPlan > 0 ? Math.round((goalsDone / totalActionsInPlan) * 100) : 0

  // Matched once at the same limit (5) Classic uses, so both templates rank
  // recipes identically — this is the real per-week curated data (a coach's
  // explicit picks win; otherwise the same auto-match Classic falls back to)
  // via the shared helper in src/lib/pdf/weekRecipes.ts, not a separate
  // flat/generic list.
  const weekMealMatches = useMemo(() => selectRecipesForPatient(
    { primaryConcern: data.patient.primary_concern || '', dietProtocol: parsed.dietProtocol },
    data.recipeBank, 5
  ), [data.patient.primary_concern, parsed.dietProtocol, data.recipeBank])

  const [openMonth, setOpenMonth] = useState<number | null>(null)
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)

  // Same real check-in-derived stats "Track your progress" shows in
  // Classic (src/app/dashboard/[roadmapId]/DashboardClient.tsx) — never a
  // placeholder number.
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

  // Same optimistic-update-with-revert pattern as Classic's toggle() —
  // persists to the same /checkins endpoint, so ticking a goal here shows
  // up identically if the coach or patient later opens the Classic template.
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

  // Your power plates — same static reference content + top-2 auto-matched
  // recipes per meal as Classic.
  const [activeMeal, setActiveMeal] = useState<MealType>('breakfast')
  const mealMatches = { breakfast: weekMealMatches.breakfast.slice(0, 2), lunch: weekMealMatches.lunch.slice(0, 2), dinner: weekMealMatches.dinner.slice(0, 2) }

  // Shopping list — same per-week, recipe-derived, categorized ingredients
  // as Classic (src/lib/groceryList.ts), expanding inline instead of a popup.
  const [openGroceryMonth, setOpenGroceryMonth] = useState<number | null>(null)
  const [openGroceryWeek, setOpenGroceryWeek] = useState<number | null>(null)

  // "Bought" checklist — same personal, never-synced-to-the-server
  // localStorage checklist as Classic, under the SAME storage key
  // (clp-grocery-${roadmapId}) and the same item-key format, so checking
  // something off here shows checked in Classic too, and vice versa.
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

  // What's included in your care — same coach-entered tiles as Classic.
  const [openService, setOpenService] = useState<number | null>(null)

  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Same "no real match beats a fabricated one" tag-matched photo as Classic
  // — a plain icon tile shows instead if nothing in the picture bank fits.
  const superfoodImage = useMemo(() => matchGuideImageDistinct('superfood nutrition weekly pick seasonal', data.imageBank, new Set()), [data.imageBank])

  // Downloads exactly what's rendered — every collapsible block in this
  // template is always mounted (just `display:none` when closed, never
  // conditionally unmounted) specifically so a DOM clone captures the whole
  // plan regardless of what happened to be open at download time, then a
  // shared vanilla-JS "offline brain" (src/lib/pdf/inlineExportScript.ts,
  // same one Pulse uses) makes month/week/recipe/grocery/goal toggles work
  // with zero network calls once opened as a local file.
  function downloadDashboard() {
    const root = document.getElementById('almanac-export-root')
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
      colors: { ink: PALETTE.ink, inkSoft: PALETTE.ink, muted: 'rgba(43,42,34,0.55)', accent: PALETTE.berry, accentSoft: 'rgba(122,51,70,0.08)', border: PALETTE.line, onAccent: '#fff' },
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
    <div id="almanac-export-root" style={{ background: PALETTE.paper1, minHeight: '100vh', fontFamily: "'Work Sans', sans-serif", color: PALETTE.ink, WebkitFontSmoothing: 'antialiased' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href={FONT_LINK} rel="stylesheet" />
      <a href={`/roadmaps/${roadmapId}/edit`} data-no-export style={{ display: 'none' }} />

      {/* Hero */}
      <section style={{ padding: '5rem 1.5rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: PALETTE.berry, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>CLP</div>
          <Eyebrow>Clinic Living Plus</Eyebrow>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 'clamp(2.2rem,6vw,3.6rem)', lineHeight: 1.05, letterSpacing: '-0.01em', margin: 0 }}>
            Hi {firstName},<br />here&apos;s your plan
          </h1>
          <div style={{ marginTop: '1.1rem', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: PALETTE.berry }}>{data.goalLabel}</div>

          <div style={{ margin: '2.5rem 0 0.5rem' }}>
            <GrowthTree pct={adherencePct} />
          </div>
          <div data-growth-caption style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6 }}>
            {totalActionsInPlan > 0 ? <>{GROWTH_LABELS[stageForPct(adherencePct)]} · <span data-goals-done>{goalsDone}</span>/{totalActionsInPlan} goals tracked</> : 'Your progress tree, check off goals in your plan to grow it'}
          </div>
          <button onClick={downloadDashboard} data-no-export
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 24, padding: '10px 20px', borderRadius: 24, border: 'none', background: PALETTE.berry, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Download size={15} /> Download your plan
          </button>
        </div>
      </section>

      {/* Founder's note — same letter as Classic, personalized with name/goal */}
      <section style={{ background: PALETTE.paper2, padding: '4rem 1.5rem', ...hiddenStyle('founder') }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Eyebrow>A note from the founder</Eyebrow>
          <SecTitle icon={<HeartPulse size={26} />}>Founder&apos;s Note</SecTitle>
          <div style={{ marginTop: 20, fontSize: '0.95rem', lineHeight: 1.75 }}>
            <p>{firstName},</p>
            <p>There are eleven people in this building who already know something about you.</p>
            <p>Not just your name, though it&apos;s already underlined twice in your file. Someone has read the notes from your consult call. Someone already knows which foods actually excite you, the dish you&apos;d genuinely look forward to, not just tolerate. And if you&apos;ve already walked through our doors before today, one of us probably remembers exactly where you sat.</p>
            <p>Your wellness coach said a small, quiet word to herself before she uploaded this document, the kind of thing she does for every plan, whether or not anyone ever finds out. Your doctor has already opened a new tab on her computer, right next to your history. It&apos;s empty for now. She&apos;s waiting to fill it with everything you&apos;re about to do.</p>
            <p>Here&apos;s the part I want you to actually believe: we are genuinely excited for you. Not in the polite, clinical, thank-you-for-choosing-us way. In the way you&apos;d be excited watching someone you love finally get somewhere they&apos;ve been trying to reach for years. Every small win on the way to {asPhrase(data.goalLabel.toLowerCase())}, the first night you sleep straight through, the first craving that doesn&apos;t win, the first lab report that makes your doctor sit up a little straighter, somebody here is going to see it and quietly punch the air.</p>
            <p>None of that is a metaphor. It&apos;s Tuesday-morning-huddle real.</p>
            <p>A year before I started Clinic Living Plus, I was the patient across the table, asking a question and getting an answer that didn&apos;t hold up when I looked closer. That gap, between what people are told and what&apos;s actually true about their own body, is the entire reason this place exists.</p>
            <p>So here&apos;s what I can promise: this document was not templated. A coach spent ninety real minutes listening to your actual life before a single recipe in here was chosen. What happens next is mostly on you. What happens around you, the noticing, the small adjustments, the quiet cheering at every step, has already begun.</p>
            <p>Come find us when something in here surprises you. We&apos;d love to hear it.</p>
            <p style={{ marginTop: 20, marginBottom: 0, fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: '1.05rem' }}>Roshni Sanghvi</p>
            <p style={{ marginTop: 2, fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', letterSpacing: '0.08em', opacity: 0.6 }}>FOUNDER, CLINIC LIVING PLUS</p>
          </div>
        </div>
      </section>

      {/* Coach */}
      {data.coach && (
        <section style={{ background: PALETTE.paper2, borderTop: `1px solid ${PALETTE.line}`, borderBottom: `1px solid ${PALETTE.line}`, padding: '3rem 1.5rem', ...hiddenStyle('coach') }}>
          <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, flexShrink: 0, background: data.coach.photo_url ? `url(${data.coach.photo_url}) center/cover` : PALETTE.gold1, border: `1px solid ${PALETTE.line}` }} />
            <div>
              <Eyebrow>Your coach</Eyebrow>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: '1.3rem', fontWeight: 500, marginTop: -8 }}>{data.coach.full_name}</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.65, marginTop: 2 }}>{data.coach.designation}</div>
              {data.coachQuote && <div style={{ marginTop: 10, fontStyle: 'italic', color: PALETTE.berry, fontSize: '0.92rem', maxWidth: 560 }}>&ldquo;{renderMarkdownBold(data.coachQuote)}&rdquo;</div>}
            </div>
          </div>
        </section>
      )}

      {/* Care team */}
      {data.careTeam.length > 0 && (
        <section style={{ background: PALETTE.paper3, padding: '4rem 1.5rem', ...hiddenStyle('careteam') }}>
          <div style={{ maxWidth: 920, margin: '0 auto' }}>
            <Eyebrow>Beyond your coach</Eyebrow>
            <SecTitle icon={<HeartPulse size={26} />}>Your care team</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 20 }}>
              {data.careTeam.map((m, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.4)', border: `1px solid ${PALETTE.line}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: '1.05rem', fontWeight: 500 }}>{m.name}</div>
                  {m.role && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, marginTop: 2 }}>{m.role}</div>}
                  {m.intro && <p style={{ fontSize: '0.9rem', lineHeight: 1.5, marginTop: 8 }}>{renderMarkdownBold(m.intro)}</p>}
                  {m.date && (
                    <div style={{ fontSize: '0.82rem', color: PALETTE.berry, fontWeight: 600, marginTop: 8 }}>
                      {new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {m.time && ` · ${new Date(`2000-01-01T${m.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How to use this guide + Your why — same real walkthrough + reflection as Classic */}
      <section style={{ background: PALETTE.gold1, padding: '4rem 1.5rem', ...hiddenStyle('howto') }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Eyebrow>Getting oriented</Eyebrow>
          <SecTitle icon={<HelpCircle size={26} />}>How To Use This Guide</SecTitle>
          <p style={{ marginTop: 16, marginBottom: 20, fontSize: '0.95rem', lineHeight: 1.6 }}>This page is built to be opened often, not read once and forgotten. Here&apos;s where everything lives:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { title: 'Your roadmap', text: 'Tap a month, then a week, to see that week’s goals. Tap a meal slot to see the recipes picked for you.' },
              { title: 'Check off as you go', text: 'Tap a goal each day you actually do it. It’s tracked under “Track your progress” below, so ' + coachFirst + ' can see real adherence before your next session, not a guess.' },
              { title: 'Recipes update as you go', text: 'Matched to your notes and diet. If one looks off or missing, tell ' + coachFirst + ' rather than skipping it.' },
              { title: 'Supplements, if any', text: 'A supplement table only shows up here once ' + coachFirst + ' has reviewed and confirmed it. If that section is empty, none is prescribed yet.' },
              { title: 'When in doubt, ask', text: 'If anything here feels unclear or off, reach ' + coachFirst + ' before improvising, that’s exactly what they’re there for.' },
            ].map(({ title, text }) => (
              <div key={title}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: '0.88rem', opacity: 0.75, lineHeight: 1.55 }}>{text}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${PALETTE.line}` }}>
            <Eyebrow>Your why</Eyebrow>
            {data.whyReflection ? (
              <p style={{ fontSize: '0.95rem', lineHeight: 1.65 }}>{firstName}, from what you shared with us: {renderMarkdownBold(data.whyReflection)}</p>
            ) : (
              <p style={{ fontSize: '0.9rem', opacity: 0.6 }}>Not filled in yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* Lifestyle guidelines */}
      {lifestyleBullets.length > 0 && (
        <section style={{ background: PALETTE.gold1, padding: '4rem 1.5rem', ...hiddenStyle('lifestyle') }}>
          <div style={{ maxWidth: 920, margin: '0 auto' }}>
            <Eyebrow>Every day</Eyebrow>
            <SecTitle icon={<HeartPulse size={26} />}>Lifestyle Guidelines</SecTitle>
            <KVGrid items={lifestyleBullets} />
          </div>
        </section>
      )}

      {/* Diet protocol — tied to the 'nutrition' toggle (same key as Power
          Plates below) since Classic/PDF don't have a separate section for
          this content to hide independently. */}
      {parsed.dietProtocol.length > 0 && (
        <section style={{ background: PALETTE.gold2, padding: '4rem 1.5rem', ...hiddenStyle('nutrition') }}>
          <div style={{ maxWidth: 920, margin: '0 auto' }}>
            <Eyebrow>Nutrition</Eyebrow>
            <SecTitle icon={<Utensils size={26} />}>Diet Protocol</SecTitle>
            <KVGrid items={parsed.dietProtocol} />
          </div>
        </section>
      )}

      {/* Your power plates — same static reference plate + top-matched
          recipes per meal as Classic. */}
      <section style={{ background: PALETTE.paper3, padding: '4rem 1.5rem', ...hiddenStyle('nutrition') }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Eyebrow>Building your plate</Eyebrow>
          <SecTitle icon={<Utensils size={26} />}>Your Power Plates</SecTitle>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, marginBottom: 20 }}>
            {MEAL_TYPES.map((meal) => (
              <button key={meal} data-meal-trigger={meal} onClick={() => setActiveMeal(meal)}
                style={{
                  padding: '8px 18px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, textTransform: 'capitalize',
                  border: activeMeal === meal ? 'none' : `1px solid ${PALETTE.line}`,
                  background: activeMeal === meal ? PALETTE.berry : 'transparent', color: activeMeal === meal ? '#fff' : PALETTE.ink,
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
                <div style={{ fontSize: '0.82rem', opacity: 0.65, marginBottom: 16 }}>{plate.ratios}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {plate.columns.map((col) => (
                    <div key={col.head}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: PALETTE.berry }}>{col.head}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {col.items.map((item) => (
                          <span key={item} style={{ fontSize: '0.8rem', padding: '4px 11px', borderRadius: 14, background: 'rgba(122,51,70,0.08)', border: `1px solid ${PALETTE.line}` }}>{item}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {recipes.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${PALETTE.line}` }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6 }}>Picked for {meal}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      {recipes.map((m) => (
                        <div key={m.recipe.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 10, border: `1px solid ${PALETTE.line}` }}>
                          {m.recipe.image_url ? (
                            <img src={m.recipe.image_url} alt={m.recipe.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 44, height: 44, borderRadius: 8, background: PALETTE.gold1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ChefHat size={18} color={PALETTE.ink} /></div>
                          )}
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{m.recipe.name}{m.recipe.protein_label ? ` · ${m.recipe.protein_label}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Your roadmap — real Month → Week → Recipes structure, same
          per-week curated data Classic uses (src/lib/pdf/weekRecipes.ts).
          Everything expands inline, in place, as part of the page — no
          popup dialogs. */}
      {months.length > 0 && (
        <section style={{ background: PALETTE.dusk1, padding: '4rem 1.5rem', ...hiddenStyle('roadmap') }}>
          <div style={{ maxWidth: 920, margin: '0 auto' }}>
            <Eyebrow dark>Month by month</Eyebrow>
            <SecTitle dark icon={<MapPin size={26} color={PALETTE.cream} />}>Your Roadmap</SecTitle>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 24 }}>
              {months.map((m) => (
                <button key={m.monthNumber} data-month-trigger={m.monthNumber} onClick={() => { const next = openMonth === m.monthNumber ? null : m.monthNumber; setOpenMonth(next); setOpenWeek(null); setOpenRecipeId(null) }}
                  style={{
                    padding: '9px 18px', borderRadius: 24, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.78rem', letterSpacing: '0.04em',
                    border: `1px solid ${openMonth === m.monthNumber ? PALETTE.gold1 : 'rgba(243,236,218,0.3)'}`,
                    background: openMonth === m.monthNumber ? PALETTE.gold1 : 'transparent', color: openMonth === m.monthNumber ? PALETTE.ink : PALETTE.cream,
                  }}>
                  {m.monthLabel}
                </button>
              ))}
            </div>

            {months.map((m) => (
              <div key={m.monthNumber} data-month-body={m.monthNumber} style={{ marginTop: 28, display: openMonth === m.monthNumber ? 'block' : 'none' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                  {m.weeks.map((w) => (
                    <button key={w.week_number} data-week-trigger={w.week_number} onClick={() => { const next = openWeek === w.week_number ? null : w.week_number; setOpenWeek(next); setOpenRecipeId(null) }}
                      style={{
                        textAlign: 'left', padding: '12px 16px', borderRadius: 10, cursor: 'pointer', minWidth: 150,
                        border: `1px solid ${openWeek === w.week_number ? PALETTE.gold1 : 'rgba(243,236,218,0.22)'}`,
                        background: openWeek === w.week_number ? 'rgba(224,195,132,0.14)' : 'rgba(243,236,218,0.05)',
                      }}>
                      <div style={{ color: PALETTE.gold1, fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', letterSpacing: '0.05em' }}>Week {w.week_number}</div>
                      <div style={{ color: PALETTE.cream, fontSize: '0.85rem', marginTop: 3 }}>{w.focus_theme}</div>
                    </button>
                  ))}
                </div>

                {m.weeks.map((w) => (
                  <div key={w.week_number} data-week-body={w.week_number} style={{ display: openWeek === w.week_number ? 'block' : 'none', borderTop: '1px solid rgba(243,236,218,0.18)', paddingTop: 24 }}>
                    {(w.actions?.length ?? 0) > 0 && (
                      <div style={{ marginBottom: 28 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: PALETTE.gold1, opacity: 0.85 }}>This week&apos;s goals, tap one you&apos;ve done today</span>
                        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                          {(w.actions ?? []).map((action, ai) => {
                            const checked = checkedSet.has(`${w.week_number}:${ai}:${today}`)
                            return (
                              <li key={ai} data-goal-toggle={`${w.week_number}:${ai}`} onClick={() => toggleGoal(w.week_number, ai)}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 8, padding: '2px 0' }}>
                                <span data-goal-icon-done style={{ display: checked ? 'inline-flex' : 'none', flexShrink: 0, marginTop: 2 }}><CheckCircle2 size={16} color={PALETTE.gold1} /></span>
                                <span data-goal-icon-undone style={{ display: checked ? 'none' : 'inline-flex', flexShrink: 0, marginTop: 2 }}><Circle size={16} color={PALETTE.cream} opacity={0.5} /></span>
                                <span data-goal-text style={{ color: PALETTE.cream, opacity: checked ? 0.55 : 0.9, fontSize: '0.92rem', lineHeight: 1.6, textDecoration: checked ? 'line-through' : 'none' }}>{action}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    {getSlotRecipes(w.week_number, DAY_MEAL_SLOTS, data.weeklyManualRecipes, data.manualRecipes, weekMealMatches, data.recipeBank, 'Picked for your plan.')
                      .filter(({ matches }) => matches.length > 0)
                      .map(({ slot, matches }) => (
                        <div key={slot} style={{ marginBottom: 26 }}>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: PALETTE.gold1, opacity: 0.85 }}>{SLOT_LABELS[slot]}</span>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginTop: 10 }}>
                            {matches.map(({ recipe }) => {
                              const recipeKey = `${w.week_number}-${slot}-${recipe.id}`
                              return (
                              <button key={recipeKey} data-recipe-trigger={recipeKey} onClick={() => setOpenRecipeId(openRecipeId === recipeKey ? null : recipeKey)}
                                style={{ textAlign: 'left', padding: 0, cursor: 'pointer', background: openRecipeId === recipeKey ? 'rgba(224,195,132,0.16)' : 'rgba(243,236,218,0.08)', border: `1px solid ${openRecipeId === recipeKey ? PALETTE.gold1 : 'rgba(243,236,218,0.22)'}`, borderRadius: 12, overflow: 'hidden' }}>
                                {recipe.image_url ? (
                                  <img src={recipe.image_url} alt={recipe.name} style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                                ) : (
                                  <div style={{ width: '100%', height: 100, background: 'rgba(243,236,218,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ChefHat size={20} color={PALETTE.cream} opacity={0.5} />
                                  </div>
                                )}
                                <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                  <span style={{ color: PALETTE.cream, fontSize: '0.85rem', fontWeight: 600 }}>{recipe.name}</span>
                                  {openRecipeId === recipeKey ? <ChevronDown size={14} color={PALETTE.gold1} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} color={PALETTE.cream} opacity={0.5} style={{ flexShrink: 0 }} />}
                                </div>
                              </button>
                              )
                            })}
                          </div>

                          {/* Recipe detail — expands inline, right under the
                              slot it belongs to, as part of the page rather
                              than a floating popup. Every match's detail is
                              always mounted (just hidden) so a downloaded
                              copy of this page has every recipe available,
                              not just whichever one happened to be open. */}
                          {matches.map(({ recipe }) => {
                            const recipeKey = `${w.week_number}-${slot}-${recipe.id}`
                            return (
                            <div key={recipeKey} data-recipe-body={recipeKey} style={{ display: openRecipeId === recipeKey ? 'block' : 'none', marginTop: 14, background: 'rgba(243,236,218,0.06)', border: `1px solid ${PALETTE.gold1}`, borderRadius: 14, padding: '1.75rem', position: 'relative' }}>
                              <button onClick={() => setOpenRecipeId(null)} data-no-export style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: PALETTE.cream, opacity: 0.6 }}><X size={18} /></button>
                              <div style={{ display: 'grid', gridTemplateColumns: recipe.image_url ? '1fr 1.3fr' : '1fr', gap: 24 }}>
                                {recipe.image_url && <img src={recipe.image_url} alt={recipe.name} style={{ width: '100%', borderRadius: 10, objectFit: 'cover', maxHeight: 320 }} />}
                                <div>
                                  {recipe.protein_label && <Eyebrow dark>{recipe.protein_label}</Eyebrow>}
                                  <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: '1.4rem', color: PALETTE.cream, margin: '0 0 16px' }}>{recipe.name}</h3>
                                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: PALETTE.gold1 }}>Ingredients</span>
                                  <ul style={{ listStyle: 'none', margin: '8px 0 16px', padding: 0 }}>
                                    {splitRecipeLines(recipe.ingredients).map((line, i) => (
                                      <li key={i} style={{ color: PALETTE.cream, opacity: 0.9, fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 4 }}>{line}</li>
                                    ))}
                                  </ul>
                                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: PALETTE.gold1 }}>Directions</span>
                                  <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                                    {splitRecipeLines(recipe.steps).map((line, i) => (
                                      <li key={i} style={{ color: PALETTE.cream, opacity: 0.9, fontSize: '0.88rem', lineHeight: 1.65, marginBottom: 6 }}>{line}</li>
                                    ))}
                                  </ol>
                                  {recipe.benefits && recipe.benefits.length > 0 && (
                                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(243,236,218,0.18)' }}>
                                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: PALETTE.gold1 }}>Why it works</span>
                                      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                                        {recipe.benefits.map((b, i) => <li key={i} style={{ color: PALETTE.cream, opacity: 0.9, fontSize: '0.86rem', lineHeight: 1.55, marginBottom: 4 }}>{b}</li>)}
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
          </div>
        </section>
      )}

      {/* Superfood of the week — same generic-but-real copy as Classic (no
          per-week superfood data exists to show specifics beyond this). */}
      <section style={{ background: PALETTE.gold2, padding: '4rem 1.5rem', ...hiddenStyle('superfood') }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Eyebrow>Fresh each week</Eyebrow>
          <SecTitle icon={<Sparkles size={26} />}>Superfood Of The Week</SecTitle>
          {superfoodImage && <img src={superfoodImage.image_url} alt={superfoodImage.label} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12, margin: '20px 0' }} />}
          <p style={{ fontSize: '0.95rem', lineHeight: 1.6, marginTop: superfoodImage ? 0 : 20 }}>{coachFirst} picks this fresh each week around what&apos;s in season and what&apos;s actually useful for where you are right now, rather than a fixed pick that goes stale.</p>
          <p style={{ fontSize: '0.85rem', opacity: 0.65, marginTop: 8 }}>You&apos;ll get this alongside your recipes each week, with a short note on why it was chosen for you specifically.</p>
        </div>
      </section>

      {/* Supplements */}
      {data.confirmedSupplements.length > 0 && (
        <section style={{ background: PALETTE.dusk2, padding: '4rem 1.5rem', ...hiddenStyle('supplements') }}>
          <div style={{ maxWidth: 920, margin: '0 auto' }}>
            <Eyebrow dark>Confirmed by {coachFirst}</Eyebrow>
            <SecTitle dark icon={<Pill size={26} color={PALETTE.cream} />}>Your Supplement Plan</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 20 }}>
              {data.confirmedSupplements.map((s, i) => (
                <div key={i} style={{ background: 'rgba(243,236,218,0.06)', border: '1px solid rgba(243,236,218,0.22)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ color: PALETTE.cream, fontWeight: 600, fontSize: '0.95rem' }}>{s.name}</div>
                  <div style={{ color: PALETTE.cream, opacity: 0.75, fontSize: '0.85rem', marginTop: 4 }}>{[s.dose, s.timing, s.duration].filter(Boolean).join(' · ')}</div>
                  {s.notes && <div style={{ color: PALETTE.gold1, fontSize: '0.8rem', marginTop: 6 }}>⚠ {s.notes}</div>}
                </div>
              ))}
            </div>
            <div style={{ color: PALETTE.cream, opacity: 0.5, fontSize: '0.78rem', marginTop: 16 }}>Don&apos;t start, stop, or change a dose without confirming with {coachFirst} first.</div>
          </div>
        </section>
      )}

      {/* Shopping list — same recipe-derived, categorized ingredients as
          Classic (src/lib/groceryList.ts), broken out per week; expands
          inline instead of a popup. */}
      <section style={{ background: PALETTE.paper2, padding: '4rem 1.5rem', ...hiddenStyle('grocery') }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Eyebrow>What to buy</Eyebrow>
          <SecTitle icon={<ShoppingCart size={26} />}>Your Shopping List</SecTitle>
          <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: 16, marginBottom: 20 }}>Pulled straight from the ingredients of your matched recipes. Pick a week below to see it.</p>
          {months.length === 0 ? (
            <p style={{ fontSize: '0.9rem', opacity: 0.6 }}>Not planned yet, check back once your coach generates your roadmap.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {months.map((m) => (
                  <button key={m.monthNumber} data-grocery-month-trigger={m.monthNumber} onClick={() => { const next = openGroceryMonth === m.monthNumber ? null : m.monthNumber; setOpenGroceryMonth(next); setOpenGroceryWeek(null) }}
                    style={{
                      padding: '9px 18px', borderRadius: 24, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.78rem',
                      border: `1px solid ${openGroceryMonth === m.monthNumber ? PALETTE.berry : PALETTE.line}`,
                      background: openGroceryMonth === m.monthNumber ? PALETTE.berry : 'transparent', color: openGroceryMonth === m.monthNumber ? '#fff' : PALETTE.ink,
                    }}>
                    {m.monthLabel}
                  </button>
                ))}
              </div>
              {months.map((m) => (
                <div key={m.monthNumber} data-grocery-month-body={m.monthNumber} style={{ marginTop: 20, display: openGroceryMonth === m.monthNumber ? 'block' : 'none' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                    {m.weeks.map((w) => (
                      <button key={w.week_number} data-grocery-week-trigger={w.week_number} onClick={() => setOpenGroceryWeek(openGroceryWeek === w.week_number ? null : w.week_number)}
                        style={{
                          padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                          border: `1px solid ${openGroceryWeek === w.week_number ? PALETTE.berry : PALETTE.line}`,
                          background: openGroceryWeek === w.week_number ? 'rgba(122,51,70,0.08)' : 'transparent',
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
                      <div key={w.week_number} data-grocery-week-body={w.week_number} style={{ display: openGroceryWeek === w.week_number ? 'grid' : 'none', borderTop: `1px solid ${PALETTE.line}`, paddingTop: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
                        {finalCats.map((cat) => (
                          <div key={cat.head}>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: PALETTE.berry }}>{cat.head}</span>
                            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                              {cat.items.map((item) => {
                                const itemKey = `${w.week_number}:${cat.head}:${item}`
                                const bought = boughtItems.has(itemKey)
                                return (
                                  <li key={item} data-grocery-item={itemKey} onClick={() => toggleBought(itemKey)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', opacity: bought ? 0.45 : 0.8, padding: '3px 0', cursor: 'pointer' }}>
                                    <span data-grocery-icon-done style={{ display: bought ? 'inline-flex' : 'none', flexShrink: 0 }}><CheckCircle2 size={13} color={PALETTE.berry} /></span>
                                    <span data-grocery-icon-undone style={{ display: bought ? 'none' : 'inline-flex', flexShrink: 0 }}><Circle size={13} opacity={0.5} /></span>
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
        </div>
      </section>

      {/* What's included in your care — same coach-entered tiles as
          Classic; expands inline instead of a popup. */}
      {data.careServices.length > 0 && (
        <section style={{ background: PALETTE.paper3, padding: '4rem 1.5rem', ...hiddenStyle('services') }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <Eyebrow>Your plan</Eyebrow>
            <SecTitle icon={<Star size={26} />}>What&apos;s Included In Your Care</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 20 }}>
              {data.careServices.map((svc, i) => {
                const Icon = CARE_ICON_MAP[svc.icon] || Star
                const isOpen = openService === i
                return (
                  <button key={i} data-care-trigger={i} onClick={() => setOpenService(isOpen ? null : i)}
                    style={{ textAlign: 'left', padding: '14px 12px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${isOpen ? PALETTE.berry : PALETTE.line}`, background: isOpen ? 'rgba(122,51,70,0.06)' : 'rgba(255,255,255,0.35)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: PALETTE.gold1, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                      <Icon size={16} color={PALETTE.ink} />
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{svc.name}</div>
                    {svc.sessions && <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: 2 }}>{svc.sessions}</div>}
                  </button>
                )
              })}
            </div>
            {data.careServices.map((svc, i) => svc.description && (
              <div key={i} data-care-body={i} style={{ display: openService === i ? 'block' : 'none', marginTop: 16, padding: '16px 18px', borderRadius: 10, border: `1px solid ${PALETTE.line}`, background: 'rgba(255,255,255,0.35)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>{svc.name}</div>
                <p style={{ fontSize: '0.87rem', lineHeight: 1.55, margin: 0 }}>{renderMarkdownBold(svc.description || '')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Track your progress — same real check-in-derived stats as Classic */}
      <section style={{ background: PALETTE.gold1, padding: '4rem 1.5rem', ...hiddenStyle('track') }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Eyebrow>Real numbers, not a guess</Eyebrow>
          <SecTitle icon={<CheckCircle2 size={26} />}>Track Your Progress</SecTitle>
          <p data-track-empty style={{ fontSize: '0.9rem', opacity: 0.65, marginTop: 16, display: progress.totalDaysLogged === 0 ? 'block' : 'none' }}>No check-ins logged yet, tap a goal in your roadmap above each day you complete it, and your progress will show up here.</p>
          <div data-track-content style={{ display: progress.totalDaysLogged === 0 ? 'none' : 'block' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20, marginBottom: 24 }}>
              {[
                { key: 'streak', icon: <Flame size={14} />, value: progress.streak, label: 'day streak' },
                { key: 'days', icon: <CalendarCheck size={14} />, value: progress.totalDaysLogged, label: 'days logged, total' },
                { key: 'goals', icon: <Target size={14} />, value: `${goalsDone}/${totalActionsInPlan}`, label: 'goals accomplished' },
                { key: 'best', icon: <TrendingUp size={14} />, value: progress.bestMonth ? `${progress.bestMonth.pct}%` : '0%', label: progress.bestMonth ? `best month · ${progress.bestMonth.monthLabel}` : 'best month' },
              ].map((s) => (
                <div key={s.key} style={{ flex: '1 1 130px', padding: '12px 14px', borderRadius: 10, border: `1px solid ${PALETTE.line}`, background: 'rgba(255,255,255,0.35)' }}>
                  <span style={{ color: PALETTE.berry }}>{s.icon}</span>
                  <div data-stat={s.key} style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 8 }}>{s.value}</div>
                  <div data-stat-label={s.key} style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6 }}>Goals completed by month</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 12 }}>
              {progress.monthStats.map((m) => (
                <div key={m.monthNumber} style={{ textAlign: 'center' }}>
                  <div data-stat-pct={m.monthNumber} style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: "'Fraunces', serif", color: m.pct >= 70 ? PALETTE.berry : PALETTE.ink }}>{m.pct}%</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: 2 }}>{m.monthLabel}</div>
                  <div data-stat-sub={m.monthNumber} style={{ fontSize: '0.72rem', opacity: 0.55 }}>{m.doneActions}/{m.totalActions} goals</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* When to reach us / next appointment */}
      <section style={{ background: PALETTE.night1, padding: '4rem 1.5rem', ...hiddenStyle('reach') }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <Eyebrow dark>Reach us</Eyebrow>
          <SecTitle dark icon={<Phone size={26} color={PALETTE.cream} />}>When To Reach Us</SecTitle>
          {data.nextAppointment.date ? (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: PALETTE.gold1, fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', marginBottom: 14 }}>
                <CalendarCheck size={16} />
                {new Date(data.nextAppointment.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {data.nextAppointment.time && ` · ${new Date(`2000-01-01T${data.nextAppointment.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                {data.nextAppointment.mode && ` · ${data.nextAppointment.mode}`}
              </div>
              <p style={{ color: PALETTE.cream, opacity: 0.85, fontSize: '0.92rem', lineHeight: 1.6 }}>Please continue following your personalized plan as recommended. Keep track of any changes, questions, or concerns so they can be discussed during your next visit.</p>
              <p style={{ color: PALETTE.cream, opacity: 0.85, fontSize: '0.92rem', lineHeight: 1.6 }}>If you experience any unexpected or worsening symptoms, have difficulty following your plan, or are unsure about any recommendations, please contact our team before your scheduled appointment.</p>
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
              <p style={{ color: PALETTE.cream, opacity: 0.85, fontSize: '0.92rem', lineHeight: 1.6 }}>Continue following your personalized care plan as recommended.</p>
              <p style={{ color: PALETTE.cream, opacity: 0.85, fontSize: '0.92rem', lineHeight: 1.6 }}>Keep track of your progress and any questions or concerns.</p>
              <p style={{ color: PALETTE.cream, opacity: 0.85, fontSize: '0.92rem', lineHeight: 1.6 }}>In a medical emergency, seek immediate emergency medical care.</p>
              <p style={{ color: PALETTE.cream, opacity: 0.85, fontSize: '0.92rem', lineHeight: 1.6 }}>Contact our team if you need guidance or notice any unexpected changes in your health.</p>
            </div>
          )}
          {data.coach?.email && (
            <p style={{ color: PALETTE.gold1, fontSize: '0.85rem', marginTop: 14 }}>Message {coachFirst} directly at {data.coach.email}.</p>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: PALETTE.night2, padding: '4rem 1.5rem 6rem', ...hiddenStyle('faq') }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <Eyebrow dark>Questions we hear most</Eyebrow>
          <SecTitle dark icon={<HelpCircle size={26} color={PALETTE.cream} />}>FAQ</SecTitle>
          <div style={{ marginTop: 20 }}>
            {[
              ['What if I can’t finish everything on my plate exactly as shown?', 'Getting the food groups roughly right matters far more than hitting exact portions.'],
              ['What if I miss a few days on my habit tracker?', 'Log what actually happened, not what you wish had happened. An honest gap tells your coach more than a perfect-looking week.'],
              ['Can I eat something that’s not on the lists?', 'Yes, the lists are what to lean on, not a ban on everything else. Ask your coach if unsure.'],
            ].map(([q, a], i) => {
              const isOpen = openFaq === i
              return (
                <div key={i} style={{ borderBottom: i < 2 ? '1px solid rgba(243,236,218,0.18)' : 'none' }}>
                  <button data-faq-trigger={i} onClick={() => setOpenFaq(isOpen ? null : i)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ color: PALETTE.cream, fontWeight: 600, fontSize: '0.95rem' }}>{q}</span>
                    {isOpen ? <ChevronDown size={16} color={PALETTE.gold1} style={{ flexShrink: 0 }} /> : <ChevronRight size={16} color={PALETTE.cream} opacity={0.5} style={{ flexShrink: 0 }} />}
                  </button>
                  <div data-faq-body={i} style={{ display: isOpen ? 'block' : 'none', color: PALETTE.cream, opacity: 0.65, fontSize: '0.88rem', paddingBottom: 16 }}>{a}</div>
                </div>
              )
            })}
          </div>
          <div style={{ color: PALETTE.cream, opacity: 0.4, fontSize: '0.75rem', marginTop: 40, fontFamily: "'IBM Plex Mono', monospace" }}>Clinic Living Plus Pvt Ltd™</div>
        </div>
      </section>
    </div>
  )
}
