type BadgeVariant = 'public' | 'internal' | 'franchise' | 'published' | 'draft' | 'neutral'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  public: 'bg-green-100 text-green-700',
  internal: 'bg-blue-100 text-blue-700',
  franchise: 'bg-purple-100 text-purple-700',
  published: 'bg-green-100 text-green-700',
  draft: 'bg-gray-100 text-gray-600',
  neutral: 'bg-gray-100 text-gray-600',
}

export default function Badge({ variant = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
      ].join(' ')}
    >
      {children}
    </span>
  )
}
