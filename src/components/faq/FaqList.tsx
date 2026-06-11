import type { Faq } from '@/types/faq'
import FaqAccordion from './FaqAccordion'

interface FaqListProps {
  faqs: Faq[]
}

export default function FaqList({ faqs }: FaqListProps) {
  if (faqs.length === 0) {
    return <p className="py-12 text-center text-gray-500">Aucune question disponible pour le moment.</p>
  }

  return (
    <div className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white px-6">
      {faqs.map((faq) => (
        <FaqAccordion key={faq.id} faq={faq} />
      ))}
    </div>
  )
}
