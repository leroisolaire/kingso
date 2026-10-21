import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

/** Ancienne forme des liens (/c/pac) : redirige vers l'adresse courte (/pac). */
export default async function LegacyAssistantPage({ params }: Props) {
  const { slug } = await params
  redirect(`/${encodeURIComponent(slug)}`)
}
