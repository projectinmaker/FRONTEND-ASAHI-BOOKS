'use client'

import { X } from 'lucide-react'
import { useTabStore } from '@/store/tab-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const closeTab = useTabStore((s) => s.closeTab)

  if (tabs.length <= 1) return null

  return (
    <TooltipProvider delayDuration={300}>
      <div className="border-b bg-muted/30">
        <div className="flex items-center overflow-x-auto scrollbar-none px-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                className={cn(
                  'group relative flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap cursor-pointer border-r border-border/50 transition-colors shrink-0',
                  isActive
                    ? 'bg-background text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
                onClick={() => !isActive && setActiveTab(tab.id)}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
                <span className="max-w-[160px] truncate">{tab.title}</span>
                {tab.closable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-5 w-5 p-0 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity shrink-0',
                      isActive && 'opacity-60 hover:opacity-100'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </TooltipProvider>
  )
}