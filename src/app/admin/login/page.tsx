import type { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'Connexion | Admin' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <LoginForm error={erreur ?? null} />
    </div>
  )
}
