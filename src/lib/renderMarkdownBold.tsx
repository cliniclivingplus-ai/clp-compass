import { Fragment } from 'react'

// AI-generated text (report summaries, chat answers, case summaries, etc.)
// comes back with **bold** markdown syntax, but most of this app renders
// free text as plain strings — so patients/coaches were seeing literal
// asterisks instead of emphasis. This turns just that one construct into
// real <strong> tags; everything else in the string passes through
// unchanged, so it's safe to run over text that has no markdown in it too.
export function renderMarkdownBold(text: string): React.ReactNode {
  if (!text || !text.includes('**')) return text
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}
