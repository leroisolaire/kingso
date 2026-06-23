import type { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'Connexion | Admin' }

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <LoginForm />
    </div>
  )
}
