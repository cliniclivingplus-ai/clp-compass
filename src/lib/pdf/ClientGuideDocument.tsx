import { Fragment, type ReactElement } from 'react'
import { Document, View, Text, Image, StyleSheet, Svg, Rect, Circle, Path, Link } from '@react-pdf/renderer'
import { colors, font } from './theme'
import { PageShell, shared } from './PageShell'
import { reshapeRoadmapIntoQuarters, reshapeRoadmapIntoMonths, type WeeklyPlan } from './reshapeRoadmap'
import { parseNutritionistGuidelines } from './parseNutritionistGuidelines'
import { matchGuideImageDistinct, type GuideImage } from './matchGuideImage'
import { selectRecipesForPatient, type BankRecipe } from './matchRecipes'
import { splitRecipeLines } from '../recipeText'
import { cleanSourceTitle, sourceSearchUrl } from '../sourceLinks'

export type KbSource = { title: string; source_type: string; chunk_preview: string }

// The 4 recipe slots shown once per week in the roadmap's week view —
// exactly the recipe bank's own meal_type categories, no separate mapping.
export type DayMealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type Coach = {
  id: string
  full_name: string
  designation: string | null
  bio: string | null
  response_note: string | null
  photo_url: string | null
  email: string | null
}

export type GuideData = {
  patient: {
    full_name: string
    gender: string | null
    primary_concern: string | null
  }
  coach: Coach | null
  roadmap: {
    overview: string
    lifestyle_guidelines: string
    nutritionist_guidelines: string
    kb_sources: KbSource[]
    weekly_schedule: WeeklyPlan[]
    duration_months: number
  }
  goalLabel: string // short label for the cover, e.g. "Steady energy, no more 4pm crashes"
  whyReflection: string // "Your why" — mirrors the patient's own reflection back to them
  coachQuote: string // personalized callback line, grounded in a real transcript detail — empty if none found
  imageBank: GuideImage[] // coach-uploaded, tag-matched into sections that genuinely fit — never forced
  recipeBank: BankRecipe[] // coach-built recipes, tag/keyword-matched to this patient's real concern & diet notes
  manualRecipes: Partial<Record<DayMealSlot, string[]>> // legacy plan-wide curated recipe-id list per slot, from before per-week curation existed — kept as a fallback so old roadmaps don't lose a coach's picks
  weeklyManualRecipes: Record<number, Partial<Record<DayMealSlot, string[]>>> // coach's curated recipe-id list per slot, per week_number; when set for a week, replaces the auto-detected picks for that week+slot entirely
  theme: string // coach-picked color palette id for the live dashboard & downloaded plan — falls back to 'classic' if unset or unrecognized
  confirmedSupplements: { name: string; dose: string; timing: string; duration: string; notes: string }[] // from a patient_reports row a coach explicitly reviewed & confirmed — never shown pre-confirmation
}

const cover = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  logoText: { color: colors.paper, fontFamily: font.displayBold, fontSize: 17, letterSpacing: 0.5 },
  brand: { fontSize: 10, fontFamily: font.bodySemiBold, letterSpacing: 3.5, color: colors.muted, marginBottom: 44 },
  title: { fontFamily: font.displayBold, fontSize: 32, color: colors.ink, marginBottom: 20, textAlign: 'center' },
  rule: { width: 36, height: 1.5, backgroundColor: colors.accent, marginBottom: 20 },
  client: { fontSize: 14, fontFamily: font.bodyMedium, color: colors.ink, marginBottom: 22 },
  goal: { fontSize: 9.5, fontFamily: font.bodySemiBold, letterSpacing: 1.2, color: colors.muted, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 },
})

const toc = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    borderBottomWidth: 0.5, borderBottomColor: colors.rule,
    borderBottomStyle: 'dashed', paddingVertical: 9,
  },
  label: { fontSize: 10.5, fontFamily: font.bodyMedium, color: colors.ink },
  num: { fontSize: 10.5, fontFamily: font.displayBold, color: colors.accent },
})

const grid = StyleSheet.create({
  pieRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  pieSlice: { flex: 1, borderRadius: 6, padding: '8px 10px', alignItems: 'center' },
  pieNum: { fontFamily: font.display, fontSize: 15, color: colors.paper },
  pieLabel: { fontSize: 7.5, color: colors.paper, marginTop: 2, textAlign: 'center' },
  cols3: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  col: { flex: 1 },
  colHead: {
    fontSize: 8.5, letterSpacing: 0.6, color: colors.accent, fontFamily: font.bodyBold,
    borderBottomWidth: 1.5, borderBottomColor: colors.accent, paddingBottom: 4, marginBottom: 6,
  },
  colItem: { fontSize: 8.5, color: colors.ink, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: colors.rule },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: colors.rule },
  checkText: { fontSize: 8.5, color: colors.ink },
})

const tableStyles = StyleSheet.create({
  table: { marginTop: 8, marginBottom: 14 },
  headRow: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: colors.ink, paddingBottom: 6, marginBottom: 4 },
  th: { fontSize: 8, letterSpacing: 0.5, color: colors.muted, fontFamily: font.bodyBold },
  row: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: colors.rule },
  td: { fontSize: 9.5, color: colors.ink, lineHeight: 1.4 },
})

function FoodPlate({ title, ratios, columns }: {
  title: string
  ratios: { label: string; pct: string }[]
  columns: { head: string; items: string[] }[]
}) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={shared.section}>{title}</Text>
      <View style={grid.pieRow}>
        {ratios.map((r) => (
          <View key={r.label} style={{ ...grid.pieSlice, backgroundColor: colors.accent }}>
            <Text style={grid.pieNum}>{r.pct}</Text>
            <Text style={grid.pieLabel}>{r.label}</Text>
          </View>
        ))}
      </View>
      <View style={grid.cols3}>
        {columns.map((c) => (
          <View key={c.head} style={grid.col}>
            <Text style={grid.colHead}>{c.head}</Text>
            {c.items.map((item) => <Text key={item} style={grid.colItem}>{item}</Text>)}
          </View>
        ))}
      </View>
    </View>
  )
}

function parseBullets(text: string): string[] {
  return text
    .split(/\n|(?=•)/)
    .map((s) => s.replace(/^[•\-\s]+/, '').trim())
    .filter(Boolean)
}


// goalLabel is a complete, capitalized, period-terminated sentence (it's
// also used standalone on the cover) — this strips the trailing period so
// it reads correctly when spliced mid-sentence into the founder's note.
function asPhrase(sentence: string): string {
  return sentence.trim().replace(/\.+$/, '')
}

// ── Cover + TOC are handled separately in ClientGuideDocument (page 1-2 are
// always fixed length, so they don't need page-counting). Every other
// section below returns an array of <PageShell> elements and can be
// rendered standalone (for counting real page numbers) or as part of the
// full document — same content either way, since react-pdf's pagination
// only depends on content height within a fixed page size.

const signature = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20 },
  photoCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentSoft,
    borderWidth: 1, borderColor: colors.rule, alignItems: 'center', justifyContent: 'center',
  },
  photoLabel: { fontSize: 7, color: colors.muted, marginTop: 3 },
  name: { fontFamily: font.displayItalic, fontSize: 16, color: colors.ink },
  title: { fontSize: 8, letterSpacing: 1, color: colors.muted, marginTop: 2 },
})

// A simple line-drawn "image" glyph (mountain + sun) for the photo
// placeholder, since there's no real headshot to embed yet.
function PhotoPlaceholder() {
  return (
    <View style={signature.photoCircle}>
      <Svg width={20} height={16} viewBox="0 0 24 24">
        <Rect x="2" y="3" width="20" height="16" rx="2" stroke={colors.accent} strokeWidth={1.4} fill="none" />
        <Circle cx="8" cy="9" r="1.6" stroke={colors.accent} strokeWidth={1.2} fill="none" />
        <Path d="M4 17l5-5 4 4 3-3 4 4" stroke={colors.accent} strokeWidth={1.4} fill="none" />
      </Svg>
      <Text style={signature.photoLabel}>photo</Text>
    </View>
  )
}

// A drawn checkbox square, not the "☐" character — that glyph isn't in the
// embedded font's coverage, so fontkit was substituting its .notdef glyph
// (rendered as a stray "&"-looking mark) everywhere it appeared.
function CheckboxSquare() {
  return (
    <Svg width={8} height={8} viewBox="0 0 8 8">
      <Rect x="0.5" y="0.5" width="7" height="7" rx="1" stroke={colors.muted} strokeWidth={0.8} fill="none" />
    </Svg>
  )
}

function founderPages(data: GuideData): ReactElement[] {
  const firstName = data.patient.full_name.split(' ')[0]
  const goal = asPhrase(data.goalLabel.toLowerCase())
  return [
    <PageShell key="founder" eyebrow={"FOUNDER'S\nNOTE"}>
      <Text style={shared.title}>{firstName},</Text>
      <Text style={shared.p}>There are eleven people in this building who already know something about you.</Text>
      <Text style={shared.p}>
        Not just your name — though it&apos;s already underlined twice in your file. Someone has read the
        notes from your consult call. Someone already knows which foods actually excite you, the dish
        you&apos;d genuinely look forward to, not just tolerate. And if you&apos;ve already walked through
        our doors before today, one of us probably remembers exactly where you sat.
      </Text>
      <Text style={shared.p}>
        Your wellness coach said a small, quiet word to herself before she uploaded this document — the
        kind of thing she does for every plan, whether or not anyone ever finds out. Your doctor has
        already opened a new tab on her computer, right next to your history. It&apos;s empty for now.
        She&apos;s waiting to fill it with everything you&apos;re about to do.
      </Text>
      <Text style={shared.p}>
        Here&apos;s the part I want you to actually believe: we are genuinely excited for you. Not in the
        polite, clinical, thank-you-for-choosing-us way. In the way you&apos;d be excited watching someone
        you love finally get somewhere they&apos;ve been trying to reach for years. Every small win on the
        way to {goal} — the first night you sleep straight through, the first craving that doesn&apos;t
        win, the first lab report that makes your doctor sit up a little straighter — somebody here is
        going to see it and quietly punch the air.
      </Text>
      <Text style={shared.p}>None of that is a metaphor. It&apos;s Tuesday-morning-huddle real.</Text>
      <Text style={shared.p}>
        A year before I started Clinic Living Plus, I was the patient across the table, asking a question
        and getting an answer that didn&apos;t hold up when I looked closer. That gap — between what
        people are told and what&apos;s actually true about their own body — is the entire reason this
        place exists.
      </Text>
      <Text style={shared.p}>
        So here&apos;s what I can promise: this document was not templated. A coach spent ninety real
        minutes listening to your actual life before a single recipe in here was chosen. What happens next
        is mostly on you. What happens around you — the noticing, the small adjustments, the quiet
        cheering at every step — that part has already begun.
      </Text>
      <Text style={shared.p}>Come find us when something in here surprises you. We&apos;d love to hear it.</Text>

      <View style={signature.row}>
        <PhotoPlaceholder />
        <View>
          <Text style={signature.name}>Roshni Sanghvi</Text>
          <Text style={signature.title}>FOUNDER, CLINIC LIVING PLUS</Text>
        </View>
      </View>
    </PageShell>,
  ]
}

const coachStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 20 },
  text: { flex: 1 },
  designation: { fontSize: 9, letterSpacing: 0.6, color: colors.muted, marginBottom: 14 },
  quote: { fontSize: 11, fontFamily: font.displayItalic, color: colors.accent, lineHeight: 1.5, marginBottom: 14 },
  photoBox: {
    width: 120, height: 110, borderRadius: 8, backgroundColor: colors.accentSoft,
    borderWidth: 1, borderColor: colors.rule, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  photo: { width: 120, height: 110, borderRadius: 8 },
  photoLabel: { fontSize: 7.5, color: colors.muted, marginTop: 4 },
})

function CoachPhotoBox({ photoUrl }: { photoUrl: string | null }) {
  if (photoUrl) return <Image src={photoUrl} style={coachStyles.photo} />
  return (
    <View style={coachStyles.photoBox}>
      <Svg width={22} height={18} viewBox="0 0 24 24">
        <Rect x="2" y="3" width="20" height="16" rx="2" stroke={colors.accent} strokeWidth={1.4} fill="none" />
        <Circle cx="8" cy="9" r="1.6" stroke={colors.accent} strokeWidth={1.2} fill="none" />
        <Path d="M4 17l5-5 4 4 3-3 4 4" stroke={colors.accent} strokeWidth={1.4} fill="none" />
      </Svg>
      <Text style={coachStyles.photoLabel}>coach photo</Text>
    </View>
  )
}

function coachPages(data: GuideData): ReactElement[] {
  const coach = data.coach
  const coachName = coach?.full_name || 'Your coach'
  const firstNameOfCoach = coachName.split(' ')[0]
  return [
    <PageShell key="coach" eyebrow={"MEET YOUR\nCOACH"}>
      <View style={coachStyles.row}>
        <View style={coachStyles.text}>
          <Text style={shared.title}>{coachName}</Text>
          <Text style={coachStyles.designation}>{(coach?.designation || 'Nutrition Coach').toUpperCase()}</Text>
          {data.coachQuote && <Text style={coachStyles.quote}>&ldquo;{data.coachQuote}&rdquo;</Text>}
          <Text style={shared.p}>
            {coach?.bio || `${firstNameOfCoach} works directly with you on this plan, adjusting week to week based on what's actually happening in your life.`}
          </Text>
          {coach?.response_note && (
            <Text style={{ fontSize: 9, color: colors.muted, marginTop: 6 }}>{coach.response_note}</Text>
          )}
        </View>
        <CoachPhotoBox photoUrl={coach?.photo_url ?? null} />
      </View>
    </PageShell>,
  ]
}

function howToUsePages(data: GuideData): ReactElement[] {
  const firstName = data.patient.full_name.split(' ')[0]
  return [
    <PageShell key="howto" eyebrow={"HOW TO USE\nTHIS GUIDE"}>
      <Text style={shared.title}>How to use this guide</Text>
      <Text style={shared.p}>Read once, keep it handy. Your roadmap and coach intro won&apos;t change — everything else is designed to be flipped back to often.</Text>
      <Text style={shared.p}>Recipes and weekly targets refresh as your plan progresses. You&apos;ll always get the newest version from your coach — no need to reprint the whole guide.</Text>
      <Text style={shared.p}>Never guess — ask. If something feels off or unclear, reach your coach before improvising. That&apos;s what they&apos;re there for.</Text>

      <Text style={shared.section}>Your why</Text>
      <View style={shared.box}>
        <Text style={shared.p}>{firstName}, from what you shared with us:</Text>
        <Text style={shared.p}>{data.whyReflection}</Text>
      </View>
    </PageShell>,
  ]
}

const quarterCardStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  card: {
    flex: 1, borderWidth: 1, borderColor: colors.rule, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', backgroundColor: colors.paper,
  },
  cardDone: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  num: { fontFamily: font.display, fontSize: 20, color: colors.accent },
  numMuted: { color: colors.muted },
  label: { fontSize: 7.5, letterSpacing: 0.6, color: colors.muted, marginTop: 2 },
  goal: { fontSize: 7, color: colors.inkSoft, marginTop: 2, textAlign: 'center', paddingHorizontal: 4 },
  arrow: { fontSize: 12, color: colors.muted, marginHorizontal: 6 },
})

function QuarterCardRow({ quarters }: { quarters: ReturnType<typeof reshapeRoadmapIntoQuarters> }) {
  return (
    <View style={quarterCardStyles.row}>
      {quarters.map((q, i) => (
        <Fragment key={q.label}>
          <View style={{ ...quarterCardStyles.card, ...(q.planned ? quarterCardStyles.cardDone : {}) }}>
            <Text style={{ ...quarterCardStyles.num, ...(q.planned ? {} : quarterCardStyles.numMuted) }}>{String(i + 1).padStart(2, '0')}</Text>
            <Text style={quarterCardStyles.label}>{q.label.toUpperCase()}</Text>
            <Text style={quarterCardStyles.goal}>{q.planned ? q.macroGoal.slice(0, 40) : 'Not yet planned'}</Text>
          </View>
          {i < quarters.length - 1 && <Text style={quarterCardStyles.arrow}>→</Text>}
        </Fragment>
      ))}
    </View>
  )
}

function roadmapPages(data: GuideData): ReactElement[] {
  const quarters = reshapeRoadmapIntoQuarters(data.roadmap.weekly_schedule)
  const months = reshapeRoadmapIntoMonths(data.roadmap.weekly_schedule)
  const biomarkers = parseNutritionistGuidelines(data.roadmap.nutritionist_guidelines).biomarkers
  // One dedup set shared across every month in the whole roadmap section, so
  // the same photo doesn't turn up on 12 different weeks in a row.
  const usedFoodImages = new Set<string>()
  const monthBlock = (m: ReturnType<typeof reshapeRoadmapIntoMonths>[number]) => {
    const keyMetric = biomarkers.length > 0 ? biomarkers[(m.monthNumber - 1) % biomarkers.length] : 'Rechecked with your coach at the end of this month.'
    const last = m.weeks[m.weeks.length - 1]
    const macroGoal = last?.focus_theme || 'Not yet planned — will be scoped with your coach in a future cycle.'
    const microGoals = m.weeks.flatMap((w) => w.actions ?? []).slice(0, 4)
    const successLooksLike = last?.milestone || 'Rechecked with your coach at the end of this month.'
    const weeksWithMenu = m.weeks.filter((w) => w.food_menu?.trim())
    return (
      // wrap={false}: keep the whole month card together as one block — never
      // split the box border/background mid-bullet-list across a page boundary.
      // If it doesn't fit in the remaining space, react-pdf moves the entire
      // card to the next page instead of orphaning half of it.
      <View key={m.monthNumber} style={{ marginBottom: 14 }} wrap={false}>
        <Text style={shared.section}>{m.monthLabel} · Weeks {m.weekStart}–{m.weekEnd}</Text>
        <View style={{ ...shared.box, opacity: m.planned ? 1 : 0.75 }}>
          <Text style={shared.boxLabel}>MACRO GOAL</Text>
          <Text style={shared.p}>{macroGoal}</Text>
          {m.planned && (
            <>
              <Text style={shared.boxLabel}>MICRO GOALS</Text>
              {microGoals.map((g, i) => <Text key={i} style={shared.p}>· {g}</Text>)}
              <Text style={shared.boxLabel}>KEY METRIC</Text>
              <Text style={shared.p}>{keyMetric}</Text>
              <Text style={shared.boxLabel}>SUCCESS LOOKS LIKE</Text>
              <Text style={shared.p}>{successLooksLike}</Text>
              {weeksWithMenu.length > 0 && (
                <>
                  <Text style={shared.boxLabel}>WEEKLY FOOD MENU</Text>
                  {weeksWithMenu.map((w) => {
                    const menuImage = matchGuideImageDistinct(`${w.focus_theme} ${w.food_menu}`, data.imageBank, usedFoodImages)
                    return (
                      <View key={w.week_number} style={{ marginBottom: 6 }}>
                        <Text style={shared.p}>Week {w.week_number}: {w.food_menu}</Text>
                        {menuImage && <Image src={menuImage.image_url} style={{ width: 90, height: 60, objectFit: 'cover', borderRadius: 4, marginTop: 3 }} />}
                      </View>
                    )
                  })}
                </>
              )}
            </>
          )}
        </View>
      </View>
    )
  }
  // Only print quarters that actually have generated content — a shorter
  // plan (e.g. 3 months) should show months 1-3 and stop, not months 1-3
  // followed by three pages of grayed-out "not yet planned" filler.
  const plannedQuarterIdxs = [0, 1, 2, 3].filter((idx) => months.slice(idx * 3, idx * 3 + 3).some((m) => m.planned))
  const plannedQuarters = quarters.filter((_, i) => plannedQuarterIdxs.includes(i))
  const firstPlannedQuarterIdx = plannedQuarterIdxs[0] ?? 0
  const quarterPage = (quarterIdx: number): ReactElement => {
    const q = quarters[quarterIdx]
    const quarterMonths = months.slice(quarterIdx * 3, quarterIdx * 3 + 3).filter((m) => m.planned)
    return (
      <PageShell key={`roadmap-q${quarterIdx + 1}`} eyebrow={quarterIdx === firstPlannedQuarterIdx ? "YOUR 12-MONTH\nROADMAP" : `YOUR 12-MONTH ROADMAP ·\n${q.label.toUpperCase()}`}>
        {quarterIdx === firstPlannedQuarterIdx && (
          <>
            <Text style={shared.title}>Your 12-month roadmap</Text>
            <QuarterCardRow quarters={plannedQuarters} />
          </>
        )}
        <Text style={{ ...shared.section, marginBottom: 10 }}>{q.label} · {q.monthRange}</Text>
        {quarterMonths.map(monthBlock)}
      </PageShell>
    )
  }
  return plannedQuarterIdxs.map(quarterPage)
}

function lifestylePages(data: GuideData): ReactElement[] {
  const bullets = parseBullets(data.roadmap.lifestyle_guidelines)
  const heroImage = matchGuideImageDistinct(data.roadmap.lifestyle_guidelines, data.imageBank, new Set())
  return [
    <PageShell key="lifestyle1" eyebrow={"LIFESTYLE\nGUIDELINES"}>
      <Text style={shared.title}>Lifestyle guidelines</Text>
      <Text style={shared.dek}>Built from your consult — each change below is tied to something specific in your case, not general advice.</Text>
      {heroImage && <Image src={heroImage.image_url} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 14 }} />}
      {bullets.slice(0, 2).map((bullet, i) => (
        <View key={i} style={{ marginBottom: 14 }}>
          <Text style={shared.p}>{bullet}</Text>
        </View>
      ))}
    </PageShell>,
    <PageShell key="lifestyle2" eyebrow={"LIFESTYLE GUIDELINES ·\nCONTINUED"}>
      {bullets.slice(2).map((bullet, i) => (
        <View key={i} style={{ marginBottom: 14 }}>
          <Text style={shared.p}>{bullet}</Text>
        </View>
      ))}
      {data.roadmap.kb_sources.length > 0 && (
        <View style={shared.box}>
          <Text style={shared.boxLabel}>GROUNDED IN</Text>
          {data.roadmap.kb_sources.map((s, i) => (
            <Link key={i} src={sourceSearchUrl(s.title, s.source_type)}>
              <Text style={{ ...shared.p, color: colors.accent, textDecoration: 'underline' }}>· {cleanSourceTitle(s.title)}</Text>
            </Link>
          ))}
        </View>
      )}
    </PageShell>,
  ]
}

function nutritionPages(): ReactElement[] {
  return [
    <PageShell key="nutrition1" eyebrow={"NUTRITION\nGUIDELINES"}>
      <Text style={shared.title}>Nutrition guidelines</Text>
      <FoodPlate
        title="Breakfast"
        ratios={[{ label: 'Fruit', pct: '40%' }, { label: 'Whole grains', pct: '30%' }, { label: 'Protein', pct: '30%' }]}
        columns={[
          { head: 'FRUIT', items: ['Apple', 'Banana', 'Papaya', 'Pear', 'Orange', 'Berries', 'Pomegranate', 'Kiwi'] },
          { head: 'WHOLE GRAINS', items: ['Oats', 'Whole wheat', 'Barley', 'Brown rice', 'Ragi', 'Jowar', 'Quinoa', 'Buckwheat'] },
          { head: 'PROTEIN', items: ['Almonds', 'Walnuts', 'Brazil nuts', 'Chia seeds', 'Flaxseeds', 'Pumpkin seeds', 'Tofu', 'Soy milk'] },
        ]}
      />
    </PageShell>,
    <PageShell key="nutrition2" eyebrow={"NUTRITION GUIDELINES ·\nCONTINUED"}>
      <FoodPlate
        title="Lunch"
        ratios={[{ label: 'Vegetables', pct: '40%' }, { label: 'Grains/millets', pct: '30%' }, { label: 'Lentils/protein', pct: '30%' }]}
        columns={[
          { head: 'VEGETABLES', items: ['Broccoli', 'Cauliflower', 'Kale', 'Cabbage', 'Spinach', 'Beet leaves', 'Celery', 'Watercress'] },
          { head: 'GRAINS/MILLETS', items: ['Brown rice', 'Quinoa', 'Ragi', 'Jowar', 'Bajra', 'Foxtail millet', 'Barley', 'Oats'] },
          { head: 'LENTILS/PROTEIN', items: ['Moong dal', 'Masoor dal', 'Chana', 'Toor dal', 'Rajma', 'Tofu', 'Tempeh', 'Hummus'] },
        ]}
      />
    </PageShell>,
    <PageShell key="nutrition3" eyebrow={"NUTRITION GUIDELINES ·\nCONTINUED"}>
      <FoodPlate
        title="Dinner"
        ratios={[{ label: 'Vegetables', pct: '40%' }, { label: 'Grains/millets', pct: '30%' }, { label: 'Lentils/protein', pct: '30%' }]}
        columns={[
          { head: 'VEGETABLES', items: ['Cruciferous veg', 'Mushroom', 'Zucchini', 'Bell pepper', 'Pumpkin', 'Ridge gourd', 'Bottle gourd', 'Asparagus'] },
          { head: 'GRAINS/MILLETS', items: ['Quinoa', 'Buckwheat', 'Amaranth', 'Millet roti', 'Foxtail millet', 'Barley', 'Jowar roti', 'Brown rice'] },
          { head: 'LENTILS/PROTEIN', items: ['Lentil soup', 'Tofu', 'Tempeh', 'Moong salad', 'Masoor dal', 'Chickpea', 'Edamame', 'Sprouts'] },
        ]}
      />
    </PageShell>,
  ]
}

function recipesPages(data: GuideData): ReactElement[] {
  const coachName = data.coach?.full_name || 'your coach'
  const firstName = data.patient.full_name?.split(' ')[0] || 'You'
  const parsed = parseNutritionistGuidelines(data.roadmap.nutritionist_guidelines)
  const selection = selectRecipesForPatient(
    { primaryConcern: data.patient.primary_concern || '', dietProtocol: parsed.dietProtocol },
    data.recipeBank
  )
  const allMatches = [...selection.breakfast, ...selection.lunch, ...selection.dinner]
  const usedImages = new Set<string>()

  // No real match beats a fabricated one — if nothing in the recipe bank
  // genuinely fits this patient's concern or diet notes, say so plainly
  // instead of printing recipes that aren't actually relevant to them.
  if (allMatches.length === 0) {
    return [
      <PageShell key="recipes" eyebrow={"THIS WEEK'S\nRECIPES"}>
        <Text style={shared.title}>This week&apos;s recipes</Text>
        <Text style={shared.dek}>Nothing in the recipe bank is tagged to match {firstName}&apos;s specific concern or diet notes yet — rather than print something generic, {coachName.split(' ')[0]} will hand you a recipe card chosen fresh for this week instead.</Text>
        <View style={shared.box}>
          <Text style={shared.boxLabel}>BUILD YOUR PLATE FROM</Text>
          <Text style={shared.p}>Use the food lists on pages 10–12 as your building blocks — any combination that hits the plate ratios shown works.</Text>
        </View>
      </PageShell>,
    ]
  }

  const recipeCard = (m: ReturnType<typeof selectRecipesForPatient>['breakfast'][number]) => {
    const img = matchGuideImageDistinct(`${m.recipe.name} ${m.recipe.tags.join(' ')}`, data.imageBank, usedImages)
    return (
      <View key={m.recipe.id} style={{ marginBottom: 16 }}>
        {/* Title + image kept as their own small atomic block — a
            percentage-width Image inside the same wrap={false} block as a
            long text box was measuring its background height before the
            image resolved, so the text rendered past the box's bottom edge.
            Splitting them into separate blocks (and using a fixed pixel
            width instead of '100%') avoids that mismeasurement. */}
        <View wrap={false}>
          <Text style={shared.section}>{m.recipe.name}{m.recipe.protein_label ? ` · ${m.recipe.protein_label}` : ''}</Text>
          {img && <Image src={img.image_url} style={{ width: 500, height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />}
        </View>
        <View style={shared.box} wrap={false}>
          <Text style={shared.boxLabel}>WHY THIS ONE</Text>
          <Text style={shared.p}>{m.why}</Text>
          <Text style={shared.boxLabel}>INGREDIENTS</Text>
          {splitRecipeLines(m.recipe.ingredients).map((line, i) => <Text key={i} style={shared.p}>· {line}</Text>)}
          <Text style={shared.boxLabel}>METHOD</Text>
          {splitRecipeLines(m.recipe.steps).map((line, i) => <Text key={i} style={shared.p}>{i + 1}. {line}</Text>)}
        </View>
      </View>
    )
  }

  return [
    <PageShell key="recipes" eyebrow={"THIS WEEK'S\nRECIPES"}>
      <Text style={shared.title}>This week&apos;s recipes</Text>
      <Text style={shared.dek}>Picked specifically for {firstName}&apos;s plan — matched to your concern and diet notes, not a generic list.</Text>
      {allMatches.map(recipeCard)}
    </PageShell>,
  ]
}

function superfoodPages(data: GuideData): ReactElement[] {
  const coachName = data.coach?.full_name || 'your coach'
  const image = matchGuideImageDistinct('superfood nutrition weekly pick seasonal', data.imageBank, new Set())
  return [
    <PageShell key="superfood" eyebrow={"SUPERFOOD OF\nTHE WEEK"}>
      <Text style={shared.title}>Superfood of the week</Text>
      <Text style={shared.dek}>{coachName.split(' ')[0]} picks this fresh each week around what&apos;s in season and what&apos;s actually useful for where you are right now — rather than print one fixed pick here that goes stale the week after.</Text>
      {image && <Image src={image.image_url} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 14 }} />}
      <View style={shared.box}>
        <Text style={shared.boxLabel}>YOU&apos;LL GET THIS</Text>
        <Text style={shared.p}>Alongside your recipe card each week, with a short note on why it was chosen for you specifically.</Text>
      </View>
    </PageShell>,
  ]
}

const GROCERY_CATEGORIES: { head: string; items: string[] }[] = [
  { head: 'FRUIT', items: ['Apple', 'Banana', 'Papaya', 'Pear', 'Orange', 'Berries', 'Pomegranate', 'Kiwi'] },
  { head: 'VEGETABLES', items: ['Broccoli', 'Cauliflower', 'Kale', 'Cabbage', 'Spinach', 'Bell pepper', 'Pumpkin', 'Zucchini', 'Mushroom', 'Ridge gourd', 'Bottle gourd', 'Asparagus'] },
  { head: 'GRAINS & MILLETS', items: ['Oats', 'Brown rice', 'Ragi', 'Jowar', 'Bajra', 'Quinoa', 'Buckwheat', 'Amaranth', 'Foxtail millet', 'Barley'] },
  { head: 'LENTILS & PROTEIN', items: ['Moong dal', 'Masoor dal', 'Chana', 'Toor dal', 'Rajma', 'Tofu', 'Tempeh', 'Edamame', 'Sprouts', 'Hummus'] },
  { head: 'NUTS & SEEDS', items: ['Almonds', 'Walnuts', 'Brazil nuts', 'Chia seeds', 'Flaxseeds', 'Pumpkin seeds'] },
  { head: 'OTHER', items: ['Soy milk', 'Whole wheat'] },
]

function groceryPages(data: GuideData): ReactElement[] {
  return [
    <PageShell key="grocery1" eyebrow={"GROCERY\nLIST"}>
      <Text style={shared.title}>Your shopping list</Text>
      <Text style={shared.dek}>Pulled straight from your nutrition guidelines on pages 10–12 — buy what you need, skip what&apos;s already in the kitchen.</Text>
      <View style={grid.cols3}>
        {GROCERY_CATEGORIES.slice(0, 3).map((c) => (
          <View key={c.head} style={grid.col}>
            <Text style={grid.colHead}>{c.head}</Text>
            {c.items.map((item) => (
              <View key={item} style={grid.checkRow}>
                <CheckboxSquare />
                <Text style={grid.checkText}>{item}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </PageShell>,
    <PageShell key="grocery2" eyebrow={"GROCERY LIST ·\nCONTINUED"}>
      <View style={grid.cols3}>
        {GROCERY_CATEGORIES.slice(3).map((c) => (
          <View key={c.head} style={grid.col}>
            <Text style={grid.colHead}>{c.head}</Text>
            {c.items.map((item) => (
              <View key={item} style={grid.checkRow}>
                <CheckboxSquare />
                <Text style={grid.checkText}>{item}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={shared.box}>
        <Text style={shared.boxLabel}>PERSONALIZE THIS LIST</Text>
        <Text style={shared.p}>Cross out anything you&apos;re allergic to or can&apos;t source locally, and check with {data.coach?.full_name?.split(' ')[0] || 'your coach'} before swapping anything out.</Text>
      </View>
    </PageShell>,
  ]
}

function supplementsPages(data: GuideData): ReactElement[] {
  const parsed = parseNutritionistGuidelines(data.roadmap.nutritionist_guidelines)
  return [
    <PageShell key="supplements1" eyebrow="SUPPLEMENTS">
      <Text style={shared.title}>Your supplement plan</Text>
      <Text style={shared.dek}>Prescribed by your care team after reviewing your case — not a general recommendation. Don&apos;t start, stop, or change a dose without confirming with {data.coach?.full_name?.split(' ')[0] || 'your coach'} first.</Text>
      {parsed.supplements.length > 0 ? (
        // Full bullets, not a Name/Dose/Why table — the AI's phrasing varies
        // run to run (dose sometimes inline, sometimes parenthetical, and a
        // naive regex split once mislabeled a target-range note as the dose,
        // which is a real safety risk in a supplement instruction).
        parsed.supplements.map((s, i) => <Text key={i} style={shared.p}>· {s}</Text>)
      ) : (
        <View style={shared.box}><Text style={shared.p}>No supplements on file yet — your coach will add these once your plan calls for them.</Text></View>
      )}
      <View style={shared.box}>
        <Text style={shared.boxLabel}>BEFORE YOU START</Text>
        <Text style={shared.p}>Take with food unless told otherwise. If you notice any new symptom after starting something on this list, message your coach the same day — don&apos;t wait for your next session.</Text>
      </View>
    </PageShell>,
    <PageShell key="supplements2" eyebrow={"SUPPLEMENTS ·\nCONTINUED"}>
      <Text style={shared.section}>What gets rechecked</Text>
      <Text style={shared.dek}>This plan is reviewed alongside your labs — supplements get added, adjusted, or dropped as your markers move.</Text>
      {parsed.biomarkers.length > 0 ? (
        parsed.biomarkers.map((b, i) => <Text key={i} style={shared.p}>· {b}</Text>)
      ) : (
        <Text style={shared.p}>Your coach will confirm which markers to track based on your case.</Text>
      )}
      <View style={shared.box}><Text style={shared.p}>Space for your coach&apos;s notes on this plan.</Text></View>
    </PageShell>,
  ]
}

function servicesPages(data: GuideData): ReactElement[] {
  return [
    <PageShell key="services" eyebrow="SERVICES">
      <Text style={shared.title}>What&apos;s included in your care</Text>
      <Text style={shared.dek}>Everything you&apos;re currently enrolled in, plus what&apos;s available if you want more support.</Text>
      <View style={shared.box}>
        <Text style={shared.p}>{data.coach?.full_name?.split(' ')[0] || 'Your coach'} will walk you through what&apos;s included in your plan and any optional add-ons during your next session.</Text>
      </View>
    </PageShell>,
  ]
}

function trackProgressPages(data: GuideData): ReactElement[] {
  const quarters = reshapeRoadmapIntoQuarters(data.roadmap.weekly_schedule)
  return [
    <PageShell key="track1" eyebrow={"TRACK YOUR\nPROGRESS"}>
      <Text style={shared.title}>The big picture, quarter by quarter</Text>
      <Text style={shared.dek}>Your weekly habit tracking catches the day-to-day. This page catches the shift underneath it — filled in with your coach at the end of each quarter.</Text>
      <View style={tableStyles.table}>
        <View style={tableStyles.headRow}>
          <Text style={{ ...tableStyles.th, flex: 1.4 }}>METRIC</Text>
          {quarters.map((q) => <Text key={q.label} style={{ ...tableStyles.th, flex: 1, textAlign: 'center' }}>{q.label}</Text>)}
        </View>
        {['Weight / measurements', 'Energy (1–10)', 'Sleep quality (1–10)', 'Primary symptom', 'Key lab marker'].map((metric) => (
          <View key={metric} style={tableStyles.row}>
            <Text style={{ ...tableStyles.td, flex: 1.4, fontFamily: font.bodyBold }}>{metric}</Text>
            {quarters.map((q) => <Text key={q.label} style={{ ...tableStyles.td, flex: 1, textAlign: 'center', color: colors.muted }}>—</Text>)}
          </View>
        ))}
      </View>
    </PageShell>,
    <PageShell key="track2" eyebrow={"TRACK YOUR PROGRESS ·\nCONTINUED"}>
      <Text style={shared.section}>Monthly check-in</Text>
      <Text style={shared.p}>Three questions, two minutes, once a month — this is what your coach reads before your next call.</Text>
      {['What felt easiest this month?', 'What did you keep skipping, and why?', 'One thing you noticed in your body that you didn’t expect.'].map((q, i) => (
        <View key={i} style={{ marginBottom: 18 }}>
          <Text style={{ ...shared.p, fontFamily: font.bodyBold, marginBottom: 6 }}>{q}</Text>
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: colors.rule, height: 22 }} />
        </View>
      ))}
    </PageShell>,
  ]
}

function whenToReachPages(data: GuideData): ReactElement[] {
  const parsed = parseNutritionistGuidelines(data.roadmap.nutritionist_guidelines)
  const coachFirst = data.coach?.full_name?.split(' ')[0] || 'your coach'
  return [
    <PageShell key="reach1" eyebrow={"WHEN TO\nREACH US"}>
      <Text style={shared.title}>Not everything can wait for your next session</Text>
      <Text style={shared.dek}>Here&apos;s how to know what&apos;s urgent, and where to send it.</Text>
      {parsed.redFlags.length > 0 && (
        <View style={{ ...shared.box, marginBottom: 16 }}>
          <Text style={shared.boxLabel}>SAME DAY — SPECIFIC TO YOUR PLAN</Text>
          {parsed.redFlags.map((f, i) => <Text key={i} style={shared.p}>· {f}</Text>)}
        </View>
      )}
      <View style={tableStyles.table}>
        <View style={tableStyles.headRow}>
          <Text style={{ ...tableStyles.th, flex: 1 }}>WHEN</Text>
          <Text style={{ ...tableStyles.th, flex: 2.5 }}>WHAT TO DO</Text>
        </View>
        <View style={tableStyles.row}>
          <Text style={{ ...tableStyles.td, flex: 1, fontFamily: font.bodyBold }}>Within a day</Text>
          <Text style={{ ...tableStyles.td, flex: 2.5 }}>A question about a supplement, food, or your plan — message {coachFirst} directly.</Text>
        </View>
        <View style={tableStyles.row}>
          <Text style={{ ...tableStyles.td, flex: 1, fontFamily: font.bodyBold }}>Next session</Text>
          <Text style={{ ...tableStyles.td, flex: 2.5 }}>General progress, motivation, or &quot;how am I doing&quot; — save it for your next call.</Text>
        </View>
      </View>
    </PageShell>,
    <PageShell key="reach2" eyebrow={"WHEN TO REACH US ·\nCONTINUED"}>
      <View style={shared.box}>
        <Text style={shared.boxLabel}>IF THIS IS AN EMERGENCY</Text>
        <Text style={shared.p}>This guide and your coach are not equipped for emergencies. Chest pain, difficulty breathing, fainting, or anything that feels life-threatening — go to your nearest emergency room or call your local emergency number first. Tell us after, once you&apos;re safe.</Text>
      </View>
      <Text style={shared.section}>Every other way to reach us</Text>
      <View style={tableStyles.table}>
        <View style={tableStyles.headRow}>
          <Text style={{ ...tableStyles.th, flex: 1.2 }}>CHANNEL</Text>
          <Text style={{ ...tableStyles.th, flex: 2 }}>RESPONSE TIME</Text>
        </View>
        <View style={tableStyles.row}>
          <Text style={{ ...tableStyles.td, flex: 1.2, fontFamily: font.bodyBold }}>{coachFirst}{data.coach?.email ? ` (${data.coach.email})` : ''}</Text>
          <Text style={{ ...tableStyles.td, flex: 2 }}>{data.coach?.response_note || 'Ask your coach for their typical response time.'}</Text>
        </View>
        <View style={tableStyles.row}>
          <Text style={{ ...tableStyles.td, flex: 1.2, fontFamily: font.bodyBold }}>+91 72931 11120</Text>
          <Text style={{ ...tableStyles.td, flex: 2 }}>Booking, billing, urgent — during clinic hours.</Text>
        </View>
      </View>
    </PageShell>,
  ]
}

function faqPages(): ReactElement[] {
  const items: [string, string][] = [
    ['What if I can’t finish everything on my plate exactly as shown?', 'The percentages on pages 10–12 are a guide, not a rulebook. Getting the food groups roughly right matters far more than hitting exact portions.'],
    ['What if I miss a few days on my habit tracker?', 'Log what actually happened, not what you wish had happened — an honest gap tells your coach more than a perfect-looking week.'],
    ['Can I eat something that’s not on the lists in this guide?', 'Yes — the lists are what to lean on, not a ban on everything else. Ask your coach if you’re unsure about something specific.'],
    ['What happens at the end of each quarter?', 'Your key metrics get rechecked, your supplement plan is reviewed, and your roadmap for the next quarter is set together with your coach.'],
  ]
  return [
    <PageShell key="faq" eyebrow="FAQ">
      <Text style={shared.title}>Questions we hear most</Text>
      {items.map(([q, a], i) => (
        <View key={i} style={{ marginBottom: 16 }}>
          <Text style={{ ...shared.p, fontFamily: font.display, fontSize: 12.5, marginBottom: 4 }}>{q}</Text>
          <Text style={{ ...shared.p, color: colors.inkSoft }}>{a}</Text>
        </View>
      ))}
    </PageShell>,
  ]
}

// Ordered list of body sections (everything after the cover + TOC). One
// section can carry multiple TOC labels pointing at the same start page
// (e.g. "How to use this guide" and "Your why" share one page).
export const GUIDE_SECTIONS: {
  key: string
  tocLabels: string[]
  render: (data: GuideData) => ReactElement[]
}[] = [
  { key: 'founder', tocLabels: ['Founder’s note'], render: founderPages },
  { key: 'coach', tocLabels: ['Meet your coach'], render: coachPages },
  { key: 'howto', tocLabels: ['How to use this guide', 'Your why'], render: howToUsePages },
  { key: 'roadmap', tocLabels: ['Your 12-month roadmap'], render: roadmapPages },
  { key: 'lifestyle', tocLabels: ['Lifestyle guidelines'], render: lifestylePages },
  { key: 'nutrition', tocLabels: ['Nutrition guidelines'], render: nutritionPages },
  { key: 'recipes', tocLabels: ['This week’s recipes'], render: recipesPages },
  { key: 'superfood', tocLabels: ['Superfood of the week'], render: superfoodPages },
  { key: 'grocery', tocLabels: ['Grocery list'], render: groceryPages },
  { key: 'supplements', tocLabels: ['Supplements'], render: supplementsPages },
  { key: 'services', tocLabels: ['Services'], render: servicesPages },
  { key: 'track', tocLabels: ['Track your progress'], render: trackProgressPages },
  { key: 'reach', tocLabels: ['When to reach us'], render: whenToReachPages },
  { key: 'faq', tocLabels: ['FAQ'], render: faqPages },
]

export function ClientGuideDocument({
  data,
  tocPageNumbers,
}: {
  data: GuideData
  // Real starting page number per section key, computed by a first pass that
  // measures each section standalone (see renderGuideDocument.ts). Falls
  // back to blank if not supplied — used only by the internal counting pass.
  tocPageNumbers?: Record<string, number>
}) {
  const tocEntries: [string, number | ''][] = []
  for (const section of GUIDE_SECTIONS) {
    const pageNum = tocPageNumbers?.[section.key] ?? ''
    for (const label of section.tocLabels) tocEntries.push([label, pageNum])
  }

  return (
    <Document title={`${data.patient.full_name} — CLP Wellness Guide`}>
      {/* PAGE 1 — COVER */}
      <PageShell eyebrow="">
        <View style={cover.wrap}>
          <View style={cover.logo}><Text style={cover.logoText}>CLP</Text></View>
          <Text style={cover.brand}>CLINIC LIVING PLUS</Text>
          <Text style={cover.title}>Your wellness guide</Text>
          <View style={cover.rule} />
          <Text style={cover.client}>{data.patient.full_name}</Text>
          <Text style={cover.goal}>GOAL: {data.goalLabel.toUpperCase()}</Text>
        </View>
      </PageShell>

      {/* PAGE 2 — TABLE OF CONTENTS */}
      <PageShell eyebrow={"TABLE OF\nCONTENTS"}>
        <Text style={shared.title}>Table of contents</Text>
        {tocEntries.map(([label, num], i) => (
          <View style={toc.row} key={`${label}-${i}`}>
            <Text style={toc.label}>{label}</Text>
            <Text style={toc.num}>{num}</Text>
          </View>
        ))}
      </PageShell>

      {GUIDE_SECTIONS.flatMap((section) => section.render(data))}
    </Document>
  )
}
