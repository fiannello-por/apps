import { cn } from '@/lib/utils'

export interface Stat {
  label: string
  value: string
  emphasis?: boolean
}

export function StatTiles({ stats, className }: { stats: Stat[]; className?: string }) {
  const cols = Math.min(stats.length, 4)
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-xl border border-border bg-border',
        cols === 2 && 'grid-cols-2',
        cols === 3 && 'grid-cols-3',
        cols >= 4 && 'grid-cols-2 sm:grid-cols-4',
        className,
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-1.5 bg-card px-4 py-3">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {s.label}
          </span>
          <span
            className={cn(
              'text-[19px] font-semibold leading-none tabular-nums',
              s.emphasis ? 'text-destructive' : 'text-foreground',
            )}
          >
            {s.value}
          </span>
        </div>
      ))}
    </div>
  )
}
