import { pgTable, text, timestamp, integer, jsonb, uuid, pgEnum, real } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const endpointType = pgEnum('endpoint_type', ['metric_query', 'sql', 'saved_chart', 'underlying_data'])
export const runMode = pgEnum('run_mode', ['single', 'concurrent'])
export const runStatus = pgEnum('run_status', ['running', 'completed', 'failed', 'partial'])
export const execStatus = pgEnum('exec_status', ['ok', 'error', 'timeout'])

export const connections = pgTable('connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  projectUuid: text('project_uuid').notNull(),
  encryptedToken: text('encrypted_token').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const testRuns = pgTable('test_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').references(() => connections.id).notNull(),
  endpointType: endpointType('endpoint_type').notNull(),
  payload: jsonb('payload').notNull(),
  mode: runMode('mode').notNull(),
  concurrency: integer('concurrency').notNull().default(1),
  iterations: integer('iterations').notNull().default(1),
  status: runStatus('status').notNull().default('running'),
  aggregates: jsonb('aggregates'),
  createdBy: uuid('created_by').references(() => users.id),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
})

export const queryExecutions = pgTable('query_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  testRunId: uuid('test_run_id').references(() => testRuns.id).notNull(),
  iterationIndex: integer('iteration_index').notNull(),
  status: execStatus('status').notNull(),
  submitMs: real('submit_ms'),
  queueTimeMs: real('queue_time_ms'),
  warehouseExecMs: real('warehouse_exec_ms'),
  pollOverheadMs: real('poll_overhead_ms'),
  resultsFetchMs: real('results_fetch_ms'),
  totalWallClockMs: real('total_wall_clock_ms'),
  lightdashQueryUuid: text('lightdash_query_uuid'),
  serverPerf: jsonb('server_perf'),
  rowCount: integer('row_count'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
})
