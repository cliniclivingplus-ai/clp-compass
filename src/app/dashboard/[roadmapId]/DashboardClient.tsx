'use client'
import { useState, useMemo, useEffect, Fragment, type ReactNode } from 'react'
import { CheckCircle2, Circle, MapPin, Utensils, Pill, ShoppingCart, HeartPulse, HelpCircle, Phone, X, ChefHat, Download, Sparkles, Star, Save, Check, Loader2, ExternalLink, Flame, CalendarCheck, Target, TrendingUp, ChevronDown, ChevronRight, Video, MessageCircle, Users, Activity, Stethoscope, Plus, Trash2, Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { reshapeRoadmapIntoMonths, type WeeklyPlan } from '@/lib/pdf/reshapeRoadmap'
import { parseNutritionistGuidelines } from '@/lib/pdf/parseNutritionistGuidelines'
import { matchGuideImageDistinct } from '@/lib/pdf/matchGuideImage'
import { selectRecipesForPatient, type RecipeMatch } from '@/lib/pdf/matchRecipes'
import { curatedSlotIds as sharedCuratedSlotIds, getSlotRecipes as sharedGetSlotRecipes } from '@/lib/pdf/weekRecipes'
import type { GuideData, DayMealSlot } from '@/lib/pdf/ClientGuideDocument'
import { splitRecipeLines } from '@/lib/recipeText'
import { renderMarkdownBold } from '@/lib/renderMarkdownBold'
import { FOOD_PLATES, GROCERY_CATEGORIES, type MealType } from '@/lib/foodPlates'
import { buildGroceryList, type GroceryCategory } from '@/lib/groceryList'

// Every color used anywhere in this file is one of these 10 tokens — so
// theming is just swapping which literal hex values `--clp-*` resolves to
// (in the <style> tag rendered at the top of #dashboard-export-root), not a
// refactor of the ~200 call sites below. Since the exported static HTML is a
// clone of this same DOM, the chosen palette carries over automatically.
const C = {
  bg: 'var(--clp-bg)', paper: 'var(--clp-paper)', ink: 'var(--clp-ink)', inkSoft: 'var(--clp-ink-soft)',
  accent: 'var(--clp-accent)', accentSoft: 'var(--clp-accent-soft)', rule: 'var(--clp-rule)', muted: 'var(--clp-muted)',
  green: 'var(--clp-green)', greenDeep: 'var(--clp-green-deep)',
}
type PaletteTokens = {
  bg: string; paper: string; ink: string; inkSoft: string
  accent: string; accentSoft: string; rule: string; muted: string; green: string; greenDeep: string
}
// A handful of coach-selectable looks — "green"/"greenDeep" stay in a green
// family across every palette (used for done/success states throughout, so
// swapping them would make checkmarks read wrong), while "accent" carries
// each palette's actual personality.
const PALETTES: Record<string, PaletteTokens> = {
  classic: {
    bg: '#F7EEE1', paper: '#FBF5EA', ink: '#2C2418', inkSoft: '#4A4034',
    accent: '#B1512E', accentSoft: '#E7DAC0', rule: '#D8C6A4', muted: '#948A76', green: '#538A22', greenDeep: '#2F5214',
  },
  sage: {
    bg: '#F7F3EA', paper: '#FFFFFF', ink: '#2B2B28', inkSoft: '#4F5A4A',
    accent: '#C17A52', accentSoft: '#F3E2D3', rule: '#E4DDCD', muted: '#6B6A63', green: '#4F6F52', greenDeep: '#2E4530',
  },
  ocean: {
    bg: '#EFF5F3', paper: '#FFFFFF', ink: '#1F2E2B', inkSoft: '#3F5450',
    accent: '#2F6E73', accentSoft: '#D9EDEE', rule: '#CFE3E1', muted: '#6D8481', green: '#3F7D4A', greenDeep: '#265130',
  },
  berry: {
    bg: '#FBF1EE', paper: '#FFFFFF', ink: '#2B2220', inkSoft: '#5C453F',
    accent: '#8C4B5A', accentSoft: '#F1DCE0', rule: '#E8D3CC', muted: '#8F7A75', green: '#4C7A4F', greenDeep: '#2C4A2E',
  },
}
const PALETTE_LIST: { id: string; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'sage', label: 'Sage' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'berry', label: 'Berry' },
]
// One color per food-group slot in a meal plate — cycled by index, matches
// across the wheel diagram and its pill chips so a category reads the same
// color in both places.
const CATEGORY_COLORS = ['#C1483D', '#D98A2B', '#8A7B1F', '#3E7CB1']

type Checkin = { week_number: number; action_index: number; checkin_date: string }

const cardStyle = { background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '20px 22px', marginBottom: 18 }
const sectionTitleStyle = { display: 'flex', alignItems: 'center', gap: 9, fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 14 }
const bulletStyle = { fontSize: 13.5, color: C.ink, lineHeight: 1.6, margin: '0 0 8px' }
const editInputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.rule}`,
  fontSize: 13.5, color: C.ink, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' as const,
}
const editLabelStyle = { fontSize: 10, color: C.muted, marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: '0.04em', fontWeight: 700 }
const weekBoxLabel = { fontSize: 10.5, fontWeight: 700, color: C.accent, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }

function parseBullets(text: string): string[] {
  return (text || '')
    .split(/\n|(?=•)/)
    .map((s) => s.replace(/^[•\-\s]+/, '').trim())
    .filter(Boolean)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Pure UTC date-string arithmetic — todayISO() is UTC-based, so walking the
// streak backwards must stay in UTC too. Mixing this with local-time Date
// methods (setDate/getDate) silently shifts by a day in any timezone ahead
// of UTC (e.g. IST, UTC+5:30), which is exactly the kind of off-by-one that
// looks fine in testing and wrong for every real user.
function shiftDateISO(dateISO: string, deltaDays: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function asPhrase(sentence: string): string {
  return sentence.trim().replace(/\.+$/, '')
}

// Mirrors the PDF's table of contents exactly — same 15 sections, same
// order, same labels. "Nutrition guidelines" and "This week's recipes" both
// point at the power-plates card since that's where the PDF's separate
// nutrition and recipe pages collapse into one tabbed section here.
// Sunday through Saturday show the week's goals (same content every day —
// the goals themselves aren't tracked per calendar day in this app's data
// model). Recipes are a separate, single section per week — 4 slots
// matching the recipe bank's own categories directly, not per-day.
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_MEAL_SLOTS: DayMealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']
const SLOT_LABELS: Record<DayMealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', dessert: 'Desserts' }

// A small fixed set of icons a coach can pick from for a "what's included in
// your care" tile — not free-form (keeps every tile visually consistent),
// but broad enough to cover the common service types a coaching plan has.
const CARE_ICON_OPTIONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'coaching', label: 'Coaching session', Icon: Star },
  { key: 'video', label: 'Video call', Icon: Video },
  { key: 'phone', label: 'Phone call', Icon: Phone },
  { key: 'chat', label: 'Chat support', Icon: MessageCircle },
  { key: 'nutrition', label: 'Nutrition plan', Icon: Utensils },
  { key: 'labs', label: 'Labs / reports', Icon: Activity },
  { key: 'wellness', label: 'Wellness check-in', Icon: HeartPulse },
  { key: 'clinical', label: 'Clinical review', Icon: Stethoscope },
  { key: 'group', label: 'Group session', Icon: Users },
  { key: 'followup', label: 'Follow-up', Icon: CalendarCheck },
]
const CARE_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(CARE_ICON_OPTIONS.map((o) => [o.key, o.Icon]))

// Small pill a coach clicks to hide/show a whole section for this patient —
// hiding it removes it from the live page, the downloaded static HTML, and
// the PDF (see hiddenSections in GuideData / ClientGuideDocument.tsx) all at
// once, since all three read the same saved guide_overrides.hidden_sections.
function SectionToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} data-no-export
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '5px 10px',
        borderRadius: 20, border: `1px solid ${hidden ? C.accent : C.rule}`, background: hidden ? C.accentSoft : 'transparent',
        color: hidden ? C.accent : C.muted, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
      }}>
      {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
      {hidden ? 'Hidden from patient, click to show' : 'Visible to patient, click to hide'}
    </button>
  )
}

const TOC_ITEMS: { label: string; id: string }[] = [
  { label: 'Founder’s note', id: 'founder' },
  { label: 'Meet your coach', id: 'coach' },
  { label: 'Your care team', id: 'careteam' },
  { label: 'How to use this guide', id: 'howto' },
  { label: 'Your why', id: 'why' },
  { label: 'Your roadmap', id: 'roadmap' },
  { label: 'Lifestyle guidelines', id: 'lifestyle' },
  { label: 'Nutrition guidelines', id: 'nutrition' },
  { label: 'This week’s recipes', id: 'nutrition' },
  { label: 'Superfood of the week', id: 'superfood' },
  { label: 'Grocery list', id: 'grocery' },
  { label: 'Supplements', id: 'supplements' },
  { label: 'Services', id: 'services' },
  { label: 'Track your progress', id: 'track' },
  { label: 'When to reach us', id: 'reach' },
  { label: 'FAQ', id: 'faq' },
]
// Sticky site header (layout.tsx) is 60px + this TOC bar is ~46px — anchored
// sections need enough scroll-margin to clear both when jumped to, or the
// section title lands hidden underneath them.
const SECTION_SCROLL_MARGIN = 112

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}
function describeSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

// A simple equal-slice wheel (not proportional to the actual ratios — those
// are printed as text alongside it) that visually anchors "this meal = these
// food groups, in one glance," matching the plate-diagram style coaches asked
// for as more engaging than a plain bulleted list.
function MealWheel({ categories, label }: { categories: string[]; label: string }) {
  const cx = 100, cy = 100, r = 90
  const n = categories.length
  return (
    <svg width={200} height={200} viewBox="0 0 200 200" style={{ flexShrink: 0 }}>
      {categories.map((cat, i) => (
        <path key={cat} d={describeSlice(cx, cy, r, (360 / n) * i, (360 / n) * (i + 1))} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
      ))}
      <circle cx={cx} cy={cy} r={38} fill={C.paper} stroke={C.rule} strokeWidth={1} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={9} fontWeight={700} fill={C.ink}>POWER</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize={9} fontWeight={700} fill={C.ink}>PLATE</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize={8} fill={C.muted}>{label}</text>
    </svg>
  )
}

const factRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.rule}`, fontSize: 12.5 }
// Purely decorative, cycled by index — not tied to any specific ingredient's
// meaning (that would mean guessing/fabricating a "correct" icon per food).
const BENEFIT_ICONS = [Sparkles, HeartPulse, Flame, Star, Target, TrendingUp]

const FRACTION_CHARS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 }
const FRACTION_SNAP: [number, string][] = [[0.125, '⅛'], [0.2, '⅕'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.4, '⅖'], [0.5, '½'], [0.6, '⅗'], [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.8, '⅘'], [0.875, '⅞']]

// Formats a scaled quantity back to a friendly form — snapping to a common
// cooking fraction when the scaled value lands close to one (½, ¼, etc.),
// otherwise a plain rounded number. Never introduces a value that wasn't
// already a real multiple of what was written in the recipe.
function formatScaledNumber(n: number): string {
  const whole = Math.floor(n + 1e-6)
  const frac = n - whole
  for (const [val, char] of FRACTION_SNAP) {
    if (Math.abs(frac - val) < 0.02) return whole > 0 ? `${whole} ${char}` : char
  }
  if (Math.abs(frac) < 0.02) return String(whole)
  const rounded = Math.round(n * 100) / 100
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

// Scales every numeric quantity actually written in an ingredient line (a
// plain integer, decimal, "1/2"-style fraction, "1 1/2" mixed number, or a
// unicode fraction character) by `ratio` — real arithmetic on the real
// number the coach entered, never an invented quantity. Non-numeric amounts
// ("a pinch of", "to taste") are left untouched, same as a person scaling a
// recipe by hand would leave them.
function scaleIngredientLine(line: string, ratio: number): string {
  if (ratio === 1) return line
  const pattern = /\d+\s+\d+\/\d+|\d+\/\d+|\d+\.\d+|\d+|[¼½¾⅓⅔⅕⅖⅗⅘⅛⅜⅝⅞]/g
  return line.replace(pattern, (token) => {
    let value: number
    if (FRACTION_CHARS[token] !== undefined) value = FRACTION_CHARS[token]
    else if (token.includes(' ')) { const [w, f] = token.split(/\s+/); const [n, d] = f.split('/'); value = Number(w) + Number(n) / Number(d) }
    else if (token.includes('/')) { const [n, d] = token.split('/'); value = Number(n) / Number(d) }
    else value = Number(token)
    return formatScaledNumber(value * ratio)
  })
}

// Parses the leading number out of a free-text servings note ("1 serving",
// "Serves 4", "multiple servings") to use as the base a scaled count
// multiplies against. Falls back to 1 (no note, or no number in it) rather
// than guessing.
function parseServingsBase(servings: string | null | undefined): number {
  const m = (servings || '').match(/\d+/)
  return m ? Math.max(1, parseInt(m[0], 10)) : 1
}

// Styled after the richer recipe-card reference the coach liked — a 3-block
// layout (facts panel / directions / ingredients) with hero image, numbered
// ingredients, and a connected step timeline. Only fields this app actually
// stores render: Total Steps is real (steps.length); Eat/Prep/Cook
// Time, Difficulty, Health Score, Tools, Notes, and Why It Works only show up
// when a coach actually entered them (e.g. from a Canva recipe card) — never
// invented. The servings stepper scales the real numbers already written in
// each ingredient line rather than showing a number with no real effect.
function RecipeBody({ recipe, imageUrl }: { recipe: RecipeMatch['recipe']; imageUrl: string | null }) {
  const ingredients = splitRecipeLines(recipe.ingredients)
  const steps = splitRecipeLines(recipe.steps)
  const tools = recipe.tools ?? []
  const notes = recipe.notes ?? []
  const benefits = recipe.benefits ?? []
  const base = parseServingsBase(recipe.servings)
  const [servingsCount, setServingsCount] = useState(base)
  const ratio = servingsCount / base
  const facts: [string, string][] = [
    ...(recipe.eat_time ? [['Eat time', recipe.eat_time] as [string, string]] : []),
    ...(recipe.prep_time ? [['Prep time', recipe.prep_time] as [string, string]] : []),
    ...(recipe.cook_time ? [['Cook time', recipe.cook_time] as [string, string]] : []),
    ...(recipe.difficulty ? [['Difficulty', recipe.difficulty] as [string, string]] : []),
    ...(recipe.health_score ? [['Health score', recipe.health_score] as [string, string]] : []),
  ]

  return (
  <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 24, alignItems: 'start' }}>
      <div>
        {imageUrl ? (
          <img src={imageUrl} alt={recipe.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 14, marginBottom: 14 }} />
        ) : (
          <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 14, marginBottom: 14, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChefHat size={36} color={C.accent} />
          </div>
        )}
        <div>
          {facts.map(([label, val]) => (
            <div key={label} style={factRow}>
              <span style={{ color: C.muted, fontWeight: 500 }}>{label}</span>
              <span style={{ fontWeight: 700, color: C.ink }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        {recipe.protein_label && (
          <div style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 700, color: C.green, background: `color-mix(in srgb, ${C.green} 15%, transparent)`, borderRadius: 20, padding: '4px 10px', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{recipe.protein_label}</div>
        )}
        <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, paddingRight: 28, marginBottom: 20, lineHeight: 1.15 }}>{recipe.name}</div>

        {tools.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={weekBoxLabel}>Tools &amp; equipment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
              {tools.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.ink }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.accentSoft, color: C.accent, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                  {t}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: notes.length ? 20 : 0 }}>
          <div style={weekBoxLabel}>Directions</div>
          <div>
            {steps.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: i < steps.length - 1 ? 18 : 0 }}>
                {i < steps.length - 1 && <div style={{ position: 'absolute', left: 12, top: 26, bottom: 0, width: 1.5, background: C.rule }} />}
                <div style={{ width: 25, height: 25, borderRadius: '50%', background: C.accent, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, paddingTop: 3 }}>{line}</div>
              </div>
            ))}
          </div>
        </div>

        {notes.length > 0 && (
          <div>
            <div style={weekBoxLabel}>Notes</div>
            {notes.map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: C.inkSoft, padding: '4px 0', lineHeight: 1.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, marginTop: 6, flexShrink: 0 }} />
                {n}
              </div>
            ))}
          </div>
        )}
      </div>

      <div data-ing-list={recipe.id} data-ing-base={base}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ ...weekBoxLabel, marginBottom: 0 }}>Servings</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button data-serve-dec={recipe.id} onClick={() => setServingsCount((c) => Math.max(1, c - 1))}
              style={{ width: 24, height: 24, borderRadius: '50%', border: `1px solid ${C.rule}`, background: C.bg, color: C.ink, fontSize: 15, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
            <span data-serve-count={recipe.id} style={{ fontWeight: 700, color: C.ink, minWidth: 14, textAlign: 'center' }}>{servingsCount}</span>
            <button data-serve-inc={recipe.id} onClick={() => setServingsCount((c) => Math.min(12, c + 1))}
              style={{ width: 24, height: 24, borderRadius: '50%', border: `1px solid ${C.rule}`, background: C.bg, color: C.ink, fontSize: 15, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          </div>
        </div>
        <div>
          {ingredients.map((line, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < ingredients.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: C.accentSoft, color: C.accent, fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
              <span data-ing-item={i} data-ing-raw={line} style={{ fontSize: 13, color: C.ink }}>{scaleIngredientLine(line, ratio)}</span>
            </div>
          ))}
        </div>
        {base !== 1 && <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 8 }}>Scaled from {base} servings.</div>}
      </div>
    </div>

    {benefits.length > 0 && (
      <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '18px 20px', marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ ...weekBoxLabel, marginBottom: 0 }}>Why it works</div>
          <div style={{ flex: 1, height: 1, background: C.rule }} />
        </div>
        {benefits.map((b, i) => {
          const [name, ...rest] = b.split(/\s*—\s*|\s+-\s+/)
          const desc = rest.join(', ')
          const BenefitIcon = BENEFIT_ICONS[i % BENEFIT_ICONS.length]
          return (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '11px 0', borderBottom: i < benefits.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BenefitIcon size={13} color={C.accent} />
              </div>
              <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.55 }}>
                {desc ? <><strong>{name}:</strong> {desc}</> : b}
              </div>
            </div>
          )
        })}
      </div>
    )}
  </>
  )
}

// A single "accomplish this" goal row — both icon states are always in the
// DOM (one hidden via display) rather than conditionally rendered, the same
// pattern used everywhere else in this file for exportability: the static
// download's toggleGoalExport() just flips which icon is visible and
// restyles the text, no React re-render required.
function GoalRow({ weekNumber, actionIndex, action, checked, onToggle }: {
  weekNumber: number; actionIndex: number; action: string; checked: boolean; onToggle: () => void
}) {
  return (
    <div data-goal-toggle={`${weekNumber}:${actionIndex}`} onClick={onToggle}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 7, padding: '2px 0' }}>
      <span data-goal-icon-done style={{ display: checked ? 'inline-flex' : 'none', flexShrink: 0, marginTop: 1 }}>
        <CheckCircle2 size={16} color={C.green} />
      </span>
      <span data-goal-icon-undone style={{ display: checked ? 'none' : 'inline-flex', flexShrink: 0, marginTop: 1 }}>
        <Circle size={16} color={C.muted} />
      </span>
      <span data-goal-text style={{ fontSize: 13, color: checked ? C.muted : C.ink, textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.5 }}>{action}</span>
    </div>
  )
}

// A ring-style progress indicator (plain SVG, no chart library) — used for
// "adherence this month," styled after the calorie/macro rings in the
// reference dashboard the coach liked, but always fed a real percentage
// derived from recorded check-ins, never a placeholder number.
function ProgressRing({ pct, label, sublabel, monthNumber, size = 84, stroke = 8, color = C.accent }: {
  pct: number; label: string; sublabel?: string; monthNumber?: number; size?: number; stroke?: number; color?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, pct))
  const offset = c - (clamped / 100) * c
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: size + 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.rule} strokeWidth={stroke} />
        <circle data-ring-circle={monthNumber} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text data-ring-pct={monthNumber} x="50%" y="50%" textAnchor="middle" dy="0.32em" fontSize={size * 0.22} fontWeight={700} fill={C.ink}>{Math.round(clamped)}%</text>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, textAlign: 'center' }}>{label}</div>
      {sublabel && <div data-ring-sub={monthNumber} style={{ fontSize: 10.5, color: C.muted, textAlign: 'center' }}>{sublabel}</div>}
    </div>
  )
}

function StatCard({ icon, value, label, color, dataStat, dataStatLabel }: {
  icon: ReactNode; value: string | number; label: string; color: string; dataStat?: string; dataStatLabel?: string
}) {
  return (
    <div style={{ flex: '1 1 130px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: `color-mix(in srgb, ${color} 13%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>{icon}</div>
      <div data-stat={dataStat} style={{ fontSize: 19, fontWeight: 700, color: C.ink }}>{value}</div>
      <div data-stat-label={dataStatLabel} style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{label}</div>
    </div>
  )
}

// The exported static file has no React runtime, so tab-switching and the
// recipe modal can't rely on onClick handlers or conditional rendering —
// those simply vanish when the DOM is cloned to a string. Instead every meal
// panel and every matched recipe's body is always present in the DOM (hidden
// via inline style), and both the live page and the exported file toggle
// that same display style — the live page via these React handlers, the
// export via the plain-JS equivalents injected in downloadDashboard().
type MonthExportData = { monthNumber: number; monthLabel: string; weeks: { week_number: number; totalActions: number }[] }

function buildExportScript(roadmapId: string, monthsData: MonthExportData[]): string {
  // A personal checklist for the patient's own copy of the file — never
  // synced anywhere, not visible to the coach. Every download always
  // starts this at zero (never the patient's real tracked progress), and
  // every toggle after that reads/writes a plain Checkin[] list in
  // localStorage, so "Track your progress" and the week/month tiles can be
  // fully recomputed client-side with the exact same logic the live React
  // page uses — not just a single icon flipped in isolation.
  const monthsJson = JSON.stringify(monthsData).replace(/</g, '\\u003c')
  return `
var CLP_ROADMAP_ID = '${roadmapId}';
// Every download is its own fresh copy — a per-download id (not just the
// roadmap id) namespaces localStorage so re-downloading the plan (which
// commonly overwrites the same filename, and can land on the same
// file:// origin) never inherits progress from a previous download that
// happened to share a browser profile. Re-opening THIS same downloaded
// file later still remembers its own progress correctly, since this id is
// baked in once at download time and stays fixed for that file.
var CLP_DOWNLOAD_ID = '${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}';
var CLP_STORAGE_KEY = 'clp-checkins-' + CLP_ROADMAP_ID + '-' + CLP_DOWNLOAD_ID;
var CLP_BASE_CHECKINS = [];
var CLP_MONTHS = ${monthsJson};
function clpGetCheckins(){
  try {
    var raw = localStorage.getItem(CLP_STORAGE_KEY);
    if (raw === null) { localStorage.setItem(CLP_STORAGE_KEY, JSON.stringify(CLP_BASE_CHECKINS)); return CLP_BASE_CHECKINS.slice(); }
    return JSON.parse(raw);
  } catch(e) { return CLP_BASE_CHECKINS.slice(); }
}
function clpSetCheckins(list){ try { localStorage.setItem(CLP_STORAGE_KEY, JSON.stringify(list)); } catch(e){} }
function clpShiftISO(dateISO, delta){
  var d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function clpTodayISO(){ return new Date().toISOString().slice(0, 10); }
// Same real-number scaling as the live page's scaleIngredientLine — only
// multiplies numeric tokens actually present in the ingredient text, never
// invents a quantity — ported to plain JS since the exported file has no
// React runtime to run the original against.
function clpScaleLine(line, ratio){
  if (ratio === 1) return line;
  var fracChars = {'¼':0.25,'½':0.5,'¾':0.75,'⅓':1/3,'⅔':2/3,'⅕':0.2,'⅖':0.4,'⅗':0.6,'⅘':0.8,'⅛':0.125,'⅜':0.375,'⅝':0.625,'⅞':0.875};
  var snap = [[0.125,'⅛'],[0.2,'⅕'],[0.25,'¼'],[1/3,'⅓'],[0.375,'⅜'],[0.4,'⅖'],[0.5,'½'],[0.6,'⅗'],[0.625,'⅝'],[2/3,'⅔'],[0.75,'¾'],[0.8,'⅘'],[0.875,'⅞']];
  function fmt(n){
    var whole = Math.floor(n + 1e-6);
    var frac = n - whole;
    for (var i=0;i<snap.length;i++){ if (Math.abs(frac-snap[i][0])<0.02) return whole>0 ? (whole+' '+snap[i][1]) : snap[i][1]; }
    if (Math.abs(frac)<0.02) return String(whole);
    var rounded = Math.round(n*100)/100;
    return (rounded % 1 === 0) ? String(rounded) : rounded.toFixed(2).replace(/0+$/,'').replace(/\\.$/,'');
  }
  var pattern = /\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\.\\d+|\\d+|[¼½¾⅓⅔⅕⅖⅗⅘⅛⅜⅝⅞]/g;
  return line.replace(pattern, function(token){
    var value;
    if (fracChars[token] !== undefined) value = fracChars[token];
    else if (token.indexOf(' ') !== -1) { var parts = token.split(/\\s+/); var f = parts[1].split('/'); value = Number(parts[0]) + Number(f[0])/Number(f[1]); }
    else if (token.indexOf('/') !== -1) { var f2 = token.split('/'); value = Number(f2[0])/Number(f2[1]); }
    else value = Number(token);
    return fmt(value*ratio);
  });
}
function clpToggleToc(){
  var panel = document.querySelector('[data-toc-panel]');
  if (!panel) return;
  panel.style.display = (panel.style.display === 'grid') ? 'none' : 'grid';
}
function clpCloseToc(){
  var panel = document.querySelector('[data-toc-panel]');
  if (panel) panel.style.display = 'none';
}
function clpSetServings(id, delta){
  var countEl = document.querySelector('[data-serve-count="'+id+'"]');
  var listEl = document.querySelector('[data-ing-list="'+id+'"]');
  if (!countEl || !listEl) return;
  var base = parseInt(listEl.getAttribute('data-ing-base'), 10) || 1;
  var count = Math.max(1, Math.min(12, (parseInt(countEl.textContent, 10) || base) + delta));
  countEl.textContent = String(count);
  var ratio = count / base;
  listEl.querySelectorAll('[data-ing-item]').forEach(function(el){
    el.textContent = clpScaleLine(el.getAttribute('data-ing-raw'), ratio);
  });
}
function showPlateExport(meal){
  ['breakfast','lunch','dinner'].forEach(function(m){
    var panel = document.getElementById('pp-'+m);
    if (panel) panel.style.display = (m===meal) ? '' : 'none';
    var btn = document.querySelector('[data-meal-tab="'+m+'"]');
    if (btn) {
      if (m===meal) { btn.style.background = '${C.greenDeep}'; btn.style.color = '#fff'; btn.style.border = 'none'; }
      else { btn.style.background = '${C.paper}'; btn.style.color = '${C.ink}'; btn.style.border = '1px solid ${C.rule}'; }
    }
  });
}
function openRecipeExport(id){
  document.querySelectorAll('[data-recipe-body]').forEach(function(el){
    el.style.display = (el.getAttribute('data-recipe-body')===id) ? 'block' : 'none';
  });
  var overlay = document.querySelector('[data-recipe-overlay]');
  if (overlay) overlay.style.display = 'flex';
}
function closeRecipeExport(){
  var overlay = document.querySelector('[data-recipe-overlay]');
  if (overlay) overlay.style.display = 'none';
}
function openMonthExport(id){
  document.querySelectorAll('[data-month-body]').forEach(function(el){
    el.style.display = (el.getAttribute('data-month-body')===id) ? 'block' : 'none';
  });
  var overlay = document.querySelector('[data-month-overlay]');
  if (overlay) overlay.style.display = 'flex';
  openWeekExportReset();
}
function closeMonthExport(){
  var overlay = document.querySelector('[data-month-overlay]');
  if (overlay) overlay.style.display = 'none';
  openWeekExportReset();
}
function openWeekExport(id){
  document.querySelectorAll('[data-week-list]').forEach(function(el){ el.style.display = 'none'; });
  document.querySelectorAll('[data-week-body]').forEach(function(el){
    el.style.display = (el.getAttribute('data-week-body')===id) ? 'block' : 'none';
  });
  closeDayExport();
  closeSlotExport();
}
function openWeekExportReset(){
  document.querySelectorAll('[data-week-list]').forEach(function(el){ el.style.display = ''; });
  document.querySelectorAll('[data-week-body]').forEach(function(el){ el.style.display = 'none'; });
  closeDayExport();
  closeSlotExport();
}
function toggleDayExport(id, btn){
  var body = document.querySelector('[data-day-body="' + id + '"]');
  if (!body) return;
  var isOpen = body.style.display === 'block';
  document.querySelectorAll('[data-day-body]').forEach(function(el){ el.style.display = 'none'; });
  document.querySelectorAll('[data-day-trigger]').forEach(function(el){
    var icon = el.querySelector('svg');
    if (icon) icon.style.transform = '';
  });
  if (!isOpen) {
    body.style.display = 'block';
    if (btn) {
      var icon = btn.querySelector('svg');
      if (icon) icon.style.transform = 'rotate(90deg)';
    }
  }
}
function closeDayExport(){
  document.querySelectorAll('[data-day-body]').forEach(function(el){ el.style.display = 'none'; });
}
function toggleFaqExport(id, btn){
  var body = document.querySelector('[data-faq-body="' + id + '"]');
  if (!body) return;
  var isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  if (btn) {
    var icon = btn.querySelector('svg');
    if (icon) icon.style.transform = isOpen ? '' : 'rotate(90deg)';
  }
}
function openSlotExport(id){
  document.querySelectorAll('[data-slot-list]').forEach(function(el){ el.style.display = 'none'; });
  document.querySelectorAll('[data-slot-body]').forEach(function(el){
    el.style.display = (el.getAttribute('data-slot-body')===id) ? 'block' : 'none';
  });
}
function closeSlotExport(){
  document.querySelectorAll('[data-slot-list]').forEach(function(el){ el.style.display = 'grid'; });
  document.querySelectorAll('[data-slot-body]').forEach(function(el){ el.style.display = 'none'; });
}
function openGroceryExport(id){
  document.querySelectorAll('[data-grocery-month-body]').forEach(function(el){
    el.style.display = (el.getAttribute('data-grocery-month-body')===id) ? 'block' : 'none';
  });
  var overlay = document.querySelector('[data-grocery-overlay]');
  if (overlay) overlay.style.display = 'flex';
  closeGroceryWeekExport();
}
function closeGroceryExport(){
  var overlay = document.querySelector('[data-grocery-overlay]');
  if (overlay) overlay.style.display = 'none';
  closeGroceryWeekExport();
}
function openGroceryWeekExport(id){
  document.querySelectorAll('[data-grocery-week-list]').forEach(function(el){ el.style.display = 'none'; });
  document.querySelectorAll('[data-grocery-week-body]').forEach(function(el){
    el.style.display = (el.getAttribute('data-grocery-week-body')===id) ? 'block' : 'none';
  });
}
function closeGroceryWeekExport(){
  document.querySelectorAll('[data-grocery-week-list]').forEach(function(el){ el.style.display = ''; });
  document.querySelectorAll('[data-grocery-week-body]').forEach(function(el){ el.style.display = 'none'; });
}
// "Bought" checkboxes are a personal shopping checklist — same "never
// synced, localStorage only" treatment as the goal checkboxes above, just
// under their own storage key so the two lists can't collide.
var CLP_GROCERY_KEY = 'clp-grocery-' + CLP_ROADMAP_ID + '-' + CLP_DOWNLOAD_ID;
function clpGetBought(){
  try { return JSON.parse(localStorage.getItem(CLP_GROCERY_KEY) || '[]'); } catch(e) { return []; }
}
function clpSetGroceryVisual(el, bought){
  var doneIcon = el.querySelector('[data-grocery-icon-done]');
  var undoneIcon = el.querySelector('[data-grocery-icon-undone]');
  var text = el.querySelector('[data-grocery-item-text]');
  if (doneIcon) doneIcon.style.display = bought ? 'inline-flex' : 'none';
  if (undoneIcon) undoneIcon.style.display = bought ? 'none' : 'inline-flex';
  if (text) text.style.textDecoration = bought ? 'line-through' : 'none';
  el.style.color = bought ? '${C.muted}' : '${C.inkSoft}';
}
function toggleGroceryItemExport(key, el){
  var list = clpGetBought();
  var idx = list.indexOf(key);
  var bought;
  if (idx >= 0) { list.splice(idx, 1); bought = false; }
  else { list.push(key); bought = true; }
  try { localStorage.setItem(CLP_GROCERY_KEY, JSON.stringify(list)); } catch(e){}
  clpSetGroceryVisual(el, bought);
}
function initGroceryExport(){
  var bought = clpGetBought();
  document.querySelectorAll('[data-grocery-item]').forEach(function(el){
    var key = el.getAttribute('data-grocery-item');
    clpSetGroceryVisual(el, bought.indexOf(key) !== -1);
  });
}
initGroceryExport();
function openCareExport(id){
  document.querySelectorAll('[data-care-body]').forEach(function(el){
    el.style.display = (el.getAttribute('data-care-body')===id) ? 'block' : 'none';
  });
  var overlay = document.querySelector('[data-care-overlay]');
  if (overlay) overlay.style.display = 'flex';
}
function closeCareExport(){
  var overlay = document.querySelector('[data-care-overlay]');
  if (overlay) overlay.style.display = 'none';
}
// A goal row shows "done" only for TODAY's real date — same daily-habit
// semantics as the live app (checkedSet is keyed by today's date there
// too), not a one-time-forever checkbox. Uses the browser's actual current
// date at the moment this runs, not whatever date the file happened to be
// downloaded on, so re-opening the same file a week later still behaves
// correctly instead of being frozen at download time.
function clpSetGoalVisual(el, done){
  var doneIcon = el.querySelector('[data-goal-icon-done]');
  var undoneIcon = el.querySelector('[data-goal-icon-undone]');
  var text = el.querySelector('[data-goal-text]');
  if (doneIcon) doneIcon.style.display = done ? 'inline-flex' : 'none';
  if (undoneIcon) undoneIcon.style.display = done ? 'none' : 'inline-flex';
  if (text) { text.style.textDecoration = done ? 'line-through' : 'none'; text.style.color = done ? '${C.muted}' : '${C.ink}'; }
}
function clpSetText(sel, val){ var el = document.querySelector(sel); if (el) el.textContent = val; }

// Recomputes every number in "Track your progress" (stat cards + one ring
// per month) straight from the current checkin list — the exact same
// derivation the live React page does — so a toggle anywhere in the
// downloaded file is reflected everywhere else in that same file, not just
// on the row that was clicked.
function renderProgressExport(){
  var list = clpGetCheckins();
  var dateSet = {};
  list.forEach(function(c){ dateSet[c.checkin_date] = true; });
  var streak = 0;
  var cursor = clpTodayISO();
  if (!dateSet[cursor]) cursor = clpShiftISO(cursor, -1);
  while (dateSet[cursor]) { streak++; cursor = clpShiftISO(cursor, -1); }
  var totalDaysLogged = Object.keys(dateSet).length;
  var doneKeySet = {};
  list.forEach(function(c){ doneKeySet[c.week_number + ':' + c.action_index] = true; });
  var goalsDone = Object.keys(doneKeySet).length;
  var totalActionsInPlan = 0;
  CLP_MONTHS.forEach(function(m){ m.weeks.forEach(function(w){ totalActionsInPlan += w.totalActions; }); });

  var bestPct = -1, bestLabel = '';
  CLP_MONTHS.forEach(function(m){
    var total = 0, done = 0;
    m.weeks.forEach(function(w){
      total += w.totalActions;
      var wDone = 0;
      for (var i = 0; i < w.totalActions; i++) { if (doneKeySet[w.week_number + ':' + i]) wDone++; }
      done += wDone;
    });
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    var clamped = Math.max(0, Math.min(100, pct));
    var circle = document.querySelector('[data-ring-circle="' + m.monthNumber + '"]');
    if (circle) {
      var r = parseFloat(circle.getAttribute('r'));
      var c = 2 * Math.PI * r;
      circle.style.strokeDasharray = c;
      circle.style.strokeDashoffset = c - (clamped / 100) * c;
      circle.style.stroke = clamped >= 70 ? '${C.green}' : clamped >= 35 ? '${C.accent}' : '${C.muted}';
    }
    clpSetText('[data-ring-pct="' + m.monthNumber + '"]', Math.round(clamped) + '%');
    clpSetText('[data-ring-sub="' + m.monthNumber + '"]', done + '/' + total + ' goals');
    if (done > 0 && pct > bestPct) { bestPct = pct; bestLabel = m.monthLabel; }
  });

  clpSetText('[data-stat="streak"]', streak);
  clpSetText('[data-stat="days"]', totalDaysLogged);
  clpSetText('[data-stat="goals"]', goalsDone + '/' + totalActionsInPlan);
  clpSetText('[data-stat="best"]', bestPct >= 0 ? bestPct + '%' : '0%');
  clpSetText('[data-stat-label="best"]', bestPct >= 0 ? 'best month · ' + bestLabel : 'best month');
  var emptyEl = document.querySelector('[data-track-empty]');
  var contentEl = document.querySelector('[data-track-content]');
  if (emptyEl) emptyEl.style.display = totalDaysLogged === 0 ? 'block' : 'none';
  if (contentEl) contentEl.style.display = totalDaysLogged === 0 ? 'none' : 'block';
}

// Goal check-off in the downloaded file is a personal checklist for the
// patient only — not shared with or visible to the coach. It persists to
// localStorage (so it survives reopening the same file later, even
// offline) and nowhere else; deliberately no network call back to the app.
function toggleGoalExport(key, el){
  var parts = key.split(':');
  var week = parseInt(parts[0], 10), action = parseInt(parts[1], 10);
  var dateStr = clpTodayISO();
  var list = clpGetCheckins();
  var idx = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].week_number === week && list[i].action_index === action && list[i].checkin_date === dateStr) { idx = i; break; }
  }
  var newDone;
  if (idx >= 0) { list.splice(idx, 1); newDone = false; }
  else { list.push({ week_number: week, action_index: action, checkin_date: dateStr }); newDone = true; }
  clpSetCheckins(list);
  clpSetGoalVisual(el, newDone);
  renderProgressExport();
}
function initGoalsExport(){
  var list = clpGetCheckins();
  var todayStr = clpTodayISO();
  document.querySelectorAll('[data-goal-toggle]').forEach(function(el){
    var key = el.getAttribute('data-goal-toggle');
    var parts = key.split(':');
    var week = parseInt(parts[0], 10), action = parseInt(parts[1], 10);
    var doneToday = list.some(function(c){ return c.week_number === week && c.action_index === action && c.checkin_date === todayStr; });
    clpSetGoalVisual(el, doneToday);
  });
  renderProgressExport();
}
initGoalsExport();
`
}

export default function DashboardClient({ roadmapId, patientId, data, initialCheckins, editable = false }: {
  roadmapId: string
  patientId?: string
  data: GuideData
  initialCheckins: Checkin[]
  editable?: boolean
}) {
  const [checkins, setCheckins] = useState<Checkin[]>(initialCheckins)
  const [activeMeal, setActiveMeal] = useState<MealType>('breakfast')
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)
  const [openMonth, setOpenMonth] = useState<number | null>(null)
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [openGroceryMonth, setOpenGroceryMonth] = useState<number | null>(null)
  const [openGroceryWeek, setOpenGroceryWeek] = useState<number | null>(null)
  const [boughtItems, setBoughtItems] = useState<Set<string>>(new Set())
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const [aiGroceryCache, setAiGroceryCache] = useState<Record<number, GroceryCategory[]>>({})
  const [aiGroceryLoadingWeek, setAiGroceryLoadingWeek] = useState<number | null>(null)
  const today = todayISO()

  // Edit state — seeded once from `data` and only ever touched by the coach
  // in `editable` mode. In read-only (patient-facing) mode these just mirror
  // `data` untouched, so using them everywhere below (instead of branching
  // every render on `editable`) is safe and keeps one rendering codepath.
  const [coaches, setCoaches] = useState<{ id: string; full_name: string }[]>([])
  const [goalLabel, setGoalLabel] = useState(data.goalLabel)
  const [whyReflection, setWhyReflection] = useState(data.whyReflection)
  const [coachQuote, setCoachQuote] = useState(data.coachQuote)
  const [nutritionistId, setNutritionistId] = useState(data.coach?.id ?? '')
  const [lifestyleText, setLifestyleText] = useState(data.roadmap.lifestyle_guidelines)
  const [editWeeks, setEditWeeks] = useState<WeeklyPlan[]>(data.roadmap.weekly_schedule)
  const [manualRecipes, setManualRecipes] = useState<Partial<Record<DayMealSlot, string[]>>>(data.manualRecipes || {})
  const [weeklyManualRecipes, setWeeklyManualRecipes] = useState<Record<number, Partial<Record<DayMealSlot, string[]>>>>(data.weeklyManualRecipes || {})
  const [editingWeek, setEditingWeek] = useState<number | null>(null)
  const [recipeSearch, setRecipeSearch] = useState<Partial<Record<DayMealSlot, string>>>({})
  const [theme, setTheme] = useState(data.theme && PALETTES[data.theme] ? data.theme : 'classic')
  const [template, setTemplate] = useState(data.template === 'almanac' ? 'almanac' : 'classic')
  const [careServices, setCareServices] = useState(data.careServices || [])
  const [openCareService, setOpenCareService] = useState<number | null>(null)
  const [nextAppointment, setNextAppointment] = useState(data.nextAppointment || { date: '', time: '', mode: '' })
  const [careTeam, setCareTeam] = useState(data.careTeam || [])
  const [hiddenSections, setHiddenSections] = useState<string[]>(data.hiddenSections || [])
  const isHidden = (id: string) => hiddenSections.includes(id)
  const toggleSection = (id: string) => setHiddenSections((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  // Patient view: hide with CSS so nothing renders for them. Editor view:
  // always show (dimmed via the toggle pill) so the coach can switch it back
  // on — but still tag it `data-hidden-section` so downloadDashboard() strips
  // it out of the exported static HTML even if a coach downloads mid-edit.
  const hiddenStyle = (id: string) => (!editable && isHidden(id) ? { display: 'none' as const } : {})
  const hiddenAttrs = (id: string) => (isHidden(id) ? { 'data-hidden-section': true } : {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!editable) return
    fetch('/api/nutritionists').then((r) => r.json()).then((j) => setCoaches(Array.isArray(j) ? j : []))
  }, [editable])

  function updateWeek(weekNumber: number, patch: Partial<WeeklyPlan>) {
    setEditWeeks((prev) => prev.map((w) => (w.week_number === weekNumber ? { ...w, ...patch } : w)))
  }

  async function save() {
    if (!patientId) return
    setSaving(true)
    setSaveError('')
    try {
      const [roadmapRes, patientRes] = await Promise.all([
        fetch(`/api/roadmaps/${roadmapId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lifestyle_guidelines: lifestyleText,
            guide_overrides: { goal_label: goalLabel, why_reflection: whyReflection, coach_quote: coachQuote, manual_recipes: manualRecipes, weekly_manual_recipes: weeklyManualRecipes, theme, template, care_services: careServices, next_appointment: nextAppointment, care_team: careTeam, hidden_sections: hiddenSections },
            weekly_schedule: editWeeks.map((w) => ({ ...w, actions: (w.actions || []).map((a) => a.trim()).filter(Boolean) })),
          }),
        }),
        fetch(`/api/patients/${patientId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nutritionist_id: nutritionistId || null }),
        }),
      ])
      if (!roadmapRes.ok || !patientRes.ok) {
        const failed = !roadmapRes.ok ? await roadmapRes.json().catch(() => null) : await patientRes.json().catch(() => null)
        setSaveError(failed?.error || 'Save failed, try again.')
        return
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaveError('Network error, try again.')
    } finally { setSaving(false) }
  }

  const checkedSet = useMemo(
    () => new Set(checkins.map((c) => `${c.week_number}:${c.action_index}:${c.checkin_date}`)),
    [checkins]
  )

  async function toggle(weekNumber: number, actionIndex: number) {
    const key = `${weekNumber}:${actionIndex}:${today}`
    const wasChecked = checkedSet.has(key)
    const revert = () => setCheckins((prev) => wasChecked
      ? [...prev, { week_number: weekNumber, action_index: actionIndex, checkin_date: today }]
      : prev.filter((c) => !(c.week_number === weekNumber && c.action_index === actionIndex && c.checkin_date === today)))
    // Optimistic update — reconciled below if the server didn't actually
    // persist it; two rapid taps racing is an accepted edge case for a habit
    // checklist, not worth blocking the UI over.
    setCheckins((prev) => wasChecked
      ? prev.filter((c) => !(c.week_number === weekNumber && c.action_index === actionIndex && c.checkin_date === today))
      : [...prev, { week_number: weekNumber, action_index: actionIndex, checkin_date: today }])
    try {
      // fetch() only rejects on network failure, not on a non-2xx response —
      // a 500 (e.g. the checkins table not existing yet) would otherwise look
      // identical to success and leave the checkbox stuck in the wrong state.
      const r = await fetch(`/api/roadmaps/${roadmapId}/checkins`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_number: weekNumber, action_index: actionIndex, date: today }),
      })
      if (!r.ok) revert()
    } catch {
      revert()
    }
  }

  // "Bought" state for the per-week shopping list — a personal checklist,
  // never sent to the server or seen by the coach, so plain localStorage
  // (namespaced by roadmapId) is enough; keyed by week + category + item so
  // checking something off in Week 1 doesn't cross out the same ingredient
  // in Week 2's list.
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

  const months = reshapeRoadmapIntoMonths(editWeeks).filter((m) => m.planned)
  const parsedGuidelines = parseNutritionistGuidelines(data.roadmap.nutritionist_guidelines)
  const lifestyleBullets = parseBullets(lifestyleText)
  const firstName = data.patient?.full_name?.split(' ')[0] ?? 'there'
  const coachFirst = data.coach?.full_name?.split(' ')[0] || 'your coach'

  // Real adherence, not filler — every number below is derived straight from
  // recorded check-ins (never invented). Per-month "adherence" is goals
  // actually accomplished ÷ goals planned for that month — the same ratio
  // each week block already shows ("3/3 accomplished") — not a days-logged
  // ratio. A days-logged ratio looks identical across every month whenever
  // a patient checks off a batch of goals from different months in one
  // sitting (they'd all share today's date, so every month reads "1 day
  // logged" even though completion differs a lot) — completion is the
  // number that's actually supposed to differ month to month.
  const progress = useMemo(() => {
    const dateSet = new Set(checkins.map((c) => c.checkin_date))
    const streak = (() => {
      let n = 0
      let cursor = dateSet.has(today) ? today : shiftDateISO(today, -1)
      while (dateSet.has(cursor)) {
        n++
        cursor = shiftDateISO(cursor, -1)
      }
      return n
    })()
    const doneKeys = new Set(checkins.map((c) => `${c.week_number}:${c.action_index}`))
    const totalActionsInPlan = months.reduce((n, m) => n + m.weeks.reduce((nn, w) => nn + (w.actions?.length ?? 0), 0), 0)
    const goalsDone = doneKeys.size
    const monthStats = months.map((m) => {
      const totalActions = m.weeks.reduce((n, w) => n + (w.actions?.length ?? 0), 0)
      const doneActions = m.weeks.reduce((n, w) => n + (w.actions ?? []).filter((_, i) => doneKeys.has(`${w.week_number}:${i}`)).length, 0)
      const pct = totalActions > 0 ? Math.round((doneActions / totalActions) * 100) : 0
      return { monthNumber: m.monthNumber, monthLabel: m.monthLabel, doneActions, totalActions, pct }
    })
    const bestMonth = monthStats.reduce<typeof monthStats[number] | null>((best, m) => (m.doneActions > 0 && m.pct > (best?.pct ?? -1) ? m : best), null)
    return { streak, totalDaysLogged: dateSet.size, goalsDone, totalActionsInPlan, monthStats, bestMonth }
  }, [checkins, months, today])

  // Mirrors the PDF's image + recipe selection exactly (same functions, same
  // "no real match beats a fabricated one" discipline) so the dashboard and
  // PDF never show different pictures or different recipes for the same
  // patient. One shared `used` set, matched in the same top-to-bottom order
  // as the PDF sections, so the same photo doesn't repeat across sections.
  const { heroImage, mealMatches, weekMealMatches, mealImages, superfoodImage, monthImages } = useMemo(() => {
    const used = new Set<string>()
    const hero = matchGuideImageDistinct(data.roadmap.lifestyle_guidelines, data.imageBank, used)
    const parsed = parseNutritionistGuidelines(data.roadmap.nutritionist_guidelines)
    // Matched once at the wider limit (5) — "Your power plates" below just
    // uses the top 2 of the same ranked list, so both sections always agree
    // on which recipes rank highest for this patient.
    const selection = selectRecipesForPatient(
      { primaryConcern: data.patient.primary_concern || '', dietProtocol: parsed.dietProtocol },
      data.recipeBank,
      5
    )
    const images = new Map<string, string | null>()
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] as const) {
      for (const m of selection[meal]) {
        // A recipe's own photo (set directly by the coach) always wins over
        // a tag-matched guess from the picture bank.
        if (m.recipe.image_url) { images.set(m.recipe.id, m.recipe.image_url); continue }
        const img = matchGuideImageDistinct(`${m.recipe.name} ${m.recipe.tags.join(' ')}`, data.imageBank, used)
        images.set(m.recipe.id, img?.image_url ?? null)
      }
    }
    const superfood = matchGuideImageDistinct('superfood nutrition weekly pick seasonal', data.imageBank, used)
    // One optional photo per month block — same "no real match beats a
    // fabricated one" rule, so a month with nothing tag-matched just shows a
    // plain icon tile instead of a forced/wrong picture.
    const months = new Map<string, string | null>()
    for (const m of reshapeRoadmapIntoMonths(data.roadmap.weekly_schedule).filter((mm) => mm.planned)) {
      const query = m.weeks.map((w) => `${w.focus_theme} ${w.food_menu || ''}`).join(' ')
      const img = matchGuideImageDistinct(query, data.imageBank, used)
      months.set(String(m.monthNumber), img?.image_url ?? null)
    }
    const capped = { breakfast: selection.breakfast.slice(0, 2), lunch: selection.lunch.slice(0, 2), dinner: selection.dinner.slice(0, 2), snack: selection.snack.slice(0, 2), dessert: selection.dessert.slice(0, 2) }
    return { heroImage: hero, mealMatches: capped, weekMealMatches: selection, mealImages: images, superfoodImage: superfood, monthImages: months }
  }, [data])

  // Shared with every template (src/lib/pdf/weekRecipes.ts) so Classic and
  // Almanac can never silently disagree about a patient's real curated
  // recipes for a given week+slot.
  const curatedSlotIds = (slot: DayMealSlot, weekNumber: number): string[] =>
    sharedCuratedSlotIds(slot, weekNumber, weeklyManualRecipes, manualRecipes, weekMealMatches)

  const getSlotRecipes = (weekNumber: number) =>
    sharedGetSlotRecipes(weekNumber, DAY_MEAL_SLOTS, weeklyManualRecipes, manualRecipes, weekMealMatches, data.recipeBank, `Picked by ${coachFirst} for your plan.`)

  const allWeekSlotRecipes = months.flatMap((m) => m.weeks.flatMap((w) => getSlotRecipes(w.week_number)))

  const allMatches = (() => {
    const combined = [...mealMatches.breakfast, ...mealMatches.lunch, ...mealMatches.dinner, ...mealMatches.snack, ...mealMatches.dessert,
      ...allWeekSlotRecipes.flatMap((s) => s.matches)]
    return combined.filter((m, i) => combined.findIndex((x) => x.recipe.id === m.recipe.id) === i)
  })()
  // Real ingredients from this patient's own matched recipes, categorized —
  // falls back to the generic reference list only when no recipe has been
  // matched yet, so the list is never left empty. Used as the fallback for
  // any week whose own curated recipes don't yield ingredients.
  const patientGroceryCategories = buildGroceryList(allMatches.map((m) => m.recipe))
  const groceryCategories = patientGroceryCategories.length > 0 ? patientGroceryCategories : GROCERY_CATEGORIES

  // The regex cleanup in groceryList.ts is instant but rule-based — an AI
  // pass catches what fixed rules can't (spelling variants, oddly-worded
  // duplicates, better categorization). It's fetched lazily per week (only
  // once, cached) so opening a week's list is never blocked on it — the
  // regex-based list above shows immediately and this quietly replaces it
  // when ready, or stays as-is if the call fails.
  useEffect(() => {
    if (openGroceryWeek == null || aiGroceryCache[openGroceryWeek]) return
    const weekRecipes = getSlotRecipes(openGroceryWeek).flatMap((s) => s.matches).map((m) => m.recipe)
    const candidateItems = buildGroceryList(weekRecipes).flatMap((cat) => cat.items.map((name) => ({ name, category: cat.head })))
    if (candidateItems.length === 0) return
    let cancelled = false
    setAiGroceryLoadingWeek(openGroceryWeek)
    fetch('/api/grocery-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: candidateItems }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j || !Array.isArray(j.categories) || j.categories.length === 0) return
        setAiGroceryCache((prev) => ({ ...prev, [openGroceryWeek]: j.categories }))
      })
      .catch(() => { /* keep the regex-based list on failure */ })
      .finally(() => { if (!cancelled) setAiGroceryLoadingWeek((prev) => (prev === openGroceryWeek ? null : prev)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGroceryWeek])

  const combinedImages = new Map(mealImages)
  allWeekSlotRecipes.forEach((s) => s.matches.forEach((m) => {
    if (!combinedImages.has(m.recipe.id)) {
      if (m.recipe.image_url) { combinedImages.set(m.recipe.id, m.recipe.image_url); return }
      const img = matchGuideImageDistinct(`${m.recipe.name} ${m.recipe.tags.join(' ')}`, data.imageBank, new Set())
      combinedImages.set(m.recipe.id, img?.image_url ?? null)
    }
  }))

  // Downloads exactly what's rendered on screen — everything in this
  // component is inline-styled (no external stylesheet to lose), so cloning
  // the live DOM and wrapping it in a minimal document reproduces this page
  // pixel-for-pixel as a standalone file, without maintaining a second
  // "download" template that could drift from what the coach actually sees.
  // The clone carries no React event listeners, so the meal tabs and recipe
  // cards would otherwise be dead — plain onclick attributes + EXPORT_SCRIPT
  // (operating on the same ids/data-attributes the live page uses) restore
  // that interactivity in the standalone file.
  function downloadDashboard() {
    const root = document.getElementById('dashboard-export-root')
    if (!root) return
    const clone = root.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-no-export]').forEach((el) => el.remove())
    clone.querySelectorAll('[data-hidden-section]').forEach((el) => el.remove())
    clone.querySelectorAll('[data-meal-tab]').forEach((el) => {
      el.setAttribute('onclick', `showPlateExport('${el.getAttribute('data-meal-tab')}')`)
    })
    clone.querySelectorAll('[data-recipe-trigger]').forEach((el) => {
      el.setAttribute('onclick', `openRecipeExport('${el.getAttribute('data-recipe-trigger')}')`)
    })
    clone.querySelectorAll('[data-recipe-close]').forEach((el) => el.setAttribute('onclick', 'closeRecipeExport()'))
    clone.querySelectorAll('[data-recipe-overlay]').forEach((el) => el.setAttribute('onclick', 'if(event.target===this)closeRecipeExport()'))
    clone.querySelectorAll('[data-serve-dec]').forEach((el) => {
      el.setAttribute('onclick', `clpSetServings('${el.getAttribute('data-serve-dec')}', -1)`)
    })
    clone.querySelectorAll('[data-serve-inc]').forEach((el) => {
      el.setAttribute('onclick', `clpSetServings('${el.getAttribute('data-serve-inc')}', 1)`)
    })
    clone.querySelectorAll('[data-month-trigger]').forEach((el) => {
      el.setAttribute('onclick', `openMonthExport('${el.getAttribute('data-month-trigger')}')`)
    })
    clone.querySelectorAll('[data-month-close]').forEach((el) => el.setAttribute('onclick', 'closeMonthExport()'))
    clone.querySelectorAll('[data-month-overlay]').forEach((el) => el.setAttribute('onclick', 'if(event.target===this)closeMonthExport()'))
    clone.querySelectorAll('[data-week-trigger]').forEach((el) => {
      el.setAttribute('onclick', `openWeekExport('${el.getAttribute('data-week-trigger')}')`)
    })
    clone.querySelectorAll('[data-week-back]').forEach((el) => el.setAttribute('onclick', 'openWeekExportReset()'))
    clone.querySelectorAll('[data-day-trigger]').forEach((el) => {
      el.setAttribute('onclick', `toggleDayExport('${el.getAttribute('data-day-trigger')}', this)`)
    })
    clone.querySelectorAll('[data-day-body]').forEach((el) => ((el as HTMLElement).style.display = 'none'))
    clone.querySelectorAll('[data-slot-trigger]').forEach((el) => {
      el.setAttribute('onclick', `openSlotExport('${el.getAttribute('data-slot-trigger')}')`)
    })
    clone.querySelectorAll('[data-slot-back]').forEach((el) => el.setAttribute('onclick', 'closeSlotExport()'))
    clone.querySelectorAll('[data-slot-body]').forEach((el) => ((el as HTMLElement).style.display = 'none'))
    clone.querySelectorAll('[data-goal-toggle]').forEach((el) => {
      el.setAttribute('onclick', `toggleGoalExport('${el.getAttribute('data-goal-toggle')}', this)`)
    })
    clone.querySelectorAll('[data-faq-trigger]').forEach((el) => {
      el.setAttribute('onclick', `toggleFaqExport('${el.getAttribute('data-faq-trigger')}', this)`)
    })
    clone.querySelectorAll('[data-faq-body]').forEach((el) => ((el as HTMLElement).style.display = 'none'))
    clone.querySelectorAll('[data-grocery-month-trigger]').forEach((el) => {
      el.setAttribute('onclick', `openGroceryExport('${el.getAttribute('data-grocery-month-trigger')}')`)
    })
    clone.querySelectorAll('[data-grocery-close]').forEach((el) => el.setAttribute('onclick', 'closeGroceryExport()'))
    clone.querySelectorAll('[data-grocery-overlay]').forEach((el) => el.setAttribute('onclick', 'if(event.target===this)closeGroceryExport()'))
    clone.querySelectorAll('[data-grocery-week-trigger]').forEach((el) => {
      el.setAttribute('onclick', `openGroceryWeekExport('${el.getAttribute('data-grocery-week-trigger')}')`)
    })
    clone.querySelectorAll('[data-grocery-week-back]').forEach((el) => el.setAttribute('onclick', 'closeGroceryWeekExport()'))
    clone.querySelectorAll('[data-grocery-item]').forEach((el) => {
      const key = (el.getAttribute('data-grocery-item') || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      el.setAttribute('onclick', `toggleGroceryItemExport('${key}', this)`)
    })
    clone.querySelectorAll('[data-care-trigger]').forEach((el) => {
      el.setAttribute('onclick', `openCareExport('${el.getAttribute('data-care-trigger')}')`)
    })
    clone.querySelectorAll('[data-care-close]').forEach((el) => el.setAttribute('onclick', 'closeCareExport()'))
    clone.querySelectorAll('[data-care-overlay]').forEach((el) => el.setAttribute('onclick', 'if(event.target===this)closeCareExport()'))
    // The TOC bar's sticky offset (and every section's scroll-margin-top)
    // are tuned to sit below the app's own 60px site header — the
    // standalone export has no such header, so left as-is the bar would
    // float with a 60px gap above it and overlap the content beneath.
    clone.querySelectorAll('[data-toc-bar]').forEach((el) => (el as HTMLElement).style.top = '0px')
    clone.querySelectorAll('[data-toc-trigger]').forEach((el) => el.setAttribute('onclick', 'clpToggleToc()'))
    clone.querySelectorAll('[data-toc-link]').forEach((el) => el.setAttribute('onclick', 'clpCloseToc()'))
    clone.querySelectorAll('[data-toc-panel]').forEach((el) => ((el as HTMLElement).style.display = 'none'))
    clone.querySelectorAll('[style*="scroll-margin-top"]').forEach((el) => (el as HTMLElement).style.scrollMarginTop = '54px')
    const monthsData: MonthExportData[] = months.map((m) => ({
      monthNumber: m.monthNumber,
      monthLabel: m.monthLabel,
      weeks: m.weeks.map((w) => ({ week_number: w.week_number, totalActions: w.actions?.length ?? 0 })),
    }))
    const title = (data.patient?.full_name || 'Your') + "'s Plan, Clinic Living Plus"
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title.replace(/</g, '&lt;')}</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;}</style>
</head>
<body>${clone.outerHTML}
<script>${buildExportScript(roadmapId, monthsData)}</script>
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
    <div id="dashboard-export-root" style={{ background: C.bg, minHeight: '100vh' }}>
      <style>{`html{scroll-behavior:smooth;}
#dashboard-export-root{
  --clp-bg:${PALETTES[theme].bg}; --clp-paper:${PALETTES[theme].paper}; --clp-ink:${PALETTES[theme].ink}; --clp-ink-soft:${PALETTES[theme].inkSoft};
  --clp-accent:${PALETTES[theme].accent}; --clp-accent-soft:${PALETTES[theme].accentSoft}; --clp-rule:${PALETTES[theme].rule}; --clp-muted:${PALETTES[theme].muted};
  --clp-green:${PALETTES[theme].green}; --clp-green-deep:${PALETTES[theme].greenDeep};
}`}</style>
      {editable && <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>}
      {/* Table of contents — a single dropdown button rather than a row of
          links, so it never overflows or shows a scrollbar regardless of
          how many sections are visible. The links themselves are plain
          anchors (no JS needed to jump), only open/close needs a handler —
          restored via data-toc-trigger/data-toc-panel in the downloaded
          static export too, not just the live page. */}
      <div data-toc-bar style={{ position: 'sticky', top: 60, zIndex: 40, background: C.paper, borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '8px 16px', position: 'relative' }}>
          <button data-toc-trigger onClick={() => setTocOpen((v) => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.ink, background: C.accentSoft, border: `1px solid ${C.rule}`, borderRadius: 20, padding: '7px 14px', cursor: 'pointer' }}>
            Jump to section <ChevronDown size={14} style={{ transform: tocOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          <div data-toc-panel style={{ display: tocOpen ? 'grid' : 'none', position: 'absolute', top: '100%', left: 16, marginTop: 6, gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))', gap: '2px 12px', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '70vh', overflowY: 'auto', zIndex: 41 }}>
            {TOC_ITEMS.filter((item) => editable || !isHidden(item.id)).map((item, i) => (
              <a key={`${item.id}-${i}`} data-toc-link href={`#${item.id}`} onClick={() => setTocOpen(false)}
                style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, textDecoration: 'none', padding: '8px 9px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </div>
      {allMatches.length > 0 && (
        <div data-recipe-overlay onClick={() => setOpenRecipeId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(44,36,24,0.55)', display: openRecipeId ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 110 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', background: C.paper, borderRadius: 16, padding: '24px 26px', maxWidth: 900, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <button data-recipe-close onClick={() => setOpenRecipeId(null)}
              style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
            {allMatches.map((m) => (
              <div key={m.recipe.id} data-recipe-body={m.recipe.id} style={{ display: openRecipeId === m.recipe.id ? 'block' : 'none' }}>
                <RecipeBody recipe={m.recipe} imageUrl={combinedImages.get(m.recipe.id) ?? null} />
              </div>
            ))}
          </div>
        </div>
      )}
      {!editable && months.length > 0 && (
        <div data-month-overlay onClick={() => { setOpenMonth(null); setOpenWeek(null); setOpenDay(null); setOpenSlot(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(44,36,24,0.55)', display: openMonth != null ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', background: C.paper, borderRadius: 16, padding: '24px 26px', maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <button data-month-close onClick={() => { setOpenMonth(null); setOpenWeek(null); setOpenDay(null); setOpenSlot(null) }}
              style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
            {months.map((m) => (
              <div key={m.monthNumber} data-month-body={m.monthNumber} style={{ display: openMonth === m.monthNumber ? 'block' : 'none' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, paddingRight: 28, marginBottom: 4 }}>{m.monthLabel}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>Weeks {m.weekStart}–{m.weekEnd}</div>

                {/* Week list — 4 compact blocks; tap one for its detail below */}
                <div data-week-list style={{ display: openWeek == null ? 'block' : 'none' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                    {m.weeks.map((w: WeeklyPlan) => (
                      <button key={w.week_number} data-week-trigger={w.week_number} onClick={() => { setOpenWeek(w.week_number); setOpenDay(null); setOpenSlot(null) }}
                        style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.rule}`, background: C.bg, cursor: 'pointer' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Week {w.week_number}</div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{w.focus_theme}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Week detail — Sunday through Saturday, each showing the
                    week's goals (same content every day; goals aren't
                    tracked per calendar day in this app), then one shared
                    Recipes section for the whole week — not per day. */}
                {m.weeks.map((w: WeeklyPlan) => (
                  <div key={w.week_number} data-week-body={w.week_number} style={{ display: openWeek === w.week_number ? 'block' : 'none' }}>
                    <button data-week-back onClick={() => { setOpenWeek(null); setOpenDay(null); setOpenSlot(null) }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 12.5, fontWeight: 700, padding: 0, marginBottom: 14 }}>
                      ← Back to weeks
                    </button>

                    <div style={{ ...weekBoxLabel, marginBottom: 10 }}>Sunday to Saturday, this week&apos;s goals</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                      {DAY_LABELS.map((day) => {
                        const dayId = `${w.week_number}-${day}`
                        const isOpen = openDay === dayId
                        return (
                          <div key={day} style={{ background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
                            <button data-day-trigger={dayId} onClick={() => setOpenDay(isOpen ? null : dayId)}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{day}</span>
                              {isOpen ? <ChevronDown size={16} color={C.muted} /> : <ChevronRight size={16} color={C.muted} />}
                            </button>
                            <div data-day-body={dayId} style={{ display: isOpen ? 'block' : 'none', padding: '0 14px 14px' }}>
                              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, marginBottom: 2 }}>Macro goal</div>
                              <div style={{ fontSize: 13, color: C.ink, marginBottom: 8 }}>{w.focus_theme}</div>
                              {(w.actions?.length ?? 0) > 0 && (
                                <>
                                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, marginBottom: 4 }}>Micro goals</div>
                                  {(w.actions ?? []).map((action, actionIndex) => (
                                    <GoalRow key={actionIndex} weekNumber={w.week_number} actionIndex={actionIndex} action={action}
                                      checked={checkedSet.has(`${w.week_number}:${actionIndex}:${today}`)}
                                      onToggle={() => toggle(w.week_number, actionIndex)} />
                                  ))}
                                </>
                              )}
                              {w.milestone?.trim() && (
                                <>
                                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, marginTop: 6, marginBottom: 2 }}>Success looks like</div>
                                  <div style={{ fontSize: 13, color: C.ink }}>{w.milestone}</div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Recipes — once per week, not per day (recipes aren't
                        tracked per-day, same as the goals above), and each
                        week gets its own curated bunch (coach picks per
                        week, or falls back to the auto-detected matches for
                        this patient). Tapping a meal slot opens the
                        recipes for it; tapping a recipe opens its detail. */}
                    {(() => { const weekSlotRecipes = getSlotRecipes(w.week_number); return (<>
                    <div style={weekBoxLabel}>Recipes for the week</div>
                    <div data-slot-list style={{ display: openSlot == null ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                      {weekSlotRecipes.map(({ slot, matches }) => {
                        const slotId = `${w.week_number}-${slot}`
                        return (
                          <button key={slot} data-slot-trigger={slotId} onClick={() => setOpenSlot(slotId)}
                            style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.rule}`, background: C.bg, cursor: 'pointer' }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{SLOT_LABELS[slot]}</div>
                            <div style={{ fontSize: 11.5, color: matches.length ? C.accent : C.muted, marginTop: 4, fontWeight: 600 }}>
                              {matches.length ? `${matches.length} recipe${matches.length === 1 ? '' : 's'}` : `Not detected yet, ${coachFirst} will add some.`}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {weekSlotRecipes.map(({ slot, matches }) => {
                      const slotId = `${w.week_number}-${slot}`
                      return (
                      <div key={slot} data-slot-body={slotId} style={{ display: openSlot === slotId ? 'block' : 'none' }}>
                        <button data-slot-back onClick={() => setOpenSlot(null)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 12.5, fontWeight: 700, padding: 0, marginBottom: 12 }}>
                          ← Back to meal slots
                        </button>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 10 }}>{SLOT_LABELS[slot]}, picked for your plan</div>
                        {matches.length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                            {matches.map((m) => (
                              <button key={m.recipe.id} data-recipe-trigger={m.recipe.id} onClick={() => setOpenRecipeId(m.recipe.id)}
                                style={{ textAlign: 'left', padding: 0, borderRadius: 12, border: `1px solid ${C.rule}`, background: C.bg, overflow: 'hidden', cursor: 'pointer' }}>
                                {combinedImages.get(m.recipe.id) ? (
                                  <img src={combinedImages.get(m.recipe.id) ?? undefined} alt={m.recipe.name} style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} />
                                ) : (
                                  <div style={{ width: '100%', height: 72, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChefHat size={20} color={C.accent} /></div>
                                )}
                                <div style={{ padding: '8px 10px' }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{m.recipe.name}</div>
                                  {m.recipe.protein_label && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{m.recipe.protein_label}</div>}
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12.5, color: C.muted }}>Nothing detected for {SLOT_LABELS[slot].toLowerCase()} yet, {coachFirst} will add some.</div>
                        )}
                      </div>
                      )
                    })}
                    </>) })()}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 16 }}>Tap a goal each day you complete it. Checking today ({today}) tracks it for your coach to review.</div>
          </div>
        </div>
      )}
      {months.length > 0 && (
        <div data-grocery-overlay onClick={() => { setOpenGroceryMonth(null); setOpenGroceryWeek(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(44,36,24,0.55)', display: openGroceryMonth != null ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', background: C.paper, borderRadius: 16, padding: '24px 26px', maxWidth: 620, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <button data-grocery-close onClick={() => { setOpenGroceryMonth(null); setOpenGroceryWeek(null) }}
              style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
            {months.map((m) => (
              <div key={m.monthNumber} data-grocery-month-body={m.monthNumber} style={{ display: openGroceryMonth === m.monthNumber ? 'block' : 'none' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, paddingRight: 28, marginBottom: 4 }}>{m.monthLabel} shopping list</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>Weeks {m.weekStart}–{m.weekEnd}</div>

                <div data-grocery-week-list={m.monthNumber} style={{ display: openGroceryWeek == null ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                  {m.weeks.map((w: WeeklyPlan) => (
                    <button key={w.week_number} data-grocery-week-trigger={w.week_number} onClick={() => setOpenGroceryWeek(w.week_number)}
                      style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.rule}`, background: C.bg, cursor: 'pointer' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Week {w.week_number}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{w.focus_theme}</div>
                    </button>
                  ))}
                </div>

                {m.weeks.map((w: WeeklyPlan) => (
                  <div key={w.week_number} data-grocery-week-body={w.week_number} style={{ display: openGroceryWeek === w.week_number ? 'block' : 'none' }}>
                    <button data-grocery-week-back onClick={() => setOpenGroceryWeek(null)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 12.5, fontWeight: 700, padding: 0, marginBottom: 14 }}>
                      ← Back to weeks
                    </button>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Week {w.week_number} shopping list</div>
                    {aiGroceryLoadingWeek === w.week_number && !aiGroceryCache[w.week_number] && (
                      <div style={{ fontSize: 11.5, color: C.accent, marginBottom: 8 }}>✨ Tidying up this list…</div>
                    )}
                    {(() => {
                      const weekRecipes = getSlotRecipes(w.week_number).flatMap((s) => s.matches).map((m) => m.recipe)
                      const weekCategories = aiGroceryCache[w.week_number] ?? buildGroceryList(weekRecipes)
                      const cats = weekCategories.length > 0 ? weekCategories : groceryCategories
                      return cats.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: C.muted }}>No ingredients detected yet.</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                        {cats.map((cat) => (
                          <div key={cat.head}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>{cat.head}</div>
                            {cat.items.map((item) => {
                              const itemKey = `${w.week_number}:${cat.head}:${item}`
                              const bought = boughtItems.has(itemKey)
                              return (
                                <div key={item} data-grocery-item={itemKey} onClick={() => toggleBought(itemKey)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: bought ? C.muted : C.inkSoft, padding: '2px 0', cursor: 'pointer' }}>
                                  <span data-grocery-icon-done style={{ display: bought ? 'inline-flex' : 'none', flexShrink: 0 }}><CheckCircle2 size={14} color={C.green} /></span>
                                  <span data-grocery-icon-undone style={{ display: bought ? 'none' : 'inline-flex', flexShrink: 0 }}><Circle size={14} color={C.muted} /></span>
                                  <span data-grocery-item-text style={{ textDecoration: bought ? 'line-through' : 'none' }}>{item}</span>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                      )
                    })()}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {careServices.length > 0 && (
        <div data-care-overlay onClick={() => setOpenCareService(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(44,36,24,0.55)', display: openCareService != null ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', background: C.paper, borderRadius: 16, padding: '24px 26px', maxWidth: 420, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <button data-care-close onClick={() => setOpenCareService(null)}
              style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
            {careServices.map((svc, i) => {
              const Icon = CARE_ICON_MAP[svc.icon] || Star
              return (
                <div key={i} data-care-body={i} style={{ display: openCareService === i ? 'block' : 'none' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 11, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <Icon size={22} color={C.accent} />
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, paddingRight: 20, marginBottom: 4 }}>{svc.name}</div>
                  {svc.sessions && <div style={{ fontSize: 12.5, color: C.accent, fontWeight: 700, marginBottom: 12 }}>{svc.sessions}</div>}
                  {svc.description && <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>{renderMarkdownBold(svc.description)}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 24px 64px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: C.accent, color: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontWeight: 700 }}>CLP</div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: C.muted }}>CLINIC LIVING PLUS</div>
          <div style={{ fontSize: 24, color: C.ink, marginTop: 8, fontWeight: 700 }}>Hi {firstName}, here&apos;s your plan</div>
          {editable ? (
            <div style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', marginTop: 10, textAlign: 'left' }}>
              <div style={editLabelStyle}>Goal (shown at the top)</div>
              <input style={editInputStyle} value={goalLabel} onChange={(e) => setGoalLabel(e.target.value)} placeholder="e.g. Steady energy, no more 4pm crashes" />
              <div style={{ ...editLabelStyle, marginTop: 14 }}>Plan look</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PALETTE_LIST.map((p) => (
                  <button key={p.id} onClick={() => setTheme(p.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                      border: theme === p.id ? `2px solid ${PALETTES[p.id].accent}` : `1px solid ${C.rule}`,
                      background: theme === p.id ? PALETTES[p.id].accentSoft : '#fff', fontSize: 12, fontWeight: 700, color: PALETTES[p.id].ink,
                    }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: PALETTES[p.id].accent, flexShrink: 0 }} />
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ ...editLabelStyle, marginTop: 14 }}>Template</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[{ id: 'classic', label: 'Classic' }, { id: 'almanac', label: 'Almanac' }, { id: 'pulse', label: 'Pulse' }, { id: 'onyx', label: 'Onyx' }].map((t) => (
                  <button key={t.id} onClick={() => setTemplate(t.id)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      border: template === t.id ? `2px solid ${C.accent}` : `1px solid ${C.rule}`,
                      background: template === t.id ? C.accentSoft : '#fff', color: C.ink,
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Changes only what the patient sees. You always edit here in Classic, regardless of which one is picked.</div>
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: C.inkSoft, marginTop: 6, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>{goalLabel}</div>
          )}
          {editable ? (
            <a href={`/dashboard/${roadmapId}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16, padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              <ExternalLink size={15} /> Preview as patient
            </a>
          ) : (
            <button onClick={downloadDashboard} data-no-export
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16, padding: '10px 20px', borderRadius: 10, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Download size={15} /> Download your plan
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 0 }}>
          {/* Founder's note — same letter as the PDF, personalized with name + goal */}
          <div id="founder" {...hiddenAttrs('founder')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('founder') }}>
            {editable && <SectionToggle hidden={isHidden('founder')} onToggle={() => toggleSection('founder')} />}
            <div style={sectionTitleStyle}>Founder&apos;s note</div>
            <p style={bulletStyle}>{firstName},</p>
            <p style={bulletStyle}>There are eleven people in this building who already know something about you.</p>
            <p style={bulletStyle}>Not just your name, though it&apos;s already underlined twice in your file. Someone has read the notes from your consult call. Someone already knows which foods actually excite you, the dish you&apos;d genuinely look forward to, not just tolerate. And if you&apos;ve already walked through our doors before today, one of us probably remembers exactly where you sat.</p>
            <p style={bulletStyle}>Your wellness coach said a small, quiet word to herself before she uploaded this document, the kind of thing she does for every plan, whether or not anyone ever finds out. Your doctor has already opened a new tab on her computer, right next to your history. It&apos;s empty for now. She&apos;s waiting to fill it with everything you&apos;re about to do.</p>
            <p style={bulletStyle}>Here&apos;s the part I want you to actually believe: we are genuinely excited for you. Not in the polite, clinical, thank-you-for-choosing-us way. In the way you&apos;d be excited watching someone you love finally get somewhere they&apos;ve been trying to reach for years. Every small win on the way to {asPhrase(goalLabel.toLowerCase())}, the first night you sleep straight through, the first craving that doesn&apos;t win, the first lab report that makes your doctor sit up a little straighter, somebody here is going to see it and quietly punch the air.</p>
            <p style={bulletStyle}>None of that is a metaphor. It&apos;s Tuesday-morning-huddle real.</p>
            <p style={bulletStyle}>A year before I started Clinic Living Plus, I was the patient across the table, asking a question and getting an answer that didn&apos;t hold up when I looked closer. That gap, between what people are told and what&apos;s actually true about their own body, is the entire reason this place exists.</p>
            <p style={bulletStyle}>So here&apos;s what I can promise: this document was not templated. A coach spent ninety real minutes listening to your actual life before a single recipe in here was chosen. What happens next is mostly on you. What happens around you, the noticing, the small adjustments, the quiet cheering at every step, has already begun.</p>
            <p style={bulletStyle}>Come find us when something in here surprises you. We&apos;d love to hear it.</p>
            <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: C.ink }}>Roshni Sanghvi</div>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.04em' }}>FOUNDER, CLINIC LIVING PLUS</div>
          </div>

          {/* Coach */}
          {(data.coach || editable) && (
            <div id="coach" {...hiddenAttrs('coach')} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('coach') }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, flexShrink: 0, background: data.coach?.photo_url ? `url(${data.coach.photo_url}) center/cover` : C.accentSoft, border: `1px solid ${C.rule}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {editable && <SectionToggle hidden={isHidden('coach')} onToggle={() => toggleSection('coach')} />}
                {editable ? (
                  <>
                    <div style={editLabelStyle}>Coach</div>
                    <select style={editInputStyle} value={nutritionistId} onChange={(e) => setNutritionistId(e.target.value)}>
                      <option value="">Select a coach</option>
                      {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </select>
                    <div style={{ fontSize: 11, color: C.muted, margin: '5px 0 10px' }}>Photo, designation and bio come from the coach&apos;s own profile, updates after you save.</div>
                    <textarea style={{ ...editInputStyle, resize: 'vertical' as const, lineHeight: 1.5, fontStyle: 'italic' }} rows={2}
                      value={coachQuote} onChange={(e) => setCoachQuote(e.target.value)}
                      placeholder={`Personal callback quote, e.g. "${firstName}, I remember what you said about..." or leave blank.`} />
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{data.coach?.full_name}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{data.coach?.designation}</div>
                    {coachQuote && <div style={{ fontSize: 13, color: C.accent, fontStyle: 'italic', marginTop: 6 }}>&ldquo;{renderMarkdownBold(coachQuote)}&rdquo;</div>}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Your care team — other providers beyond the primary coach
              (doctor, therapist, naturopath, etc.), each with their own
              intro and appointment. Coach-entered, empty by default; the
              whole section stays out of the DOM for a patient when there's
              nothing in it, same as the coach block above. */}
          {(careTeam.length > 0 || editable) && (
            <div id="careteam" {...hiddenAttrs('careteam')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('careteam') }}>
              {editable && <SectionToggle hidden={isHidden('careteam')} onToggle={() => toggleSection('careteam')} />}
              <div style={sectionTitleStyle}><Stethoscope size={18} color={C.accent} /> Your care team</div>
              {editable ? (
                <>
                  <p style={{ ...bulletStyle, color: C.muted, marginBottom: 14 }}>
                    Add anyone else on this patient&apos;s care team, a doctor, therapist, naturopath, or other specialist, with a short intro and their appointment.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
                    {careTeam.map((member, i) => (
                      <div key={i} style={{ border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px', background: C.bg }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 8 }}>
                          <div>
                            <div style={editLabelStyle}>Name</div>
                            <input style={editInputStyle} value={member.name} placeholder="e.g. Dr. Anita Rao" onChange={(e) => {
                              const next = [...careTeam]; next[i] = { ...member, name: e.target.value }; setCareTeam(next)
                            }} />
                          </div>
                          <div>
                            <div style={editLabelStyle}>Role</div>
                            <input style={editInputStyle} value={member.role} placeholder="e.g. Doctor, Therapist, Naturopath" onChange={(e) => {
                              const next = [...careTeam]; next[i] = { ...member, role: e.target.value }; setCareTeam(next)
                            }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={editLabelStyle}>Intro</div>
                          <textarea style={{ ...editInputStyle, resize: 'vertical' as const }} rows={2} value={member.intro}
                            placeholder="A short intro the patient will see, e.g. their specialty and how they fit into this plan."
                            onChange={(e) => { const next = [...careTeam]; next[i] = { ...member, intro: e.target.value }; setCareTeam(next) }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 8 }}>
                          <div>
                            <div style={editLabelStyle}>Appointment date</div>
                            <input style={editInputStyle} type="date" value={member.date}
                              onChange={(e) => { const next = [...careTeam]; next[i] = { ...member, date: e.target.value }; setCareTeam(next) }} />
                          </div>
                          <div>
                            <div style={editLabelStyle}>Time</div>
                            <input style={editInputStyle} type="time" value={member.time}
                              onChange={(e) => { const next = [...careTeam]; next[i] = { ...member, time: e.target.value }; setCareTeam(next) }} />
                          </div>
                          <div>
                            <div style={editLabelStyle}>Mode</div>
                            <select style={editInputStyle} value={member.mode}
                              onChange={(e) => { const next = [...careTeam]; next[i] = { ...member, mode: e.target.value }; setCareTeam(next) }}>
                              <option value="">Select</option>
                              <option value="In-person">In-person</option>
                              <option value="Virtual">Virtual</option>
                              <option value="In-person / Virtual">In-person / Virtual</option>
                            </select>
                          </div>
                        </div>
                        <button onClick={() => setCareTeam(careTeam.filter((_, idx) => idx !== i))}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#b4462f', fontSize: 12, fontWeight: 700, padding: 0 }}>
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setCareTeam([...careTeam, { name: '', role: '', intro: '', date: '', time: '', mode: '' }])}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={14} /> Add team member
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {careTeam.map((member, i) => (
                    <div key={i} style={{ border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px', background: C.bg }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{member.name}</div>
                      {member.role && <div style={{ fontSize: 12, color: C.muted, marginBottom: member.intro ? 6 : 0 }}>{member.role}</div>}
                      {member.intro && <p style={{ ...bulletStyle, marginBottom: member.date ? 8 : 0 }}>{renderMarkdownBold(member.intro)}</p>}
                      {member.date && (
                        <div style={{ fontSize: 12.5, color: C.accent, fontWeight: 700 }}>
                          <CalendarCheck size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                          {new Date(member.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          {member.time && ` · ${new Date(`2000-01-01T${member.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                          {member.mode && ` · ${member.mode}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* How to use this guide + Your why — one PDF page, kept together here too.
              Actually walks through this dashboard's real structure (roadmap
              drill-down, recipes, check-offs, download) instead of generic
              filler copy, so a patient opening this for the first time knows
              exactly where to look. */}
          <div id="howto" {...hiddenAttrs('howto')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('howto') }}>
            {editable && <SectionToggle hidden={isHidden('howto')} onToggle={() => toggleSection('howto')} />}
            <div style={sectionTitleStyle}>How to use this guide</div>
            <p style={{ ...bulletStyle, marginBottom: 16 }}>This page is built to be opened often, not read once and forgotten. Here&apos;s where everything lives:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {[
                { icon: MapPin, title: 'Your roadmap', text: 'Tap a month, then a week, to see that week’s goals day by day. Tap any day to expand it, and tap a meal slot to see the recipes picked for you.' },
                { icon: CheckCircle2, title: 'Check off as you go', text: 'Tap a goal each day you actually do it. It’s tracked under “Track your progress” below, so your coach can see real adherence before your next session, not a guess.' },
                { icon: ChefHat, title: 'Recipes update as you go', text: 'Matched to your notes and diet. If one looks off or missing, tell ' + coachFirst + ' rather than skipping it. New ones appear here automatically, no reprinting needed.' },
                { icon: Pill, title: 'Supplements, if any', text: 'A supplement table only shows up here once ' + coachFirst + ' has reviewed and confirmed it. If that section is empty, none is prescribed yet.' },
                { icon: HelpCircle, title: 'When in doubt, ask', text: 'If anything here feels unclear or off, reach ' + coachFirst + ' before improvising, that’s exactly what they’re there for.' },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} color={C.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55 }}>{text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div id="why" style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.rule}`, scrollMarginTop: SECTION_SCROLL_MARGIN }}>
              <div style={{ ...sectionTitleStyle, fontSize: 15, marginBottom: 10 }}>Your why</div>
              {editable ? (
                <textarea style={{ ...editInputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={3}
                  value={whyReflection} onChange={(e) => setWhyReflection(e.target.value)}
                  placeholder={`${firstName}, from what you shared with us...`} />
              ) : whyReflection ? (
                <p style={bulletStyle}>{firstName}, from what you shared with us: {renderMarkdownBold(whyReflection)}</p>
              ) : (
                <p style={{ ...bulletStyle, color: C.muted }}>Not filled in yet.</p>
              )}
            </div>
          </div>

          {/* Roadmap — a compact block per month; tap one to pop open its 4
              weeks (same checklist content as before, just not all on screen
              at once). Edit mode keeps the old always-expanded editor below,
              since the coach needs to see every field to edit it. */}
          <div id="roadmap" {...hiddenAttrs('roadmap')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('roadmap') }}>
            {editable && <SectionToggle hidden={isHidden('roadmap')} onToggle={() => toggleSection('roadmap')} />}
            <div style={sectionTitleStyle}><MapPin size={18} color={C.accent} /> Your roadmap</div>
            {months.length === 0 && <div style={{ fontSize: 13.5, color: C.muted }}>Not planned yet, check back once your coach generates your roadmap.</div>}
            {!editable && months.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                  {months.map((m) => {
                    const img = monthImages.get(String(m.monthNumber))
                    const goalCount = m.weeks.reduce((n, w) => n + (w.actions?.length ?? 0), 0)
                    return (
                      <button key={m.monthNumber} data-month-trigger={m.monthNumber} onClick={() => { setOpenMonth(m.monthNumber); setOpenWeek(null) }}
                        style={{ textAlign: 'left', padding: 0, border: `1px solid ${C.rule}`, borderRadius: 12, overflow: 'hidden', background: C.bg, cursor: 'pointer' }}>
                        {img ? (
                          <img src={img} alt={m.monthLabel} style={{ width: '100%', height: 84, objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: 84, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MapPin size={22} color={C.accent} />
                          </div>
                        )}
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{m.monthLabel}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Weeks {m.weekStart}–{m.weekEnd} · {goalCount} goals</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 12 }}>Tap a month to see its weekly goals and check off what you&apos;ve done.</div>
              </>
            )}
            {editable && months.length > 0 && (() => {
              const currentWeek = editingWeek ?? months[0]?.weeks[0]?.week_number ?? null
              return (
              <div style={{ ...cardStyle, background: C.bg, marginBottom: 16 }}>
                <div style={sectionTitleStyle}>Recipes for the week</div>
                <p style={{ ...bulletStyle, color: C.muted, marginBottom: 14 }}>
                  Pick which week you&apos;re curating, then check or uncheck recipes to set the exact bunch (4-5 recommended) shown to the patient for that week&apos;s slot. Each slot pre-checks the recipes auto-detected by tag/keyword match against this patient&apos;s concern and diet notes. Different weeks can have different recipes.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {months.flatMap((m) => m.weeks).map((w: WeeklyPlan) => (
                    <button key={w.week_number} onClick={() => setEditingWeek(w.week_number)}
                      style={{
                        padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        border: currentWeek === w.week_number ? `2px solid ${C.accent}` : `1px solid ${C.rule}`,
                        background: currentWeek === w.week_number ? C.accentSoft : C.paper, color: C.ink,
                      }}>
                      Week {w.week_number}
                    </button>
                  ))}
                </div>
                {currentWeek != null && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                    {DAY_MEAL_SLOTS.map((slot) => {
                      const allOptions = data.recipeBank.filter((r) => r.meal_type === slot)
                      const query = (recipeSearch[slot] || '').trim().toLowerCase()
                      const options = query ? allOptions.filter((r) => r.name.toLowerCase().includes(query)) : allOptions
                      const checkedIds = new Set(curatedSlotIds(slot, currentWeek))
                      return (
                        <div key={slot}>
                          <div style={editLabelStyle}>{SLOT_LABELS[slot]}</div>
                          {allOptions.length > 0 && (
                            <input
                              value={recipeSearch[slot] || ''}
                              onChange={(e) => setRecipeSearch((prev) => ({ ...prev, [slot]: e.target.value }))}
                              placeholder={`Search ${SLOT_LABELS[slot].toLowerCase()} recipes…`}
                              style={{ ...editInputStyle, marginBottom: 6, fontSize: 12.5 }}
                            />
                          )}
                          <div style={{ maxHeight: 180, overflowY: 'auto', border: `1px solid ${C.rule}`, borderRadius: 8, padding: '4px 10px', background: C.paper }}>
                            {allOptions.length === 0 && <div style={{ fontSize: 12, color: C.muted, padding: '8px 0' }}>No {SLOT_LABELS[slot].toLowerCase()} recipes in the bank yet.</div>}
                            {allOptions.length > 0 && options.length === 0 && <div style={{ fontSize: 12, color: C.muted, padding: '8px 0' }}>No matches for &quot;{recipeSearch[slot]}&quot;.</div>}
                            {options.map((r) => (
                              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12.5, color: C.ink, cursor: 'pointer' }}>
                                <input type="checkbox" checked={checkedIds.has(r.id)} onChange={(e) => {
                                  const base = curatedSlotIds(slot, currentWeek)
                                  const next = e.target.checked ? [...base, r.id] : base.filter((id) => id !== r.id)
                                  setWeeklyManualRecipes((prev) => ({ ...prev, [currentWeek]: { ...prev[currentWeek], [slot]: next } }))
                                }} />
                                {r.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              )
            })()}
            {editable && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {months.map((m) => (
                  <div key={m.monthNumber}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 10 }}>{m.monthLabel} · Weeks {m.weekStart}–{m.weekEnd}</div>
                    {m.weeks.map((w: WeeklyPlan) => (
                      <div key={w.week_number} style={{ border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10, background: C.bg }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 7 }}>Week {w.week_number}</div>
                        <div style={{ marginBottom: 7 }}>
                          <div style={editLabelStyle}>Focus / macro goal</div>
                          <input style={editInputStyle} value={w.focus_theme || ''} onChange={(e) => updateWeek(w.week_number, { focus_theme: e.target.value })} />
                        </div>
                        <div style={{ marginBottom: 7 }}>
                          <div style={editLabelStyle}>Micro goals (one per line)</div>
                          <textarea style={{ ...editInputStyle, resize: 'vertical' as const }} rows={3}
                            value={(w.actions || []).join('\n')} onChange={(e) => updateWeek(w.week_number, { actions: e.target.value.split('\n') })} />
                        </div>
                        <div>
                          <div style={editLabelStyle}>Success looks like</div>
                          <input style={editInputStyle} value={w.milestone || ''} onChange={(e) => updateWeek(w.week_number, { milestone: e.target.value })} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lifestyle guidelines */}
          {(editable || lifestyleBullets.length > 0) && (
            <div id="lifestyle" {...hiddenAttrs('lifestyle')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('lifestyle') }}>
              {editable && <SectionToggle hidden={isHidden('lifestyle')} onToggle={() => toggleSection('lifestyle')} />}
              <div style={sectionTitleStyle}><HeartPulse size={18} color={C.accent} /> Lifestyle guidelines</div>
              {heroImage && <img src={heroImage.image_url} alt={heroImage.label} style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }} />}
              {editable ? (
                <textarea style={{ ...editInputStyle, resize: 'vertical' as const, lineHeight: 1.6 }} rows={6}
                  value={lifestyleText} onChange={(e) => setLifestyleText(e.target.value)}
                  placeholder="• One lifestyle change per line, tied to something specific in their case" />
              ) : (
                lifestyleBullets.map((b, i) => <p key={i} style={bulletStyle}>• {renderMarkdownBold(b)}</p>)
              )}
            </div>
          )}

          {/* Nutrition guidelines — Power Plates, tabbed by meal (also covers
              "This week's recipes" — the PDF's separate recipe pages live
              inside each meal tab here instead) */}
          <div id="nutrition" {...hiddenAttrs('nutrition')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('nutrition') }}>
            {editable && <SectionToggle hidden={isHidden('nutrition')} onToggle={() => toggleSection('nutrition')} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
              <div style={sectionTitleStyle}><Utensils size={18} color={C.accent} /> Your power plates</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['breakfast', 'lunch', 'dinner'] as MealType[]).map((meal) => (
                  <button key={meal} data-meal-tab={meal} onClick={() => setActiveMeal(meal)}
                    style={{
                      padding: '8px 16px', borderRadius: 20, border: activeMeal === meal ? 'none' : `1px solid ${C.rule}`,
                      background: activeMeal === meal ? C.greenDeep : C.paper, color: activeMeal === meal ? '#fff' : C.ink,
                      fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                    }}>
                    {meal}
                  </button>
                ))}
              </div>
            </div>
            {(['breakfast', 'lunch', 'dinner'] as MealType[]).map((meal) => {
              const plate = FOOD_PLATES[meal]
              const recipes = mealMatches[meal]
              return (
                <div key={meal} id={`pp-${meal}`} style={{ display: activeMeal === meal ? '' : 'none' }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{plate.ratios}</div>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <MealWheel categories={plate.columns.map((c) => c.head)} label={meal} />
                    <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {plate.columns.map((col, i) => (
                        <div key={col.head}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{col.head}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {col.items.map((item) => (
                              <span key={item} style={{ fontSize: 12, color: C.ink, background: `${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}22`, border: `1px solid ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}55`, borderRadius: 14, padding: '4px 11px' }}>{item}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {recipes.length > 0 ? (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.rule}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Recipes for {meal}, picked for your plan</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {recipes.map((m) => {
                          const img = mealImages.get(m.recipe.id)
                          return (
                            <button key={m.recipe.id} data-recipe-trigger={m.recipe.id} onClick={() => setOpenRecipeId(m.recipe.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.rule}`, background: C.bg, cursor: 'pointer' }}>
                              {img ? (
                                <img src={img} alt={m.recipe.name} style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: 52, height: 52, borderRadius: 8, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ChefHat size={20} color={C.accent} /></div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{m.recipe.name}{m.recipe.protein_label ? ` · ${m.recipe.protein_label}` : ''}</div>
                                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.why}</div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.rule}`, fontSize: 12.5, color: C.muted }}>
                      Nothing in the recipe bank is tagged to match your specific concern or diet notes yet for {meal}, {coachFirst} will hand you a recipe fresh for this week instead.
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Superfood of the week */}
          <div id="superfood" {...hiddenAttrs('superfood')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('superfood') }}>
            {editable && <SectionToggle hidden={isHidden('superfood')} onToggle={() => toggleSection('superfood')} />}
            <div style={sectionTitleStyle}><Sparkles size={18} color={C.accent} /> Superfood of the week</div>
            {superfoodImage && <img src={superfoodImage.image_url} alt={superfoodImage.label} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 10, marginBottom: 12 }} />}
            <p style={bulletStyle}>{coachFirst} picks this fresh each week around what&apos;s in season and what&apos;s actually useful for where you are right now, rather than a fixed pick that goes stale.</p>
            <div style={{ fontSize: 11.5, color: C.muted }}>You&apos;ll get this alongside your recipes each week, with a short note on why it was chosen for you specifically.</div>
          </div>

          {/* Supplements — only the structured table from a coach-confirmed
              extracted prescription list (see ReportsTab.tsx's review step).
              Never shows unconfirmed/draft dosing data, and no free-text
              fallback — a table or nothing. */}
          <div id="supplements" {...hiddenAttrs('supplements')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('supplements') }}>
            {editable && <SectionToggle hidden={isHidden('supplements')} onToggle={() => toggleSection('supplements')} />}
            <div style={sectionTitleStyle}><Pill size={18} color={C.accent} /> Your supplement plan</div>
            {data.confirmedSupplements.length > 0 ? (
              <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: C.muted, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      <th style={{ padding: '4px 10px 8px 0' }}>Supplement</th>
                      <th style={{ padding: '4px 10px 8px 0' }}>Dose</th>
                      <th style={{ padding: '4px 10px 8px 0' }}>When to take</th>
                      <th style={{ padding: '4px 0 8px 0' }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.confirmedSupplements.map((s, i) => (
                      <Fragment key={i}>
                        <tr style={{ borderTop: `1px solid ${C.rule}` }}>
                          <td style={{ padding: '9px 10px 9px 0', fontWeight: 700, color: C.ink }}>{s.name}</td>
                          <td style={{ padding: '9px 10px 9px 0', color: C.ink }}>{s.dose}</td>
                          <td style={{ padding: '9px 10px 9px 0', color: C.ink }}>{s.timing}</td>
                          <td style={{ padding: '9px 0', color: C.ink }}>{s.duration}</td>
                        </tr>
                        {s.notes && (
                          <tr>
                            <td colSpan={4} style={{ padding: '0 0 9px 0', color: C.accent, fontSize: 11.5 }}>⚠ {s.notes}</td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={bulletStyle}>No supplements on file yet, {coachFirst} will add these once your plan calls for them.</p>
            )}
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>Don&apos;t start, stop, or change a dose without confirming with {coachFirst} first.</div>
          </div>

          {/* Grocery list — same recipe-derived items every week (recipes
              aren't assigned per specific week in this app), but broken out
              per week so buying/checking off resets fresh each week instead
              of one giant list for the whole plan. */}
          <div id="grocery" {...hiddenAttrs('grocery')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('grocery') }}>
            {editable && <SectionToggle hidden={isHidden('grocery')} onToggle={() => toggleSection('grocery')} />}
            <div style={sectionTitleStyle}><ShoppingCart size={18} color={C.accent} /> Your shopping list</div>
            <p style={{ ...bulletStyle, marginBottom: 12 }}>Pulled straight from the ingredients of your matched recipes. Pick a week below to see it and check items off as you buy them.</p>
            {months.length === 0 ? (
              <div style={{ fontSize: 13.5, color: C.muted }}>Not planned yet, check back once your coach generates your roadmap.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                {months.map((m) => (
                  <button key={m.monthNumber} data-grocery-month-trigger={m.monthNumber} onClick={() => { setOpenGroceryMonth(m.monthNumber); setOpenGroceryWeek(null) }}
                    style={{ textAlign: 'left', padding: '12px 14px', border: `1px solid ${C.rule}`, borderRadius: 12, background: C.bg, cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{m.monthLabel}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Weeks {m.weekStart}–{m.weekEnd}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Services — coach-entered tiles (icon + name + sessions), tap one
              to see the full detail in a popup. Editable mode lets the coach
              add/remove/edit each one, including how many sessions of it
              this specific patient has. Empty by default rather than
              generic filler copy — nothing shows until a coach adds one. */}
          <div id="services" {...hiddenAttrs('services')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('services') }}>
            {editable && <SectionToggle hidden={isHidden('services')} onToggle={() => toggleSection('services')} />}
            <div style={sectionTitleStyle}><Star size={18} color={C.accent} /> What&apos;s included in your care</div>
            {editable ? (
              <>
                <p style={{ ...bulletStyle, color: C.muted, marginBottom: 14 }}>
                  Add each service in this patient&apos;s plan, pick an icon, name it, and note how many sessions they have (e.g. &quot;4 sessions/month&quot;, &quot;Unlimited&quot;, &quot;As needed&quot;).
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
                  {careServices.map((svc, i) => (
                    <div key={i} style={{ border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px', background: C.bg }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 8 }}>
                        <div>
                          <div style={editLabelStyle}>Icon</div>
                          <select style={editInputStyle} value={svc.icon} onChange={(e) => {
                            const next = [...careServices]; next[i] = { ...svc, icon: e.target.value }; setCareServices(next)
                          }}>
                            {CARE_ICON_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={editLabelStyle}>Service name</div>
                          <input style={editInputStyle} value={svc.name} placeholder="e.g. 1:1 Nutrition Coaching" onChange={(e) => {
                            const next = [...careServices]; next[i] = { ...svc, name: e.target.value }; setCareServices(next)
                          }} />
                        </div>
                        <div>
                          <div style={editLabelStyle}>Sessions</div>
                          <input style={editInputStyle} value={svc.sessions} placeholder="e.g. 4 sessions/month" onChange={(e) => {
                            const next = [...careServices]; next[i] = { ...svc, sessions: e.target.value }; setCareServices(next)
                          }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={editLabelStyle}>Description (optional, shown when tapped)</div>
                        <textarea style={{ ...editInputStyle, resize: 'vertical' as const }} rows={2} value={svc.description || ''}
                          onChange={(e) => { const next = [...careServices]; next[i] = { ...svc, description: e.target.value }; setCareServices(next) }} />
                      </div>
                      <button onClick={() => setCareServices(careServices.filter((_, idx) => idx !== i))}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#b4462f', fontSize: 12, fontWeight: 700, padding: 0 }}>
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setCareServices([...careServices, { name: '', icon: CARE_ICON_OPTIONS[0].key, sessions: '', description: '' }])}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  <Plus size={14} /> Add service
                </button>
              </>
            ) : careServices.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                {careServices.map((svc, i) => {
                  const Icon = CARE_ICON_MAP[svc.icon] || Star
                  return (
                    <button key={i} data-care-trigger={i} onClick={() => setOpenCareService(i)}
                      style={{ textAlign: 'left', padding: '14px 12px', borderRadius: 12, border: `1px solid ${C.rule}`, background: C.bg, cursor: 'pointer' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                        <Icon size={17} color={C.accent} />
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{svc.name}</div>
                      {svc.sessions && <div style={{ fontSize: 11, color: C.muted }}>{svc.sessions}</div>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13.5, color: C.muted }}>Not filled in yet, {coachFirst} will add what&apos;s included in your plan here.</div>
            )}
          </div>

          {/* Track your progress — real data, not a filler table; always
              reachable from the top nav even before any check-ins exist.
              Both the empty-state message and the real content are always
              in the DOM (visibility toggled, never conditionally unmounted)
              so the downloaded export's renderProgressExport() has stable
              elements to update after every toggle, even starting from a
              fresh file with zero check-ins. */}
          <div id="track" {...hiddenAttrs('track')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('track') }}>
            {editable && <SectionToggle hidden={isHidden('track')} onToggle={() => toggleSection('track')} />}
            <div style={sectionTitleStyle}><CheckCircle2 size={18} color={C.accent} /> Track your progress</div>
            <p data-track-empty style={{ ...bulletStyle, color: C.muted, display: progress.totalDaysLogged === 0 ? 'block' : 'none' }}>
              No check-ins logged yet, tap a goal in your roadmap above each day you complete it, and your progress will show up here.
            </p>
            <div data-track-content style={{ display: progress.totalDaysLogged === 0 ? 'none' : 'block' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
                <StatCard dataStat="streak" icon={<Flame size={14} color={C.accent} />} value={progress.streak} label="day streak" color={C.accent} />
                <StatCard dataStat="days" icon={<CalendarCheck size={14} color={C.green} />} value={progress.totalDaysLogged} label="days logged, total" color={C.green} />
                <StatCard dataStat="goals" icon={<Target size={14} color={C.greenDeep} />} value={`${progress.goalsDone}/${progress.totalActionsInPlan}`} label="goals accomplished" color={C.greenDeep} />
                <StatCard dataStat="best" dataStatLabel="best" icon={<TrendingUp size={14} color={C.accent} />}
                  value={progress.bestMonth ? `${progress.bestMonth.pct}%` : '0%'}
                  label={progress.bestMonth ? `best month · ${progress.bestMonth.monthLabel}` : 'best month'} color={C.accent} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Goals completed by month</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                {progress.monthStats.map((m) => (
                  <ProgressRing key={m.monthNumber} monthNumber={m.monthNumber} pct={m.pct} label={m.monthLabel} sublabel={`${m.doneActions}/${m.totalActions} goals`}
                    color={m.pct >= 70 ? C.green : m.pct >= 35 ? C.accent : C.muted} />
                ))}
              </div>
            </div>
          </div>

          {/* When to reach us */}
          <div id="reach" {...hiddenAttrs('reach')} style={{ ...cardStyle, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('reach') }}>
            {editable && <SectionToggle hidden={isHidden('reach')} onToggle={() => toggleSection('reach')} />}
            <div style={sectionTitleStyle}><Phone size={18} color={C.accent} /> When to reach us</div>
            {editable ? (
              <div style={{ background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ ...weekBoxLabel, marginBottom: 10 }}>Next appointment</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div>
                    <div style={editLabelStyle}>Date</div>
                    <input style={editInputStyle} type="date" value={nextAppointment.date}
                      onChange={(e) => setNextAppointment({ ...nextAppointment, date: e.target.value })} />
                  </div>
                  <div>
                    <div style={editLabelStyle}>Time</div>
                    <input style={editInputStyle} type="time" value={nextAppointment.time}
                      onChange={(e) => setNextAppointment({ ...nextAppointment, time: e.target.value })} />
                  </div>
                  <div>
                    <div style={editLabelStyle}>Mode</div>
                    <select style={editInputStyle} value={nextAppointment.mode}
                      onChange={(e) => setNextAppointment({ ...nextAppointment, mode: e.target.value })}>
                      <option value="">Select</option>
                      <option value="In-person">In-person</option>
                      <option value="Virtual">Virtual</option>
                      <option value="In-person / Virtual">In-person / Virtual</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : nextAppointment.date ? (
              <div style={{ background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ ...weekBoxLabel, marginBottom: 6 }}><CalendarCheck size={13} color={C.accent} style={{ verticalAlign: -2, marginRight: 5 }} />Next appointment</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 10 }}>
                  {new Date(nextAppointment.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {nextAppointment.time && ` · ${new Date(`2000-01-01T${nextAppointment.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                  {nextAppointment.mode && ` · ${nextAppointment.mode}`}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: 'uppercase', marginBottom: 4 }}>Until your next appointment</div>
                <p style={{ ...bulletStyle, marginBottom: 6 }}>Please continue following your personalized plan as recommended. Keep track of any changes, questions, or concerns so they can be discussed during your next visit.</p>
                <p style={{ ...bulletStyle, marginBottom: 0 }}>If you experience any unexpected or worsening symptoms, have difficulty following your plan, or are unsure about any recommendations, please contact our team before your scheduled appointment.</p>
              </div>
            ) : (
              <div style={{ background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <p style={{ ...bulletStyle, marginBottom: 4 }}>Continue following your personalized care plan as recommended.</p>
                <p style={{ ...bulletStyle, marginBottom: 4 }}>Keep track of your progress and any questions or concerns.</p>
                <p style={{ ...bulletStyle, marginBottom: 4 }}>In a medical emergency, seek immediate emergency medical care.</p>
                <p style={{ ...bulletStyle, marginBottom: 0 }}>Contact our team if you need guidance or notice any unexpected changes in your health.</p>
              </div>
            )}
          </div>

          {/* FAQ */}
          <div id="faq" {...hiddenAttrs('faq')} style={{ ...cardStyle, marginBottom: 0, scrollMarginTop: SECTION_SCROLL_MARGIN, ...hiddenStyle('faq') }}>
            {editable && <SectionToggle hidden={isHidden('faq')} onToggle={() => toggleSection('faq')} />}
            <div style={sectionTitleStyle}><HelpCircle size={18} color={C.accent} /> Questions we hear most</div>
            {[
              ['What if I can’t finish everything on my plate exactly as shown?', 'Getting the food groups roughly right matters far more than hitting exact portions.'],
              ['What if I miss a few days on my habit tracker?', 'Log what actually happened, not what you wish had happened. An honest gap tells your coach more than a perfect-looking week.'],
              ['Can I eat something that’s not on the lists?', 'Yes, the lists are what to lean on, not a ban on everything else. Ask your coach if unsure.'],
            ].map(([q, a], i) => {
              const isOpen = openFaq === i
              return (
                <div key={i} style={{ borderBottom: i < 2 ? `1px solid ${C.rule}` : 'none' }}>
                  <button data-faq-trigger={i} onClick={() => setOpenFaq(isOpen ? null : i)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{q}</span>
                    {isOpen ? <ChevronDown size={16} color={C.muted} style={{ flexShrink: 0 }} /> : <ChevronRight size={16} color={C.muted} style={{ flexShrink: 0 }} />}
                  </button>
                  <div data-faq-body={i} style={{ display: isOpen ? 'block' : 'none', paddingBottom: 12 }}>
                    <div style={{ fontSize: 12.5, color: C.inkSoft }}>{a}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {editable && (
          <div style={{ position: 'sticky', bottom: 16, marginTop: 20, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '12px 16px', boxShadow: '0 4px 16px rgba(44,36,24,0.12)' }}>
            {saveError && <span style={{ fontSize: 12.5, color: '#b4462f' }}>{saveError}</span>}
            <button onClick={save} disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9, border: 'none', background: saved ? C.green : C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <Check size={14} /> : <Save size={14} />}
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: C.muted, marginTop: 24 }}>Clinic Living Plus Pvt Ltd™ · +91 72931 11120</div>
      </div>
    </div>
  )
}
