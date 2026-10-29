import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { getCalendarState } from '@/lib/sav/calendar'
import { formatPhone } from '@/lib/sav/phone'
import TechniciansClient from './TechniciansClient'

export const metadata: Metadata = { title: 'Intervenants | Admin' }

export default async function TechniciansPage() {
  const [technicians, users, upcoming, assigned, calendar] = await Promise.all([
    db.technician.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, roles: true }, orderBy: { email: 'asc' } }),
    db.savCase.groupBy({ by: ['technicianId'], where: { status: 'SCHEDULED', technicianId: { not: null }, appointmentAt: { gte: new Date() } }, _count: true }),
    db.savCase.groupBy({ by: ['technicianId'], where: { technicianId: { not: null } }, _count: true }),
    getCalendarState(),
  ])
  const count = (rows: { technicianId: string | null; _count: number }[], id: string) => rows.find((r) => r.technicianId === id)?._count ?? 0

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link href="/admin/sav" className="text-sm text-amber-700 hover:underline">← Espace SAV</Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Intervenants</h1>
        <p className="mt-1 text-sm text-gray-500">
          Techniciens SAV (avec un compte de connexion, Google ou mot de passe) et poseurs (sans compte : ils reçoivent un lien
          par intervention). Leurs compétences, leur difficulté maximale et leur secteur servent aux suggestions du planning.
        </p>
        {!calendar.chantierCalendarId && (
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Agenda des chantiers non choisi : les repères agenda ne servent pas encore. À choisir dans Réglages SAV (Super admin).
          </p>
        )}
      </div>
      <TechniciansClient
        technicians={technicians.map((t) => ({
          id: t.id,
          name: t.name,
          kind: t.kind,
          phone: formatPhone(t.phone),
          userId: t.userId,
          skills: t.skills,
          maxDifficulty: t.maxDifficulty,
          sector: t.sector ?? '',
          agendaCodes: t.agendaCodes,
          active: t.active,
          upcoming: count(upcoming, t.id),
          assigned: count(assigned, t.id),
        }))}
        users={users.map((u) => ({ id: u.id, label: u.name ? `${u.name} (${u.email})` : u.email, technicianRole: u.roles.includes('TECHNICIAN') }))}
      />
    </div>
  )
}
