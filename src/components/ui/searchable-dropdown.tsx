"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// ─── Types ────────────────────────────────────────────────────────────────

export interface SearchableDropdownOption {
  id: string
  label: string
  subtitle?: string
  disabled?: boolean
}

export interface SearchableDropdownProps {
  value: string
  onValueChange: (id: string) => void
  options: SearchableDropdownOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  loading?: boolean
  error?: string
  className?: string
  disabled?: boolean
  allOption?: { id: string; label: string }
  /** Compact mode for table cells — smaller height and text */
 compact?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────

export function SearchableDropdown({
  value,
  onValueChange,
  options,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  emptyText = "Tidak ditemukan.",
  loading = false,
  error,
  className,
  disabled = false,
  allOption,
  compact = false,
}: SearchableDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selectedOption = React.useMemo(() => {
    if (allOption && value === allOption.id) return { id: allOption.id, label: allOption.label }
    return options.find((o) => o.id === value)
  }, [options, value, allOption])

  // Reset search when popover opens/closes
  React.useEffect(() => {
    if (!open) setSearch("")
  }, [open])

  const displayValue = selectedOption?.label || placeholder
  const h = compact ? "h-8 text-xs" : "h-9 text-sm"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            h,
            error && "border-destructive",
            !selectedOption && "text-muted-foreground",
            className
          )}
          disabled={disabled || loading}
        >
          <span className="truncate">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className={cn(compact ? "h-3 w-3" : "h-4 w-4", "animate-spin")} />
                Memuat...
              </span>
            ) : (
              displayValue
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
            className={compact ? "h-8 text-xs" : undefined}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allOption && (
                <CommandItem
                  key={allOption.id}
                  value={allOption.label}
                  onSelect={() => {
                    onValueChange(allOption.id)
                    setOpen(false)
                  }}
                  className={compact ? "text-xs" : "text-sm"}
                >
                  <Check
                    className={cn(
                      "mr-2 shrink-0",
                      compact ? "h-3.5 w-3.5" : "h-4 w-4",
                      value === allOption.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>{allOption.label}</span>
                </CommandItem>
              )}
              {options.map((opt) => {
                const searchStr = opt.subtitle
                  ? `${opt.label} ${opt.subtitle}`
                  : opt.label
                return (
                  <CommandItem
                    key={opt.id}
                    value={searchStr}
                    disabled={opt.disabled}
                    onSelect={() => {
                      if (!opt.disabled) {
                        onValueChange(opt.id)
                        setOpen(false)
                      }
                    }}
                    className={compact ? "text-xs" : "text-sm"}
                  >
                    <Check
                      className={cn(
                        "mr-2 shrink-0",
                        compact ? "h-3.5 w-3.5" : "h-4 w-4",
                        value === opt.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      {opt.subtitle && (
                        <span className="text-[11px] text-muted-foreground">
                          {opt.subtitle}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
