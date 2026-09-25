'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Inbox, type LucideProps } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  /** Optional button variant. Defaults to "default". */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive';
}

interface EmptyStateProps {
  /** Icon component to display. Defaults to Inbox from lucide-react. */
  icon?: React.ElementType<LucideProps>;
  /** Main title — required. */
  title: string;
  /** Optional description text below the title. */
  description?: string;
  /** Optional action button rendered below the description. */
  action?: EmptyStateAction;
  /** Optional className for outer container. */
  className?;
}

/**
 * Polished empty state with icon + title + description + optional action button.
 * Usage:
 *   <EmptyState icon={Users} title="Belum ada data pelanggan"
 *     description="Klik tombol Tambah Pelanggan untuk menambahkan"
 *     action={{ label: "Tambah Pelanggan", onClick: handleAdd }} />
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center justify-center gap-3 py-12 px-4 text-center', className)}>
      <div className="flex items-center justify-center rounded-full bg-muted/40 p-4">
        <Icon className="h-12 w-12 text-muted-foreground/30" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">{description}</p>}
      </div>
      {action && (
        <Button type="button" variant={action.variant ?? 'default'} size="sm" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
