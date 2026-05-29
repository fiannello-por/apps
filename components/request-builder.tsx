'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { EndpointType, QuerySpec } from '@/lib/engine/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface Connection {
  id: string
  name: string
  baseUrl: string
  projectUuid: string
  createdAt: string
}

interface ExploreItem {
  name: string
  label: string
}

interface FieldItem {
  id: string
  label: string
}

interface ChartItem {
  uuid: string
  name: string
}

export interface RequestBuilderValue {
  connectionId: string
  endpointType: EndpointType
  spec: QuerySpec
}

interface Props {
  value?: RequestBuilderValue
  onChange: (value: RequestBuilderValue) => void
}

// ── Normalizers (defensive, handles shape uncertainty) ─────────────────────

function normalizeExplores(data: unknown): ExploreItem[] {
  const arr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.results)
      ? ((data as Record<string, unknown>).results as unknown[])
      : []
  return arr.map((item) => {
    if (typeof item === 'string') return { name: item, label: item }
    const obj = item as Record<string, unknown>
    const name = typeof obj.name === 'string' ? obj.name : String(item)
    const label = typeof obj.label === 'string' ? obj.label : name
    return { name, label }
  })
}

function normalizeExploreFields(data: unknown): { dimensions: FieldItem[]; metrics: FieldItem[]; fallback: boolean } {
  try {
    // Try: data.results.tables[baseTable].dimensions / .metrics
    const results = (data as Record<string, unknown>)?.results as Record<string, unknown> | undefined
    if (results && typeof results === 'object') {
      const tables = results.tables as Record<string, unknown> | undefined
      if (tables && typeof tables === 'object') {
        const tableKeys = Object.keys(tables)
        if (tableKeys.length > 0) {
          const baseTable = tables[tableKeys[0]] as Record<string, unknown>
          const dims = fieldsFromObject(baseTable?.dimensions)
          const mets = fieldsFromObject(baseTable?.metrics)
          if (dims.length > 0 || mets.length > 0) {
            return { dimensions: dims, metrics: mets, fallback: false }
          }
        }
      }
      // Try: data.results.fields
      if (Array.isArray(results.fields)) {
        const all = (results.fields as Record<string, unknown>[]).map(fieldItemFromObj)
        return { dimensions: all, metrics: [], fallback: false }
      }
    }
    // Try: data.fields (top-level)
    const topFields = (data as Record<string, unknown>)?.fields
    if (Array.isArray(topFields)) {
      const all = (topFields as Record<string, unknown>[]).map(fieldItemFromObj)
      return { dimensions: all, metrics: [], fallback: false }
    }
  } catch {
    // ignore, fall through
  }
  return { dimensions: [], metrics: [], fallback: true }
}

function fieldsFromObject(obj: unknown): FieldItem[] {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj as Record<string, unknown>).map(([key, val]) => {
    const v = val as Record<string, unknown>
    const label = typeof v?.label === 'string' ? v.label : typeof v?.name === 'string' ? v.name : key
    return { id: key, label }
  })
}

function fieldItemFromObj(obj: Record<string, unknown>): FieldItem {
  const id = typeof obj.fieldId === 'string' ? obj.fieldId : typeof obj.id === 'string' ? obj.id : String(obj.name ?? '')
  const label = typeof obj.label === 'string' ? obj.label : id
  return { id, label }
}

function normalizeCharts(data: unknown): ChartItem[] {
  const arr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.results)
      ? ((data as Record<string, unknown>).results as unknown[])
      : []
  return arr.map((item) => {
    const obj = item as Record<string, unknown>
    return {
      uuid: typeof obj.uuid === 'string' ? obj.uuid : String(obj.id ?? ''),
      name: typeof obj.name === 'string' ? obj.name : String(obj.uuid ?? obj.id ?? 'Unnamed'),
    }
  })
}

// ── Pill chip component ────────────────────────────────────────────────────

function FieldChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer select-none',
        selected
          ? 'bg-deep-black text-canvas-white'
          : 'bg-ghost-gray text-rich-black hover:bg-subtle-ash',
      ].join(' ')}
      style={{ borderRadius: '26px', height: '26px' }}
    >
      {label}
    </button>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function RequestBuilder({ value, onChange }: Props) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(true)

  const [connectionId, setConnectionId] = useState<string>(value?.connectionId ?? '')
  const [endpointType, setEndpointType] = useState<EndpointType>(value?.endpointType ?? 'metric_query')

  // metric_query / underlying_data
  const [explores, setExplores] = useState<ExploreItem[]>([])
  const [loadingExplores, setLoadingExplores] = useState(false)
  const [exploreName, setExploreName] = useState('')
  const [fields, setFields] = useState<{ dimensions: FieldItem[]; metrics: FieldItem[]; fallback: boolean }>({
    dimensions: [],
    metrics: [],
    fallback: false,
  })
  const [loadingFields, setLoadingFields] = useState(false)
  const [selectedDims, setSelectedDims] = useState<string[]>([])
  const [selectedMets, setSelectedMets] = useState<string[]>([])
  const [manualDims, setManualDims] = useState('')
  const [manualMets, setManualMets] = useState('')
  const [limit, setLimit] = useState('500')

  // sql
  const [sql, setSql] = useState('')

  // saved_chart
  const [charts, setCharts] = useState<ChartItem[]>([])
  const [loadingCharts, setLoadingCharts] = useState(false)
  const [chartUuid, setChartUuid] = useState('')

  // ── Load connections ────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/connections')
        if (!res.ok) throw new Error('Failed')
        const data: Connection[] = await res.json()
        setConnections(data)
        // pre-select first if none
        if (!connectionId && data.length > 0) {
          setConnectionId(data[0].id)
        }
      } catch {
        toast.error('Could not load connections.')
      } finally {
        setLoadingConnections(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load explores when connection or tab changes ────────────────────────

  useEffect(() => {
    if (!connectionId) return
    if (endpointType !== 'metric_query' && endpointType !== 'underlying_data') return

    setExplores([])
    setExploreName('')
    setFields({ dimensions: [], metrics: [], fallback: false })
    setSelectedDims([])
    setSelectedMets([])
    setLoadingExplores(true)

    async function load() {
      try {
        const res = await fetch(`/api/lightdash/explores?connectionId=${connectionId}`)
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        setExplores(normalizeExplores(data))
      } catch {
        toast.error('Could not load explores.')
      } finally {
        setLoadingExplores(false)
      }
    }
    load()
  }, [connectionId, endpointType])

  // ── Load fields when explore is chosen ─────────────────────────────────

  useEffect(() => {
    if (!connectionId || !exploreName) return

    setFields({ dimensions: [], metrics: [], fallback: false })
    setSelectedDims([])
    setSelectedMets([])
    setLoadingFields(true)

    async function load() {
      try {
        const res = await fetch(`/api/lightdash/explores/${encodeURIComponent(exploreName)}?connectionId=${connectionId}`)
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        setFields(normalizeExploreFields(data))
      } catch {
        toast.error('Could not load explore fields.')
        setFields({ dimensions: [], metrics: [], fallback: true })
      } finally {
        setLoadingFields(false)
      }
    }
    load()
  }, [connectionId, exploreName])

  // ── Load charts ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!connectionId || endpointType !== 'saved_chart') return

    setCharts([])
    setChartUuid('')
    setLoadingCharts(true)

    async function load() {
      try {
        const res = await fetch(`/api/lightdash/charts?connectionId=${connectionId}`)
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        setCharts(normalizeCharts(data))
      } catch {
        toast.error('Could not load charts.')
      } finally {
        setLoadingCharts(false)
      }
    }
    load()
  }, [connectionId, endpointType])

  // ── Emit value changes ──────────────────────────────────────────────────

  const buildSpec = useCallback((): QuerySpec => {
    if (endpointType === 'sql') {
      return { endpointType: 'sql', sql }
    }
    if (endpointType === 'saved_chart') {
      return { endpointType: 'saved_chart', chartUuid }
    }
    // metric_query or underlying_data
    const dimensions = fields.fallback
      ? manualDims.split(',').map((s) => s.trim()).filter(Boolean)
      : selectedDims
    const metrics = fields.fallback
      ? manualMets.split(',').map((s) => s.trim()).filter(Boolean)
      : selectedMets
    return {
      endpointType,
      query: {
        exploreName,
        dimensions,
        metrics,
        limit: parseInt(limit, 10) || 500,
      },
    }
  }, [endpointType, sql, chartUuid, exploreName, selectedDims, selectedMets, manualDims, manualMets, limit, fields.fallback])

  useEffect(() => {
    if (!connectionId) return
    onChange({ connectionId, endpointType, spec: buildSpec() })
  }, [connectionId, endpointType, buildSpec, onChange])

  // ── Toggle chip helpers ─────────────────────────────────────────────────

  function toggleDim(id: string) {
    setSelectedDims((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  function toggleMet(id: string) {
    setSelectedMets((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Connection select */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-[13px] font-medium text-rich-black">Connection</Label>
        {loadingConnections ? (
          <Skeleton className="h-8 w-full rounded-[10px]" />
        ) : connections.length === 0 ? (
          <p className="text-[13px] text-midtone-gray">
            No connections yet.{' '}
            <a href="/connections" className="underline text-rich-black">
              Add one
            </a>
            .
          </p>
        ) : (
          <Select
            value={connectionId}
            onValueChange={(val) => {
              if (val) setConnectionId(val)
            }}
          >
            <SelectTrigger className="w-full rounded-[10px] border-subtle-ash text-[13px] h-8">
              <SelectValue placeholder="Select a connection…" />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-[13px]">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Endpoint type tabs */}
      <Tabs
        value={endpointType}
        onValueChange={(val) => {
          if (val) setEndpointType(val as EndpointType)
        }}
      >
        <TabsList className="w-full bg-ghost-gray rounded-[10px] p-[3px] h-8">
          <TabsTrigger value="metric_query" className="flex-1 text-[12px] rounded-[8px]">
            Metric query
          </TabsTrigger>
          <TabsTrigger value="sql" className="flex-1 text-[12px] rounded-[8px]">
            SQL
          </TabsTrigger>
          <TabsTrigger value="saved_chart" className="flex-1 text-[12px] rounded-[8px]">
            Saved chart
          </TabsTrigger>
          <TabsTrigger value="underlying_data" className="flex-1 text-[12px] rounded-[8px]">
            Underlying data
          </TabsTrigger>
        </TabsList>

        {/* ── metric_query ── */}
        <TabsContent value="metric_query">
          <MetricQueryPanel
            connectionId={connectionId}
            explores={explores}
            loadingExplores={loadingExplores}
            exploreName={exploreName}
            onExploreChange={setExploreName}
            fields={fields}
            loadingFields={loadingFields}
            selectedDims={selectedDims}
            selectedMets={selectedMets}
            onToggleDim={toggleDim}
            onToggleMet={toggleMet}
            manualDims={manualDims}
            manualMets={manualMets}
            onManualDimsChange={setManualDims}
            onManualMetsChange={setManualMets}
            limit={limit}
            onLimitChange={setLimit}
          />
        </TabsContent>

        {/* ── sql ── */}
        <TabsContent value="sql">
          <div className="mt-3 flex flex-col gap-1.5">
            <Label className="text-[13px] font-medium text-rich-black">SQL query</Label>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="SELECT * FROM orders LIMIT 100"
              rows={8}
              className="w-full font-mono text-[13px] rounded-[10px] border border-subtle-ash bg-transparent px-3 py-2 text-rich-black placeholder:text-midtone-gray focus:outline-none focus:border-rich-black resize-y"
            />
          </div>
        </TabsContent>

        {/* ── saved_chart ── */}
        <TabsContent value="saved_chart">
          <div className="mt-3 flex flex-col gap-1.5">
            <Label className="text-[13px] font-medium text-rich-black">Saved chart</Label>
            {!connectionId ? (
              <p className="text-[13px] text-midtone-gray">Select a connection first.</p>
            ) : loadingCharts ? (
              <Skeleton className="h-8 w-full rounded-[10px]" />
            ) : charts.length === 0 ? (
              <p className="text-[13px] text-midtone-gray">No charts found for this connection.</p>
            ) : (
              <Select
                value={chartUuid}
                onValueChange={(val) => {
                  if (val) setChartUuid(val)
                }}
              >
                <SelectTrigger className="w-full rounded-[10px] border-subtle-ash text-[13px] h-8">
                  <SelectValue placeholder="Select a chart…" />
                </SelectTrigger>
                <SelectContent>
                  {charts.map((c) => (
                    <SelectItem key={c.uuid} value={c.uuid} className="text-[13px]">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </TabsContent>

        {/* ── underlying_data ── */}
        <TabsContent value="underlying_data">
          <MetricQueryPanel
            connectionId={connectionId}
            explores={explores}
            loadingExplores={loadingExplores}
            exploreName={exploreName}
            onExploreChange={setExploreName}
            fields={fields}
            loadingFields={loadingFields}
            selectedDims={selectedDims}
            selectedMets={selectedMets}
            onToggleDim={toggleDim}
            onToggleMet={toggleMet}
            manualDims={manualDims}
            manualMets={manualMets}
            onManualDimsChange={setManualDims}
            onManualMetsChange={setManualMets}
            limit={limit}
            onLimitChange={setLimit}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── MetricQueryPanel (shared by metric_query + underlying_data) ─────────────

interface MetricQueryPanelProps {
  connectionId: string
  explores: ExploreItem[]
  loadingExplores: boolean
  exploreName: string
  onExploreChange: (name: string) => void
  fields: { dimensions: FieldItem[]; metrics: FieldItem[]; fallback: boolean }
  loadingFields: boolean
  selectedDims: string[]
  selectedMets: string[]
  onToggleDim: (id: string) => void
  onToggleMet: (id: string) => void
  manualDims: string
  manualMets: string
  onManualDimsChange: (v: string) => void
  onManualMetsChange: (v: string) => void
  limit: string
  onLimitChange: (v: string) => void
}

function MetricQueryPanel({
  connectionId,
  explores,
  loadingExplores,
  exploreName,
  onExploreChange,
  fields,
  loadingFields,
  selectedDims,
  selectedMets,
  onToggleDim,
  onToggleMet,
  manualDims,
  manualMets,
  onManualDimsChange,
  onManualMetsChange,
  limit,
  onLimitChange,
}: MetricQueryPanelProps) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      {/* Explore select */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-[13px] font-medium text-rich-black">Explore</Label>
        {!connectionId ? (
          <p className="text-[13px] text-midtone-gray">Select a connection first.</p>
        ) : loadingExplores ? (
          <Skeleton className="h-8 w-full rounded-[10px]" />
        ) : explores.length === 0 ? (
          <p className="text-[13px] text-midtone-gray">No explores found.</p>
        ) : (
          <Select
            value={exploreName}
            onValueChange={(val) => {
              if (val) onExploreChange(val)
            }}
          >
            <SelectTrigger className="w-full rounded-[10px] border-subtle-ash text-[13px] h-8">
              <SelectValue placeholder="Select an explore…" />
            </SelectTrigger>
            <SelectContent>
              {explores.map((e) => (
                <SelectItem key={e.name} value={e.name} className="text-[13px]">
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Fields */}
      {exploreName && (
        <>
          {loadingFields ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-32 rounded" />
              <Skeleton className="h-16 w-full rounded-[10px]" />
            </div>
          ) : fields.fallback ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-[10px] border border-subtle-ash bg-ghost-gray px-3 py-2">
                <p className="text-[12px] text-midtone-gray">
                  Could not load fields automatically. Enter field IDs manually (comma-separated).
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] font-medium text-rich-black">Dimensions</Label>
                <Input
                  value={manualDims}
                  onChange={(e) => onManualDimsChange(e.target.value)}
                  placeholder="orders.status, orders.created_date"
                  className="rounded-[10px] border-subtle-ash text-[13px] h-8"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] font-medium text-rich-black">Metrics</Label>
                <Input
                  value={manualMets}
                  onChange={(e) => onManualMetsChange(e.target.value)}
                  placeholder="orders.revenue, orders.count"
                  className="rounded-[10px] border-subtle-ash text-[13px] h-8"
                />
              </div>
            </div>
          ) : (
            <>
              {/* Dimension chips */}
              {fields.dimensions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label className="text-[13px] font-medium text-rich-black">
                    Dimensions{' '}
                    {selectedDims.length > 0 && (
                      <span className="text-midtone-gray font-normal">({selectedDims.length} selected)</span>
                    )}
                  </Label>
                  <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                    {fields.dimensions.map((d) => (
                      <FieldChip
                        key={d.id}
                        label={d.label}
                        selected={selectedDims.includes(d.id)}
                        onClick={() => onToggleDim(d.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Metric chips */}
              {fields.metrics.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label className="text-[13px] font-medium text-rich-black">
                    Metrics{' '}
                    {selectedMets.length > 0 && (
                      <span className="text-midtone-gray font-normal">({selectedMets.length} selected)</span>
                    )}
                  </Label>
                  <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                    {fields.metrics.map((m) => (
                      <FieldChip
                        key={m.id}
                        label={m.label}
                        selected={selectedMets.includes(m.id)}
                        onClick={() => onToggleMet(m.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {fields.dimensions.length === 0 && fields.metrics.length === 0 && (
                <p className="text-[13px] text-midtone-gray">No fields found for this explore.</p>
              )}
            </>
          )}
        </>
      )}

      {/* Limit */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-[13px] font-medium text-rich-black">Row limit</Label>
        <Input
          type="number"
          min={1}
          max={5000}
          value={limit}
          onChange={(e) => onLimitChange(e.target.value)}
          className="rounded-[10px] border-subtle-ash text-[13px] h-8 w-28"
        />
      </div>
    </div>
  )
}
