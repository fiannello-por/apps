import { z } from 'zod'

export const connectionInput = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  projectUuid: z.string().min(1),
  token: z.string().min(1),
})

export const querySpecSchema = z.object({
  endpointType: z.enum(['metric_query', 'sql', 'saved_chart', 'underlying_data']),
  query: z
    .object({
      exploreName: z.string(),
      dimensions: z.array(z.string()),
      metrics: z.array(z.string()),
      filters: z.unknown().optional(),
      sorts: z.array(z.unknown()).optional(),
      limit: z.number().optional(),
      tableCalculations: z.array(z.unknown()).optional(),
    })
    .optional(),
  sql: z.string().optional(),
  chartUuid: z.string().optional(),
  pageSize: z.number().optional(),
})

export const runInput = z.object({
  connectionId: z.string().uuid(),
  testRunId: z.string().uuid().optional(),
  iterationIndex: z.number().default(0),
  spec: querySpecSchema,
  includeRaw: z.boolean().optional(),
})

export const testRunInput = z.object({
  connectionId: z.string().uuid(),
  spec: querySpecSchema,
  mode: z.enum(['single', 'concurrent']),
  concurrency: z.number().min(1).max(200).default(1),
  iterations: z.number().min(1).max(2000).default(1),
})
