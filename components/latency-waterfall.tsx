import { toBars } from '@/lib/engine/waterfall'
import type { PhaseTimings } from '@/lib/engine/types'
import { cn } from '@/lib/utils'

function fmt(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

export function LatencyWaterfall({ timings }: { timings: PhaseTimings }) {
  const bars = toBars(timings)

  return (
    <div className="flex flex-col gap-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[3px] bg-foreground" />
          Server-reported
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[3px] border-2 border-foreground" />
          Client wall-clock
        </span>
      </div>

      {/* Bars */}
      <div className="flex flex-col gap-2">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <div className="w-[104px] shrink-0 text-right text-[12px] text-muted-foreground">{b.label}</div>
            <div className="relative h-[18px] flex-1 overflow-hidden rounded-[5px] bg-muted">
              <div
                className={cn(
                  'absolute top-0 h-full rounded-[5px]',
                  b.source === 'server' ? 'bg-foreground' : 'border-2 border-foreground bg-transparent',
                )}
                style={{ left: `${b.leftPct}%`, width: `${Math.max(b.widthPct, 0.5)}%` }}
              />
            </div>
            <div className="w-[58px] shrink-0 text-right text-[12px] font-medium tabular-nums text-foreground">
              {fmt(b.ms)}
            </div>
          </div>
        ))}

        {/* Total */}
        <div className="mt-1 flex items-center gap-3 border-t border-border pt-2.5">
          <div className="w-[104px] shrink-0 text-right text-[12px] font-medium text-foreground">End-to-end</div>
          <div className="relative h-[18px] flex-1 overflow-hidden rounded-[5px] bg-muted">
            <div className="absolute inset-0 rounded-[5px] bg-destructive/85" />
          </div>
          <div className="w-[58px] shrink-0 text-right text-[12px] font-semibold tabular-nums text-destructive">
            {fmt(timings.totalWallClockMs)}
          </div>
        </div>
      </div>
    </div>
  )
}
