import Link from 'next/link'
import MascotDisplay from '@/components/mascot/MascotDisplay'

const FEATURES = [
  { icon: '📄', text: 'Basé uniquement sur les documents officiels' },
  { icon: '⚡', text: 'Réponse en quelques secondes' },
  { icon: '🔍', text: 'Sources citées à chaque réponse' },
]

export default function HeroSection() {
  return (
    <section className="overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-2">

          {/* ── Colonne texte ── */}
          <div className="flex flex-col justify-center px-8 py-20 sm:px-12 xl:px-16">
            {/* Badge */}
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700 ring-1 ring-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500" />
              Intelligence artificielle documentaire
            </div>

            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-5xl xl:text-6xl">
              Parlez à{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-amber-500">Kingso</span>
                <span
                  className="absolute inset-x-0 bottom-0 h-3 -z-0 rounded"
                  style={{ background: 'rgba(245,158,11,0.15)' }}
                />
              </span>
              <br />
              votre assistant<br />solaire
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-8 text-gray-500">
              Kingso répond à toutes vos questions sur les solutions Le Roi Solaire — directement depuis notre documentation officielle. Pas d&apos;improvisation, que des faits.
            </p>

            {/* Chips de fonctionnalités */}
            <div className="mt-6 flex flex-wrap gap-3">
              {FEATURES.map((f) => (
                <span
                  key={f.text}
                  className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 shadow-sm"
                >
                  <span>{f.icon}</span>
                  {f.text}
                </span>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-7 py-3.5 text-base font-semibold text-white shadow-md shadow-amber-200 hover:bg-amber-600 hover:shadow-amber-300 transition-all"
              >
                Parler à Kingso
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              </Link>
              <Link
                href="/faq"
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-7 py-3.5 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Voir la FAQ
              </Link>
            </div>
          </div>

          {/* ── Colonne mascotte ── */}
          <div
            className="relative flex items-center justify-center overflow-hidden rounded-bl-[48px] lg:rounded-bl-none lg:rounded-l-[48px]"
            style={{
              background: 'linear-gradient(140deg, #130800 0%, #261200 50%, #0e0500 100%)',
              minHeight: 420,
            }}
          >
            {/* Étoiles de fond */}
            {[
              { x: 10, y: 10, s: 2, o: 0.4, d: 2.5, dl: 0 },
              { x: 82, y:  5, s: 1.5, o: 0.3, d: 3.2, dl: 0.8 },
              { x: 50, y: 20, s: 2.5, o: 0.25, d: 2.8, dl: 1.5 },
              { x: 20, y: 45, s: 1.8, o: 0.35, d: 3.6, dl: 0.4 },
              { x: 88, y: 38, s: 2, o: 0.30, d: 2.2, dl: 1.2 },
              { x: 65, y: 70, s: 1.5, o: 0.20, d: 4.0, dl: 0.6 },
              { x: 35, y: 80, s: 2.2, o: 0.40, d: 3.1, dl: 1.9 },
              { x: 75, y: 88, s: 1.8, o: 0.30, d: 2.7, dl: 0.3 },
              { x: 15, y: 70, s: 1.2, o: 0.25, d: 3.4, dl: 1.0 },
              { x: 92, y: 62, s: 2.0, o: 0.35, d: 2.4, dl: 0.7 },
            ].map((star, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-amber-300 pointer-events-none"
                style={{
                  left:   `${star.x}%`,
                  top:    `${star.y}%`,
                  width:   star.s,
                  height:  star.s,
                  '--star-opacity': star.o,
                  animation: `star-pulse ${star.d}s ease-in-out ${star.dl}s infinite`,
                } as React.CSSProperties}
              />
            ))}

            {/* Mascotte */}
            <div className="relative z-10 flex flex-col items-center gap-4 py-12">
              <MascotDisplay state="idle" size={300} />

              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px #22c55e' }} />
                <span className="text-sm font-medium text-amber-200">Kingso est disponible</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
