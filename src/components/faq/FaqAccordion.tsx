'use client'

import { useState } from 'react'
import type { Faq } from '@/types/faq'

interface FaqAccordionProps {
  faq: Faq
}

export default function FaqAccordion({ faq }: FaqAccordionProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
        aria-expanded={open}
      >
        <span className="pr-4 font-medium text-gray-900">{faq.question}</span>
        <svg
          className={['h-5 w-5 shrink-0 text-amber-500 transition-transform', open ? 'rotate-180' : ''].join(' ')}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="pb-5 text-sm leading-7 text-gray-600">{faq.answer}</div>
      )}
    </div>
  )
}
