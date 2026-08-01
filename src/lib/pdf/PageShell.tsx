import { Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { colors, font, page as pageTokens } from './theme'

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.paper,
    padding: pageTokens.padding,
    fontFamily: font.body,
    color: colors.ink,
    fontSize: 10.5,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.paper,
    fontSize: 8,
    fontFamily: font.displayBold,
    letterSpacing: 0.4,
  },
  eyebrow: {
    fontSize: 7.5,
    fontFamily: font.bodySemiBold,
    letterSpacing: 1.6,
    color: colors.muted,
    textAlign: 'right',
    lineHeight: 1.6,
  },
  body: { flexGrow: 1 },
  foot: {
    marginTop: 'auto',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  footRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  footUrl: {
    fontSize: 7.5,
    fontFamily: font.bodyMedium,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  footNum: {
    fontSize: 9,
    fontFamily: font.displayBold,
    color: colors.inkSoft,
  },
  footCo: {
    fontSize: 7.5,
    color: colors.muted,
    marginTop: 2,
  },
})

export function PageShell({
  eyebrow,
  children,
}: {
  eyebrow: string
  children: React.ReactNode
}) {
  return (
    <Page size="LETTER" style={styles.page} wrap>
      <View style={styles.head} fixed>
        <View style={styles.logo}>
          <Text style={styles.logoText}>CLP</Text>
        </View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
      </View>

      <View style={styles.body}>{children}</View>

      <View style={styles.foot} fixed>
        <View style={styles.footRow}>
          <Text style={styles.footUrl}>CLINICLIVINGPLUS.COM</Text>
          {/* Real physical page number — content that overflows a logical
              "page" (e.g. a long roadmap phase) spills onto its own printed
              page, so this can't be hand-labeled per section like the TOC is. */}
          <Text style={styles.footNum} render={({ pageNumber }) => `${pageNumber}`} />
        </View>
        <Text style={styles.footCo}>Clinic Living Plus Pvt Ltd™ · +91 72931 11120</Text>
      </View>
    </Page>
  )
}

export const shared = StyleSheet.create({
  kicker: {
    fontSize: 8,
    fontFamily: font.bodySemiBold,
    letterSpacing: 1.6,
    color: colors.accent,
    marginBottom: 6,
  },
  title: {
    fontFamily: font.display,
    fontSize: 25,
    color: colors.ink,
    marginBottom: 8,
    lineHeight: 1.15,
  },
  dek: {
    fontSize: 10.5,
    color: colors.inkSoft,
    lineHeight: 1.6,
    marginBottom: 18,
  },
  section: {
    fontFamily: font.displayBold,
    fontSize: 13.5,
    color: colors.ink,
    marginTop: 18,
    marginBottom: 9,
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.rule,
  },
  p: {
    fontSize: 10,
    lineHeight: 1.65,
    color: colors.ink,
    marginBottom: 8,
  },
  box: {
    backgroundColor: colors.accentSoft,
    borderRadius: 7,
    borderWidth: 0.75,
    borderColor: colors.rule,
    padding: 15,
    marginVertical: 10,
  },
  boxLabel: {
    fontSize: 8,
    letterSpacing: 1.1,
    color: colors.accent,
    fontFamily: font.bodyBold,
    marginBottom: 6,
  },
  cite: {
    fontSize: 8.5,
    color: colors.muted,
    marginTop: 4,
  },
})
