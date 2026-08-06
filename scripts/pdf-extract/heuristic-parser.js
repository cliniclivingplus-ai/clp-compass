// Deterministic recipe parser — no AI. Every Canva-template PDF sampled
// this project uses the exact same page layout: a title line (name,
// optionally "N servings" and "N minutes"), then a literal two-column
// header ("ingredients" ... "directions"/"instructions"), then the
// ingredient list and steps in fixed left/right columns. `pdftotext
// -layout` preserves that column spacing as whitespace gaps, so this can
// be split back apart with plain string logic — no LLM call needed for
// the large majority of recipe pages, freeing the AI fallback for the
// genuinely irregular ones (routines, guideline pages, anything that
// doesn't match this shape).
const WATERMARK_RE = /roshnisanghvi|clinic\s*living|^[^a-z0-9]*$/i
const ANCHOR_RE = /ingredients/i
const ANCHOR_RIGHT_RE = /directions|instructions/i
const SERVINGS_RE = /(\d[\d\-–—\s]*servings?)/i
const TIME_RE = /(\d[\d\-–—\s]*(?:min(?:ute)?s?|hrs?|hours?))/i

function findAnchors(lines) {
  const anchors = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (ANCHOR_RE.test(line) && ANCHOR_RIGHT_RE.test(line)) {
      const dirMatch = line.match(ANCHOR_RIGHT_RE)
      anchors.push({ lineIndex: i, directionColStart: dirMatch.index })
    }
  }
  return anchors
}

function findTitle(lines, beforeIndex) {
  for (let i = beforeIndex - 1; i >= 0 && i >= beforeIndex - 6; i--) {
    const line = lines[i].trim()
    if (!line || WATERMARK_RE.test(line)) continue
    const servingsMatch = line.match(SERVINGS_RE)
    const timeMatch = line.match(TIME_RE)
    // Name = everything before the first big gap (where servings/time
    // usually starts), or the whole line if there's no gap.
    const gapSplit = line.match(/^(.*?)(?:\s{2,})(\S.*)$/)
    const name = (gapSplit ? gapSplit[1] : line).trim()
    if (!name || name.length < 2 || name.length > 80) continue
    return { name, servings: servingsMatch ? servingsMatch[1].trim() : null, time: timeMatch ? timeMatch[1].trim() : null }
  }
  return null
}

function splitColumns(lines, startIndex, endIndex, directionColStart) {
  const ingredients = []
  const directions = []
  const rowSplits = [] // { leadingSpaces, left, right, rightStart } | { leadingSpaces, text }
  // Pass 1: split every line that has its own clear 2+-space gap — that
  // gap position is a much more reliable column boundary per-row than the
  // header's word position, since header text rarely lines up exactly
  // with the data columns below it.
  for (let i = startIndex; i < endIndex; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue
    const leadingSpaces = raw.length - raw.trimStart().length
    const gapMatch = raw.match(/^(.*?)(?:\s{2,})(\S.*)$/)
    if (gapMatch && gapMatch[1].trim() && gapMatch[2].trim()) {
      rowSplits.push({ leadingSpaces, left: gapMatch[1].trim(), right: gapMatch[2].trim(), rightStart: raw.indexOf(gapMatch[2], gapMatch[1].length) })
    } else {
      rowSplits.push({ leadingSpaces, text: raw.trim() })
    }
  }
  // Column boundary for no-gap continuation lines: midpoint between the
  // observed left-column start (usually 0) and right-column start.
  const rightStarts = rowSplits.filter((r) => r.rightStart != null).map((r) => r.rightStart)
  const typicalRightStart = rightStarts.length ? rightStarts.sort((a, b) => a - b)[Math.floor(rightStarts.length / 2)] : directionColStart
  const threshold = typicalRightStart / 2
  for (const row of rowSplits) {
    if (row.left) {
      ingredients.push(row.left)
      directions.push(row.right)
    } else if (row.leadingSpaces >= threshold) {
      directions.push(row.text)
    } else {
      ingredients.push(row.text)
    }
  }
  return { ingredients, directions }
}

// A second, less common template: "Ingredients" and "Instructions" as their
// own standalone lines (stacked vertically, not a two-column header), with
// an occasional right-hand sidebar blurb ("Love this recipe? Share it...")
// floating next to the recipe text at a wide gap — safe to discard since it
// is never the ingredient/instruction text itself.
const STACKED_ING_RE = /^\s*ingredients\s*:?\s*(?:serves?\s*[-:]?\s*\d+.*)?$/i
const STACKED_INSTR_RE = /^\s*instructions\s*:?\s*$/i

function leftOnly(line) {
  const trimmed = line.trim()
  const m = trimmed.match(/^(\S.*?)(?:\s{3,})\S.*$/)
  return m ? m[1].trim() : trimmed
}

function findStackedAnchors(lines) {
  const anchors = []
  for (let i = 0; i < lines.length; i++) {
    if (STACKED_ING_RE.test(lines[i])) anchors.push({ type: 'ing', lineIndex: i })
    else if (STACKED_INSTR_RE.test(lines[i])) anchors.push({ type: 'instr', lineIndex: i })
  }
  return anchors
}

function findStackedTitle(lines, beforeIndex) {
  const titleLines = []
  for (let i = beforeIndex - 1; i >= 0 && i >= beforeIndex - 4; i--) {
    const raw = leftOnly(lines[i])
    if (!raw) { if (titleLines.length) break; continue }
    if (WATERMARK_RE.test(raw) || /love this recipe|share it online/i.test(raw)) { if (titleLines.length) break; continue }
    titleLines.unshift(raw)
  }
  const name = titleLines.join(' ').trim()
  return name && name.length >= 2 && name.length <= 100 ? { name } : null
}

function parseStackedTemplate(lines) {
  const anchors = findStackedAnchors(lines)
  const results = []
  for (let a = 0; a < anchors.length; a++) {
    if (anchors[a].type !== 'ing') continue
    const instr = anchors[a + 1]
    if (!instr || instr.type !== 'instr') continue
    const title = findStackedTitle(lines, anchors[a].lineIndex)
    if (!title) continue
    const nextBoundary = a + 2 < anchors.length ? anchors[a + 2].lineIndex : lines.length
    const ingredients = lines.slice(anchors[a].lineIndex + 1, instr.lineIndex).map(leftOnly).filter(Boolean)
    const directions = lines.slice(instr.lineIndex + 1, nextBoundary).map(leftOnly).filter((l) => l && !WATERMARK_RE.test(l) && !/love this recipe|share it online/i.test(l))
    if (ingredients.length === 0 || directions.length === 0) continue
    results.push({ name: title.name, ingredients: ingredients.join('\n'), steps: directions.join('\n') })
  }
  return results
}

// Returns [{ name, servings, prep_time, ingredients, directions }] for a
// single page's raw text, or [] if the page doesn't match either known
// template (caller should fall back to AI in that case).
function parseRecipesHeuristic(pageText) {
  // `.` never matches \r, so a trailing \r (Windows line endings from
  // pdftotext) would silently break every end-anchored regex below.
  const lines = pageText.replace(/\r/g, '').split('\n')
  const anchors = findAnchors(lines)

  const results = []
  for (let a = 0; a < anchors.length; a++) {
    const anchor = anchors[a]
    const title = findTitle(lines, anchor.lineIndex)
    if (!title) continue
    const blockEnd = a + 1 < anchors.length ? findTitle(lines, anchors[a + 1].lineIndex) ? anchors[a + 1].lineIndex - 3 : anchors[a + 1].lineIndex : lines.length
    const { ingredients, directions } = splitColumns(lines, anchor.lineIndex + 1, Math.max(anchor.lineIndex + 1, blockEnd), anchor.directionColStart)
    if (ingredients.length === 0 || directions.length === 0) continue // low confidence — let AI handle this one
    results.push({
      name: title.name,
      servings: title.servings || undefined,
      prep_time: title.time || undefined,
      ingredients: ingredients.join('\n'),
      steps: directions.join('\n'),
    })
  }
  if (results.length > 0) return results
  return parseStackedTemplate(lines)
}

module.exports = { parseRecipesHeuristic, findAnchors, findTitle, splitColumns, parseStackedTemplate, findStackedAnchors, findStackedTitle }
