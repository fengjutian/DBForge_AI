import React from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  /** e.g. 'w-[680px]' — default 'w-[520px]' */
  width?: string
  /** Top border accent color, e.g. 'border-green-500' */
  borderTop?: string
  /** Optional header content (replaces default title+close) */
  header?: React.ReactNode
  /** Optional footer bar shown at the bottom */
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Shared modal container — overlay + centered panel with optional
 * header, footer, and border-top accent.
 */
export default function Modal({
  open,
  onClose,
  title,
  width = 'w-[520px]',
  borderTop,
  header,
  footer,
  children,
  className = '',
}: ModalProps): React.ReactElement | null {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] ${width} ${className}${borderTop ? ` border-t-4 ${borderTop}` : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {header ?? (
          title ? (
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="font-semibold text-sm">{title}</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : null
        )}

        <div className="overflow-y-auto flex-1 p-5">
          {children}
        </div>

        {footer && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex justify-end gap-2 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
