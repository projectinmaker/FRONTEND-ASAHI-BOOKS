'use client';

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  /** Optional message shown beneath the spinner. */
  message?: string;
  /** Optional className for outer container. */
  className?: string;
  /** Spinner size in pixels (default 24). */
  size?: number;
}

/**
 * Polished loading indicator with spinner + message.
 * Usage: <LoadingState message="Memuat daftar pelanggan..." />
 */
export function LoadingState({ message = 'Memuat data...', className, size = 24 }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center justify-center gap-3 py-12 px-4 text-center', className)}>
      <Loader2 className="animate-spin text-muted-foreground" style={{ height: size, width: size }} aria-hidden />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
