export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
              K
            </span>
            <span className="text-sm font-medium text-gray-900">Kingso</span>
            <span className="text-sm text-gray-400">— L'assistant Le Roi Solaire</span>
          </div>
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} Le Roi Solaire. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  )
}
