// Shared vanilla-JS "offline brain" for the downloaded static HTML of the
// two inline-expansion templates (Almanac, Pulse) — both use the IDENTICAL
// data-* attribute contract listed below, so one generator serves both
// rather than duplicating ~200 lines of interaction logic per template.
// Classic (DashboardClient.tsx) has its own separate, larger version of this
// because it additionally has day-view/slot-view popups and a serving-size
// scaler that these two templates don't.
//
// Contract (all elements must already exist in the DOM, just hidden via
// `display:none` — never conditionally unmounted, or a collapsed section
// would be missing entirely from the downloaded snapshot):
//   data-month-trigger / data-month-body        (value: monthNumber)
//   data-week-trigger  / data-week-body          (value: week_number)
//   data-recipe-trigger / data-recipe-body       (value: recipe id)
//   data-grocery-month-trigger / data-grocery-month-body   (value: monthNumber)
//   data-grocery-week-trigger  / data-grocery-week-body    (value: week_number)
//   data-meal-trigger / data-meal-body           (value: meal type)
//   data-faq-trigger / data-faq-body             (value: index)
//   data-care-trigger / data-care-body           (value: index)
//   data-toc-trigger / data-toc-panel / data-toc-link   (jump-to-section dropdown)
//   data-goal-toggle="week:action" data-goal-icon-done / data-goal-icon-undone / data-goal-text
//   data-grocery-item="week:category:item" data-grocery-icon-done / data-grocery-icon-undone / data-grocery-item-text
//   data-stat-pct="monthNumber" data-stat-sub="monthNumber"   (Track your progress per-month numbers)
//   data-stat="streak|days|goals|best" data-stat-label="best"
//   data-track-empty / data-track-content

type MonthExportData = { monthNumber: number; monthLabel: string; weeks: { week_number: number; totalActions: number }[] }

export function buildInlineExportScript(opts: {
  roadmapId: string
  monthsData: MonthExportData[]
  colors: { ink: string; inkSoft: string; muted: string; accent: string; accentSoft: string; border: string; onAccent: string }
}): string {
  const { roadmapId, monthsData, colors: C } = opts
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
var CLP_GROCERY_KEY = 'clp-grocery-' + CLP_ROADMAP_ID + '-' + CLP_DOWNLOAD_ID;
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
function clpSetText(sel, val){ var el = document.querySelector(sel); if (el) el.textContent = val; }

// ── table-of-contents dropdown ──
function clpToggleToc(){
  var panel = document.querySelector('[data-toc-panel]');
  if (!panel) return;
  panel.style.display = (panel.style.display === 'grid') ? 'none' : 'grid';
}
function clpCloseToc(){
  var panel = document.querySelector('[data-toc-panel]');
  if (panel) panel.style.display = 'none';
}

// ── single-open-at-a-time groups (month/week/recipe/grocery-month/grocery-week) ──
function clpSetPillActive(el, active){
  if (!el) return;
  el.style.border = active ? '1px solid ${C.accent}' : '1px solid ${C.border}';
  el.style.background = active ? '${C.accentSoft}' : 'transparent';
}
function clpToggleGroup(triggerAttr, bodyAttr, id, onOpen){
  var body = document.querySelector('[' + bodyAttr + '="' + id + '"]');
  var isOpen = body && body.style.display === 'block';
  document.querySelectorAll('[' + bodyAttr + ']').forEach(function(el){ el.style.display = 'none'; });
  document.querySelectorAll('[' + triggerAttr + ']').forEach(function(el){ clpSetPillActive(el, false); });
  if (!isOpen && body) {
    body.style.display = 'block';
    clpSetPillActive(document.querySelector('[' + triggerAttr + '="' + id + '"]'), true);
  }
  if (onOpen) onOpen(!isOpen);
}
function clpCloseGroup(bodyAttr, triggerAttr){
  document.querySelectorAll('[' + bodyAttr + ']').forEach(function(el){ el.style.display = 'none'; });
  if (triggerAttr) document.querySelectorAll('[' + triggerAttr + ']').forEach(function(el){ clpSetPillActive(el, false); });
}
function clpToggleMonth(id){ clpToggleGroup('data-month-trigger', 'data-month-body', id, function(){ clpCloseGroup('data-week-body', 'data-week-trigger'); clpCloseGroup('data-recipe-body'); }); }
function clpToggleWeek(id){ clpToggleGroup('data-week-trigger', 'data-week-body', id, function(){ clpCloseGroup('data-recipe-body'); }); }
function clpToggleRecipe(id){ clpToggleGroup('data-recipe-trigger', 'data-recipe-body', id); }
function clpToggleGroceryMonth(id){ clpToggleGroup('data-grocery-month-trigger', 'data-grocery-month-body', id, function(){ clpCloseGroup('data-grocery-week-body', 'data-grocery-week-trigger'); }); }
function clpToggleGroceryWeek(id){ clpToggleGroup('data-grocery-week-trigger', 'data-grocery-week-body', id); }

// ── accordion groups (faq/care) — same single-open-at-a-time behavior, no pill restyle ──
function clpToggleAccordion(triggerAttr, bodyAttr, id){
  var body = document.querySelector('[' + bodyAttr + '="' + id + '"]');
  var isOpen = body && body.style.display === 'block';
  document.querySelectorAll('[' + bodyAttr + ']').forEach(function(el){ el.style.display = 'none'; });
  document.querySelectorAll('[' + triggerAttr + '] svg').forEach(function(el){ el.style.transform = ''; });
  if (!isOpen && body) {
    body.style.display = 'block';
    var trig = document.querySelector('[' + triggerAttr + '="' + id + '"] svg');
    if (trig) trig.style.transform = 'rotate(90deg)';
  }
}
function clpToggleFaq(id){ clpToggleAccordion('data-faq-trigger', 'data-faq-body', id); }
function clpToggleCare(id){ clpToggleAccordion('data-care-trigger', 'data-care-body', id); }

// ── meal tab (always 3-way, one active) ──
function clpSetMealTab(meal){
  document.querySelectorAll('[data-meal-body]').forEach(function(el){
    el.style.display = (el.getAttribute('data-meal-body') === meal) ? 'block' : 'none';
  });
  document.querySelectorAll('[data-meal-trigger]').forEach(function(el){
    var active = el.getAttribute('data-meal-trigger') === meal;
    el.style.background = active ? '${C.accent}' : 'transparent';
    el.style.color = active ? '${C.onAccent}' : '${C.ink}';
    el.style.border = active ? 'none' : '1px solid ${C.border}';
  });
}

// ── grocery "bought" checklist — personal, localStorage only, same key/shape as the live page ──
function clpGetBought(){
  try { return JSON.parse(localStorage.getItem(CLP_GROCERY_KEY) || '[]'); } catch(e) { return []; }
}
function clpSetGroceryVisual(el, bought){
  var doneIcon = el.querySelector('[data-grocery-icon-done]');
  var undoneIcon = el.querySelector('[data-grocery-icon-undone]');
  var text = el.querySelector('[data-grocery-item-text]');
  if (doneIcon) doneIcon.style.display = bought ? 'inline-flex' : 'none';
  if (undoneIcon) undoneIcon.style.display = bought ? 'none' : 'inline-flex';
  if (text) { text.style.textDecoration = bought ? 'line-through' : 'none'; text.style.color = bought ? '${C.muted}' : '${C.inkSoft}'; }
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

// ── goal check-off — personal, localStorage only, never synced back to the app ──
function clpSetGoalVisual(el, done){
  var doneIcon = el.querySelector('[data-goal-icon-done]');
  var undoneIcon = el.querySelector('[data-goal-icon-undone]');
  var text = el.querySelector('[data-goal-text]');
  if (doneIcon) doneIcon.style.display = done ? 'inline-flex' : 'none';
  if (undoneIcon) undoneIcon.style.display = done ? 'none' : 'inline-flex';
  if (text) { text.style.textDecoration = done ? 'line-through' : 'none'; text.style.color = done ? '${C.muted}' : '${C.inkSoft}'; }
}
function toggleGoalExport(key, el){
  var parts = key.split(':');
  var week = parseInt(parts[0], 10), action = parseInt(parts[1], 10);
  var dateStr = clpTodayISO();
  var list = clpGetCheckins();
  var idx = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].week_number === week && list[i].action_index === action && list[i].checkin_date === dateStr) { idx = i; break; }
  }
  var done;
  if (idx >= 0) { list.splice(idx, 1); done = false; }
  else { list.push({ week_number: week, action_index: action, checkin_date: dateStr }); done = true; }
  clpSetCheckins(list);
  clpSetGoalVisual(el, done);
  renderProgressExport();
}
function initGoalsExport(){
  var list = clpGetCheckins();
  var today = clpTodayISO();
  var doneSet = {};
  list.forEach(function(c){ if (c.checkin_date === today) doneSet[c.week_number + ':' + c.action_index] = true; });
  document.querySelectorAll('[data-goal-toggle]').forEach(function(el){
    clpSetGoalVisual(el, !!doneSet[el.getAttribute('data-goal-toggle')]);
  });
}

// Recomputes every number in "Track your progress" straight from the
// current checkin list — same derivation the live React page does, so a
// toggle anywhere in the downloaded file is reflected everywhere else in
// that same file, not just on the row that was clicked.
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
    clpSetText('[data-stat-pct="' + m.monthNumber + '"]', pct + '%');
    clpSetText('[data-stat-sub="' + m.monthNumber + '"]', done + '/' + total + ' goals');
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

  var adherencePct = totalActionsInPlan > 0 ? Math.round((goalsDone / totalActionsInPlan) * 100) : 0;
  clpUpdateHero(adherencePct, goalsDone, totalActionsInPlan);
}

// Updates whichever hero centerpiece is present in this template's DOM
// (Almanac's growing tree, Pulse's adherence ring, or Onyx's signature bar)
// so it reflects the same real numbers "Track your progress" just did.
// Every selector is null-checked because only one of these three hooks
// exists in any given downloaded file — the other two are simply absent.
var CLP_GROWTH_LABELS = ['Just planted', 'First sprout', 'Taking root', 'Growing strong', 'In full bloom'];
function clpStageForPct(pct){ return pct >= 85 ? 4 : pct >= 60 ? 3 : pct >= 35 ? 2 : pct >= 10 ? 1 : 0; }
function clpUpdateHero(pct, goalsDone, totalActionsInPlan){
  document.querySelectorAll('[data-goals-done]').forEach(function(el){ el.textContent = goalsDone; });

  // Almanac: pre-rendered tree stages, toggle which one is visible
  var treeStages = document.querySelectorAll('[data-tree-stage]');
  if (treeStages.length) {
    var stage = clpStageForPct(pct);
    treeStages.forEach(function(el){
      el.style.display = (el.getAttribute('data-tree-stage') === String(stage)) ? 'block' : 'none';
    });
    var caption = document.querySelector('[data-growth-caption]');
    if (caption && totalActionsInPlan > 0) {
      caption.textContent = CLP_GROWTH_LABELS[stage] + ' · ' + goalsDone + '/' + totalActionsInPlan + ' goals tracked';
    }
  }

  // Pulse: circular ring — read its own radius so the math always matches
  // however the circle was actually drawn, rather than hardcoding size.
  var ringFill = document.querySelector('[data-ring-fill]');
  if (ringFill) {
    var r = parseFloat(ringFill.getAttribute('r'));
    var circumference = 2 * Math.PI * r;
    ringFill.setAttribute('stroke-dasharray', String(circumference));
    ringFill.setAttribute('stroke-dashoffset', String(circumference * (1 - pct / 100)));
    var ringText = document.querySelector('[data-ring-pct-text]');
    if (ringText) ringText.textContent = pct + '%';
  }

  // Onyx: thin fill bar + position dot + large percentage
  var barFill = document.querySelector('[data-bar-fill]');
  if (barFill) {
    barFill.style.width = pct + '%';
    var barDot = document.querySelector('[data-bar-dot]');
    if (barDot) barDot.style.left = pct + '%';
    var pctText = document.querySelector('[data-pct-text]');
    if (pctText) pctText.textContent = pct;
  }
}

initGroceryExport();
initGoalsExport();
renderProgressExport();
`
}
