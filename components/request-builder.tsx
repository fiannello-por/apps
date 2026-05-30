'use client'

/* eslint-disable react-hooks/set-state-in-effect --
   The data-loading effects below intentionally reset dependent UI state
   (clearing stale options + setting a loading flag) the moment the connection,
   explore, or endpoint changes, before the async fetch resolves. */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowUpRight, Info } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Toggle } from '@/components/ui/toggle'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  onChange: (value: RequestBuilderValue) => void
}

const ENDPOINTS: { value: EndpointType; label: string }[] = [
  { value: 'metric_query', label: 'Metric query' },
  { value: 'sql', label: 'SQL' },
  { value: 'saved_chart', label: 'Saved chart' },
  { value: 'underlying_data', label: 'Underlying data' },
]

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
      if (Array.isArray(results.fields)) {
        const all = (results.fields as Record<string, unknown>[]).map(fieldItemFromObj)
        return { dimensions: all, metrics: [], fallback: false }
      }
    }
    const topFields = (data as Record<string, unknown>)?.fields
    if (Array.isArray(topFields)) {
      const all = (topFields as Record<string, unknown>[]).map(fieldItemFromObj)
      return { dimensions: all, metrics: [], fallback: false }
    }
  } catch {
    // fall through
  }
  return { dimensions: [], metrics: [], fallback: true }
}

function fieldsFromObject(obj: unknown): FieldItem[] {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj as Record<string, unknown>).map(([key, val]) => {
    const v = (val ?? {}) as Record<string, unknown>
    const name = typeof v.name === 'string' ? v.name : key
    const table = typeof v.table === 'string' ? v.table : undefined
    // Lightdash queryable field ids are `${table}_${name}` (e.g. orders_status).
    // Prefer an explicit fieldId if the API already provides one.
    const id =
      typeof v.fieldId === 'string' ? v.fieldId : table ? `${table}_${name}` : name
    const label = typeof v.label === 'string' ? v.label : name
    return { id, label }
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

// ── Main component ──────────────────────────────────────────────────────────

export function RequestBuilder({ onChange }: Props) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [connectionId, setConnectionId] = useState('')
  const [endpointType, setEndpointType] = useState<EndpointType>('metric_query')

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

  const [sql, setSql] = useState('')

  const [charts, setCharts] = useState<ChartItem[]>([])
  const [loadingCharts, setLoadingCharts] = useState(false)
  const [chartUuid, setChartUuid] = useState('')

  const isExploreEndpoint = endpointType === 'metric_query' || endpointType === 'underlying_data'

  // ── Load connections ──
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/connections')
        if (!res.ok) throw new Error('Failed')
        const data: Connection[] = await res.json()
        setConnections(data)
        if (data.length > 0) setConnectionId((prev) => prev || data[0].id)
      } catch {
        toast.error('Could not load connections.')
      } finally {
        setLoadingConnections(false)
      }
    }
    load()
  }, [])

  // ── Load explores ──
  useEffect(() => {
    if (!connectionId || !isExploreEndpoint) return
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
        setExplores(normalizeExplores(await res.json()))
      } catch {
        toast.error('Could not load explores.')
      } finally {
        setLoadingExplores(false)
      }
    }
    load()
  }, [connectionId, endpointType, isExploreEndpoint])

  // ── Load fields ──
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
        setFields(normalizeExploreFields(await res.json()))
      } catch {
        toast.error('Could not load explore fields.')
        setFields({ dimensions: [], metrics: [], fallback: true })
      } finally {
        setLoadingFields(false)
      }
    }
    load()
  }, [connectionId, exploreName])

  // ── Load charts ──
  useEffect(() => {
    if (!connectionId || endpointType !== 'saved_chart') return
    setCharts([])
    setChartUuid('')
    setLoadingCharts(true)
    async function load() {
      try {
        const res = await fetch(`/api/lightdash/charts?connectionId=${connectionId}`)
        if (!res.ok) throw new Error('Failed')
        setCharts(normalizeCharts(await res.json()))
      } catch {
        toast.error('Could not load charts.')
      } finally {
        setLoadingCharts(false)
      }
    }
    load()
  }, [connectionId, endpointType])

  // ── Emit ──
  const buildSpec = useCallback((): QuerySpec => {
    if (endpointType === 'sql') return { endpointType: 'sql', sql }
    if (endpointType === 'saved_chart') return { endpointType: 'saved_chart', chartUuid }
    const dimensions = fields.fallback ? manualDims.split(',').map((s) => s.trim()).filter(Boolean) : selectedDims
    const metrics = fields.fallback ? manualMets.split(',').map((s) => s.trim()).filter(Boolean) : selectedMets
    return { endpointType, query: { exploreName, dimensions, metrics, limit: parseInt(limit, 10) || 500 } }
  }, [endpointType, sql, chartUuid, exploreName, selectedDims, selectedMets, manualDims, manualMets, limit, fields.fallback])

  useEffect(() => {
    if (!connectionId) return
    onChange({ connectionId, endpointType, spec: buildSpec() })
  }, [connectionId, endpointType, buildSpec, onChange])

  function toggleDim(id: string) {
    setSelectedDims((p) => (p.includes(id) ? p.filter((d) => d !== id) : [...p, id]))
  }
  function toggleMet(id: string) {
    setSelectedMets((p) => (p.includes(id) ? p.filter((m) => m !== id) : [...p, id]))
  }

  // ── Render ──
  return (
    <FieldGroup className="gap-5">
      {/* Connection */}
      <Field>
        <FieldLabel>Connection</FieldLabel>
        {loadingConnections ? (
          <Skeleton className="h-9 w-full rounded-lg" />
        ) : connections.length === 0 ? (
          <Alert>
            <Info />
            <AlertTitle>No connections yet</AlertTitle>
            <AlertDescription>
              <Link href="/connections" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
                Add a Lightdash connection <ArrowUpRight className="size-3.5" />
              </Link>
            </AlertDescription>
          </Alert>
        ) : (
          <Select value={connectionId} onValueChange={(v) => v && setConnectionId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a connection…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </Field>

      {/* Endpoint type — segmented control */}
      <Field>
        <FieldLabel>Endpoint</FieldLabel>
        <ToggleGroup
          value={[endpointType]}
          onValueChange={(vals) => {
            const v = (vals as string[])[0]
            if (v) setEndpointType(v as EndpointType)
          }}
          variant="outline"
          spacing={0}
          className="w-full"
        >
          {ENDPOINTS.map((e) => (
            <ToggleGroupItem key={e.value} value={e.value} className="flex-1 text-[12.5px]">
              {e.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      {/* Conditional panels */}
      {isExploreEndpoint && (
        <ExplorePanel
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
      )}

      {endpointType === 'sql' && (
        <Field>
          <FieldLabel>SQL query</FieldLabel>
          <Textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="SELECT * FROM orders LIMIT 100"
            rows={9}
            className="resize-y font-mono text-[13px]"
          />
        </Field>
      )}

      {endpointType === 'saved_chart' && (
        <Field>
          <FieldLabel>Saved chart</FieldLabel>
          {!connectionId ? (
            <p className="text-[13px] text-muted-foreground">Select a connection first.</p>
          ) : loadingCharts ? (
            <Skeleton className="h-9 w-full rounded-lg" />
          ) : charts.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No charts found for this connection.</p>
          ) : (
            <Select value={chartUuid} onValueChange={(v) => v && setChartUuid(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a chart…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {charts.map((c) => (
                    <SelectItem key={c.uuid} value={c.uuid}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
    </FieldGroup>
  )
}

// ── Explore panel (metric_query + underlying_data) ─────────────────────────

interface ExplorePanelProps {
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

function ExplorePanel(p: ExplorePanelProps) {
  return (
    <>
      <Field>
        <FieldLabel>Explore</FieldLabel>
        {!p.connectionId ? (
          <p className="text-[13px] text-muted-foreground">Select a connection first.</p>
        ) : p.loadingExplores ? (
          <Skeleton className="h-9 w-full rounded-lg" />
        ) : p.explores.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No explores found.</p>
        ) : (
          <Select value={p.exploreName} onValueChange={(v) => v && p.onExploreChange(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an explore…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {p.explores.map((e) => (
                  <SelectItem key={e.name} value={e.name}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </Field>

      {p.exploreName && (
        <>
          {p.loadingFields ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : p.fields.fallback ? (
            <>
              <Alert>
                <Info />
                <AlertTitle>Manual field entry</AlertTitle>
                <AlertDescription>Fields couldn&apos;t be auto-loaded. Enter field IDs, comma-separated.</AlertDescription>
              </Alert>
              <Field>
                <FieldLabel>Dimensions</FieldLabel>
                <Input
                  value={p.manualDims}
                  onChange={(e) => p.onManualDimsChange(e.target.value)}
                  placeholder="orders_status, orders_created_date"
                  className="font-mono text-[13px]"
                />
              </Field>
              <Field>
                <FieldLabel>Metrics</FieldLabel>
                <Input
                  value={p.manualMets}
                  onChange={(e) => p.onManualMetsChange(e.target.value)}
                  placeholder="orders_total_revenue, orders_count"
                  className="font-mono text-[13px]"
                />
              </Field>
            </>
          ) : (
            <>
              {p.fields.dimensions.length > 0 && (
                <ChipField label="Dimensions" count={p.selectedDims.length} items={p.fields.dimensions} selected={p.selectedDims} onToggle={p.onToggleDim} />
              )}
              {p.fields.metrics.length > 0 && (
                <ChipField label="Metrics" count={p.selectedMets.length} items={p.fields.metrics} selected={p.selectedMets} onToggle={p.onToggleMet} />
              )}
              {p.fields.dimensions.length === 0 && p.fields.metrics.length === 0 && (
                <p className="text-[13px] text-muted-foreground">No fields found for this explore.</p>
              )}
            </>
          )}
        </>
      )}

      <Field>
        <FieldLabel>Row limit</FieldLabel>
        <Input
          type="number"
          min={1}
          max={5000}
          value={p.limit}
          onChange={(e) => p.onLimitChange(e.target.value)}
          className="w-32 tabular-nums"
        />
      </Field>
    </>
  )
}

function ChipField({
  label,
  count,
  items,
  selected,
  onToggle,
}: {
  label: string
  count: number
  items: FieldItem[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <Field>
      <FieldLabel className="flex items-center gap-1.5">
        {label}
        {count > 0 && <span className="font-normal text-muted-foreground">· {count} selected</span>}
      </FieldLabel>
      <div className="max-h-[176px] overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
        <div className="flex flex-wrap gap-1.5">
          {items.map((f) => (
            <Toggle
              key={f.id}
              pressed={selected.includes(f.id)}
              onPressedChange={() => onToggle(f.id)}
              size="sm"
              variant="outline"
              className="h-7 rounded-full bg-background px-3 text-[12px] font-normal aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {f.label}
            </Toggle>
          ))}
        </div>
      </div>
    </Field>
  )
}
