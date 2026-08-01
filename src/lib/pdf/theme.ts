// Shared style tokens for the CLP Client Guide PDF, matching the palette and
// type system already established in "CLP Client Guide - Draft.pdf" pages 1-18.
import { Font } from '@react-pdf/renderer'
import fs from 'fs'
import path from 'path'

export const colors = {
  bg: '#F7EEE1',
  paper: '#FBF5EA',
  ink: '#2C2418',
  inkSoft: '#4A4034',
  accent: '#B1512E',
  accentSoft: '#E7DAC0',
  rule: '#D8C6A4',
  muted: '#948A76',
}

// Real embedded typefaces (Playfair Display for display type, Inter for
// body/UI text) instead of react-pdf's built-in Helvetica/Times-Roman
// fallbacks — those render identically to every other unstyled PDF and are
// the single biggest tell that a document was auto-generated. Font files are
// committed under ./fonts (converted from the official Google Fonts woff2
// release) so this has no runtime network dependency.
const fontsDir = path.join(process.cwd(), 'src', 'lib', 'pdf', 'fonts')
// @react-pdf/font's loader calls string methods (e.g. .substring) directly on
// `src` internally, so a raw Buffer throws at render time — a base64 data URI
// is a real string (satisfying both the runtime and the TS types) while still
// avoiding any network fetch on every PDF render.
const fontBuf = (file: string) => `data:font/ttf;base64,${fs.readFileSync(path.join(fontsDir, file)).toString('base64')}`

Font.register({ family: 'Playfair Display', src: fontBuf('PlayfairDisplay-Regular.ttf') })
Font.register({ family: 'Playfair Display Bold', src: fontBuf('PlayfairDisplay-Bold.ttf') })
Font.register({ family: 'Playfair Display Italic', src: fontBuf('PlayfairDisplay-Italic.ttf') })
Font.register({ family: 'Inter', src: fontBuf('Inter-Regular.ttf') })
Font.register({ family: 'Inter Medium', src: fontBuf('Inter-Medium.ttf') })
Font.register({ family: 'Inter SemiBold', src: fontBuf('Inter-SemiBold.ttf') })
Font.register({ family: 'Inter Bold', src: fontBuf('Inter-Bold.ttf') })

// react-pdf/fontkit doesn't reliably hyphenate on its own — without this it
// occasionally breaks a word mid-syllable at a line edge, which reads as a
// typesetting mistake. Disable hyphenation entirely; wrapping on whole words
// looks more deliberate for a document this length.
Font.registerHyphenationCallback((word) => [word])

export const font = {
  display: 'Playfair Display',
  displayBold: 'Playfair Display Bold',
  displayItalic: 'Playfair Display Italic',
  body: 'Inter',
  bodyMedium: 'Inter Medium',
  bodySemiBold: 'Inter SemiBold',
  bodyBold: 'Inter Bold',
}

export const page = {
  width: 612, // US Letter, points
  height: 792,
  padding: 56,
}
