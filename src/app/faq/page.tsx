import type { Metadata } from 'next'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import FaqList from '@/components/faq/FaqList'
import { getPublishedFaqs } from '@/lib/db/queries/faq'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Questions fréquentes sur les solutions solaires Le Roi Solaire.',
}

export default async function FaqPage() {
  const faqs = await getPublishedFaqs()

  return (
    <>
      <Header />
      <main className="flex-1 bg-gray-50 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">Questions fréquentes</h1>
            <p className="mt-2 text-gray-500">
              Retrouvez les réponses aux questions les plus posées sur nos solutions solaires.
            </p>
          </div>
          <FaqList faqs={faqs} />
        </div>
      </main>
      <Footer />
    </>
  )
}
