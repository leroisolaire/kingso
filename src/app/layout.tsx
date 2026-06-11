import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: { default: 'Kingso — Assistant Le Roi Solaire', template: '%s | Kingso' },
  description: "Kingso est l'assistant IA de Le Roi Solaire. Posez vos questions sur nos solutions solaires.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geist.variable} h-full`}>
      <body className="h-full antialiased" style={{ background: '#080503', color: '#fff' }}>
        {children}
      </body>
    </html>
  )
}
