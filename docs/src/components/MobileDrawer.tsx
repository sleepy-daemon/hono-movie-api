import { useEffect } from 'react'
import { X } from 'lucide-react'

export function MobileDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm enter"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute inset-y-0 left-0 w-[80vw] max-w-sm enter-right">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded hover:bg-muted transition-colors"
          aria-label="Close navigation"
        >
          <X size={16} aria-hidden />
        </button>
        {children}
      </div>
    </div>
  )
}
