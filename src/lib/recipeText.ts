// Recipe data is stored one logical item per line (both the manual "add
// recipe" form and the bulk .txt/.docx importer already strip any bullet/
// number the coach typed before saving) — so each non-empty line is always
// its own ingredient/step, never merged with the next. This just strips a
// redundant leading marker if one somehow made it into storage anyway (so
// rendering never doubles up "· · ..."), and drops stray PDF page-footer
// artifacts a bulk import might have picked up (e.g. "16 | P a g e").
const PAGE_FOOTER = /^\d+\s*\|\s*p\s*a\s*g\s*e$/i

export function splitRecipeLines(text: string): string[] {
  return (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !PAGE_FOOTER.test(l))
    .map((l) => l.replace(/^[•\-·�]+\s*/, '').replace(/^\d+[.)]\s*/, ''))
}
