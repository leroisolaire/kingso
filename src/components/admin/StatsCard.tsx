interface StatsCardProps {
  label: string
  value: number | string
  icon: string
  trend?: string
}

export default function StatsCard({ label, value, icon, trend }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {trend && <p className="mt-1 text-xs text-gray-400">{trend}</p>}
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-xl">
          {icon}
        </span>
      </div>
    </div>
  )
}
