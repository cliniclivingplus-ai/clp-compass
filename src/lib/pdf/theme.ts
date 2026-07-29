// Shared style tokens for the CLP Client Guide PDF, matching the palette and
// type system already established in "CLP Client Guide - Draft.pdf" pages 1-18.
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

export const font = {
  // react-pdf can't load system fonts, so these register Helvetica/Times as the
  // built-in fallbacks it ships with — swap for real brand font files (via
  // Font.register with a data/file URI) once we have the actual CLP typeface.
  display: 'Times-Roman',
  body: 'Helvetica',
  bodyBold: 'Helvetica-Bold',
}

export const page = {
  width: 612, // US Letter, points
  height: 792,
  padding: 56,
}
