import type { Metadata } from 'next'
import { Commissioner, Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { AppLayoutWrapper } from '@/components/app-layout-wrapper'
import { SessionProvider } from '@/components/auth/session-provider'
import { SealosBootstrap } from '@/components/sealos-bootstrap'
import { JotaiProvider } from '@/components/providers/jotai-provider'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const commissioner = Commissioner({
  variable: '--font-commissioner',
  subsets: ['latin'],
  weight: ['500', '600'],
})

export const metadata: Metadata = {
  title: 'ShipRepo',
  description: 'Analyze, fix, preview, ship, and operate GitHub repositories on Sealos.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${commissioner.variable} antialiased`}>
        <JotaiProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <SessionProvider />
            <SealosBootstrap />
            <AppLayoutWrapper>{children}</AppLayoutWrapper>
            <Toaster />
          </ThemeProvider>
        </JotaiProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
