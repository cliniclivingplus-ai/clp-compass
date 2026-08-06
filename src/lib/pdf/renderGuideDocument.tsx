import type { ReactElement } from 'react'
import { Document, renderToStream } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import { ClientGuideDocument, GUIDE_SECTIONS, type GuideData } from './ClientGuideDocument'

async function bufferFromStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

async function countPages(children: ReactElement[]): Promise<number> {
  const stream = await renderToStream(<Document>{children}</Document>)
  const buffer = await bufferFromStream(stream)
  const doc = await PDFDocument.load(buffer)
  return doc.getPageCount()
}

// Two-pass render: react-pdf lays out one page at a time and has no way to
// know a section's real page number until everything before it has already
// been rendered, so a hardcoded TOC silently goes wrong the moment any
// section's AI-generated text is long enough to overflow onto an extra
// page. Pass one measures each section standalone (same page size/margins,
// so pagination is identical to rendering it in place) to get real page
// counts; pass two renders the full document with those numbers in the TOC.
export async function renderGuidePdf(data: GuideData): Promise<Buffer> {
  // A hidden section renders zero pages in ClientGuideDocument, so the
  // cursor must skip it here too — otherwise every section after a hidden
  // one would report a TOC page number offset by the hidden section's
  // would-be length.
  const isSectionHidden = (key: string) =>
    (data.hiddenSections ?? []).includes(key) || (key === 'recipes' && (data.hiddenSections ?? []).includes('nutrition'))
  let cursor = 3 // page 1 = cover, page 2 = TOC, body starts at page 3
  const tocPageNumbers: Record<string, number> = {}
  for (const section of GUIDE_SECTIONS) {
    if (isSectionHidden(section.key)) continue
    tocPageNumbers[section.key] = cursor
    cursor += await countPages(section.render(data))
  }

  const stream = await renderToStream(<ClientGuideDocument data={data} tocPageNumbers={tocPageNumbers} />)
  return bufferFromStream(stream)
}
