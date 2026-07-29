import type { Metadata } from 'next'
import Script from 'next/script'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'CLP Compass',
  description: 'Clinical nutrition co-pilot for Clinic Living Plus',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, background: '#FAF9F5', color: '#1A2417', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', WebkitFontSmoothing: 'antialiased' }}>
        {/* Google Identity + Picker — loaded once for the Drive import feature */}
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" />

        <header
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'saturate(180%) blur(8px)',
            borderBottom: '1px solid #ECEBE3',
            padding: '0 24px',
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}
        >
          <Link href="/patients" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #538A22, #6DAA33)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 17,
                boxShadow: '0 2px 6px rgba(83,138,34,0.28)',
              }}
            >
              🧭
            </div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 700, fontSize: 15.5, color: '#1A2417', letterSpacing: '-0.01em' }}>CLP Compass</div>
              <div style={{ fontSize: 11.5, color: '#8A9284' }}>Clinic Living Plus · Bangalore</div>
            </div>
          </Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Link
              href="/patients"
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: '#2F5214',
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: 8,
              }}
            >
              Patients
            </Link>
            <Link
              href="/coaches"
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: '#2F5214',
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: 8,
              }}
            >
              Coaches
            </Link>
          </nav>
        </header>

        <main style={{ minHeight: 'calc(100vh - 60px)', padding: '32px 24px 64px' }}>{children}</main>
      </body>
    </html>
  )
}