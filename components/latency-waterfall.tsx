import type { PhaseTimings } from '@/lib/engine/types'
import { toBars } from '@/lib/engine/waterfall'

function formatMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  return `${Math.round(ms)}ms`
}

interface Props {
  timings: PhaseTimings
}

export function LatencyWaterfall({ timings }: Props) {
  const bars = toBars(timings)

  return (
    <div className="flex flex-col gap-4">
      {/* Headline stats row */}
      <div className="flex items-baseline gap-6 pb-3 border-b border-subtle-ash">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-midtone-gray">
            Total wall-clock
          </span>
          <span className="text-[22px] font-semibold leading-none text-callout-red tabular-nums">
            {formatMs(timings.totalWallClockMs)}
          </span>
        </div>
        {timings.warehouseExecMs !== null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-midtone-gray">
              Warehouse
            </span>
            <span className="text-[17px] font-semibold leading-none text-rich-black tabular-nums">
              {formatMs(timings.warehouseExecMs)}
            </span>
          </div>
        )}
        {timings.queueTimeMs !== null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-midtone-gray">
              Queue
            </span>
            <span className="text-[17px] font-semibold leading-none text-rich-black tabular-nums">
              {formatMs(timings.queueTimeMs)}
            </span>
          </div>
        )}
      </div>

      {/* Waterfall rows */}
      <div className="flex flex-col gap-2">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-3">
            {/* Phase label */}
            <span
              className="text-[13px] font-medium text-rich-black shrink-0 text-right"
              style={{ width: '130px' }}
            >
              {bar.label}
            </span>

            {/* Track */}
            <div
              className="relative flex-1 bg-ghost-gray rounded"
              style={{ height: '20px' }}
            >
              {/* Bar */}
              <div
                className={
                  bar.source === 'server'
                    ? 'absolute inset-y-0 bg-rich-black rounded'
                    : 'absolute inset-y-0 bg-transparent border-2 border-rich-black rounded'
                }
                style={{
                  left: `${bar.leftPct}%`,
                  width: `${bar.widthPct}%`,
                  minWidth: bar.widthPct > 0 ? '3px' : '0',
                }}
              />
            </div>

            {/* ms value */}
            <span
              className="text-[13px] tabular-nums text-rich-black shrink-0 text-right"
              style={{ width: '68px' }}
            >
              {Math.round(bar.ms)}ms
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 pt-2 border-t border-subtle-ash">
        <div className="flex items-center gap-2">
          <div className="w-8 h-3 rounded bg-rich-black" />
          <span className="text-[12px] text-midtone-gray">Server-reported</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-3 rounded border-2 border-rich-black bg-transparent" />
          <span className="text-[12px] text-midtone-gray">Client wall-clock</span>
        </div>
      </div>
    </div>
  )
}
