import type { Metadata } from 'next'
import { TechReportForm } from '@/app/admin/(protected)/sav/[id]/TechReport'
import { formatPhone } from '@/lib/sav/phone'
import { DIFFICULTY_LABELS, URGENCY_LABELS } from '@/lib/sav/rating'
import { formatAppointment, formatParisDate } from '@/lib/sav/schedule'
import { TECH_OUTCOMES, type TechOutcome } from '@/lib/sav/status'
import { getInterventionByToken } from '@/lib/sav/technicians'
import { getSignedUrls } from '@/lib/storage/attachments'

// Lien personnel d'un intervenant sans compte (poseur) : ce dossier seulement, et son retour d'intervention
export const metadata: Metadata = { title: 'Intervention SAV — Le Roi Solaire', robots: { index: false, follow: false } }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  )
}

export default async function InterventionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = await getInterventionByToken(token)
  if (!c) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f7f6f4] p-6 text-center text-gray-800">
        <div className="max-w-sm space-y-2">
          <p className="text-lg font-semibold">Ce lien n&apos;est plus valide.</p>
          <p className="text-sm text-gray-500">L&apos;intervention a peut-être été confiée à quelqu&apos;un d&apos;autre, ou elle est terminée depuis plus d&apos;une semaine. Contactez le SAV.</p>
        </div>
      </main>
    )
  }

  const clientPhotos = c.messages.flatMap((m) => m.photos)
  const urls = await getSignedUrls([...clientPhotos, ...c.techPhotos]).catch(() => ({} as Record<string, string>))
  const phone = formatPhone(c.callbackPhone || c.phoneKey)
  const place = [c.address, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const canReport = c.status === 'SCHEDULED' || c.status === 'TECH_REPORT'
  const outcome = c.techOutcome ? TECH_OUTCOMES[c.techOutcome as TechOutcome] : null

  return (
    <main className="min-h-dvh bg-[#f7f6f4] px-4 py-5 text-gray-900">
      <div className="mx-auto max-w-lg space-y-3">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#e73e11]">Le Roi Solaire · SAV</p>
          <h1 className="text-xl font-bold">Intervention n° {c.number}</h1>
          <p className="text-sm text-gray-500">Pour {c.technician!.name}</p>
        </header>

        <Section title="Rendez-vous">
          <p className="text-base font-semibold">
            {c.appointmentAt ? `📅 ${formatAppointment(c.appointmentAt, c.appointmentMinutes)}` : 'Date à confirmer avec le SAV'}
          </p>
          {(c.urgency || c.difficulty) && (
            <p className="mt-1 text-sm text-gray-700">
              {[c.urgency ? `🔥 Urgence ${c.urgency}/5 · ${URGENCY_LABELS[c.urgency]}` : '', c.difficulty ? `🔧 Difficulté ${c.difficulty}/5 · ${DIFFICULTY_LABELS[c.difficulty]}` : ''].filter(Boolean).join(' — ')}
            </p>
          )}
        </Section>

        <Section title="Client">
          <p className="font-semibold">{c.customerName || 'Client'}</p>
          {phone && (
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white">
              📞 Appeler le {phone}
            </a>
          )}
          {place && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`} target="_blank" rel="noreferrer"
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-center text-base font-semibold text-white">
              📍 {place}
            </a>
          )}
        </Section>

        <Section title="Problème">
          <p className="whitespace-pre-wrap text-sm text-gray-800">{c.summary || 'Non précisé.'}</p>
          <dl className="mt-2 space-y-0.5 text-sm">
            {c.equipment && <div><dt className="inline text-gray-500">Équipement : </dt><dd className="inline">{c.equipment}</dd></div>}
            {c.errorCode && <div><dt className="inline text-gray-500">Code affiché : </dt><dd className="inline font-semibold">{c.errorCode}</dd></div>}
          </dl>
        </Section>

        {clientPhotos.length > 0 && (
          <Section title={`Photos du client (${clientPhotos.length})`}>
            <div className="grid grid-cols-3 gap-2">
              {clientPhotos.map((path) => urls[path] ? (
                <a key={path} href={urls[path]} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire du stockage privé */}
                  <img src={urls[path]} alt="Photo envoyée par le client" className="aspect-square w-full rounded-lg object-cover ring-1 ring-gray-200" />
                </a>
              ) : null)}
            </div>
          </Section>
        )}

        {canReport ? (
          <TechReportForm caseId={c.id} endpoint={`/api/i/${token}`} photos={c.techPhotos.map((path) => ({ path, url: urls[path] ?? null }))} />
        ) : (
          <Section title="Retour d'intervention">
            <p className="font-semibold">{outcome ? `${outcome.icon} ${outcome.label}` : 'Enregistré'}</p>
            {c.techReportAt && <p className="text-xs text-gray-500">Le {formatParisDate(c.techReportAt, true)}{c.techReportBy ? ` par ${c.techReportBy}` : ''}</p>}
            {c.techReport && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{c.techReport}</p>}
            <p className="mt-2 text-sm text-gray-500">Merci ! Le SAV a bien reçu votre retour.</p>
          </Section>
        )}
        <p className="pb-4 text-center text-xs text-gray-400">Lien personnel : ne le transférez pas. Il ne marche plus une semaine après l&apos;intervention.</p>
      </div>
    </main>
  )
}
