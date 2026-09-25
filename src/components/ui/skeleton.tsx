import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="skeleton" className={cn('relative overflow-hidden bg-accent animate-pulse rounded-md', className)} {...props}>
      <span aria-hidden className={cn('pointer-events-none absolute inset-0 skeleton-shimmer')} />
    </div>
  );
}

export { Skeleton };
