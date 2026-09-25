'use client'

import { X, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTabStore } from '@/store/tab-store'

/**
 * Wrapper for form tabs. Provides a header with title/back + scrollable content area.
 * Form components rendered inside tabs should be wrapped in this.
 */
export function FormTabShell({
  title,
  children,
  showBack = false,
}: {
  title: string
  children: React.ReactNode
  showBack?: boolean
}) {
  const closeTab = useTabStore((s) => s.closeTab)
  const activeTabId = useTabStore((s) => s.activeTabId)

  const handleClose = () => {
    if (activeTabId) closeTab(activeTabId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Form header */}
      <div className="flex items-center justify-between border-b px-6 py-3 bg-background shrink-0">
        <div className="flex items-center gap-2">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleClose}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable form content */}
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  )
}