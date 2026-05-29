# Lightdash Performance Control Plane

A control plane to benchmark, test, and diagnose the query latency of a
self-hosted Lightdash instance via its v2 async API. It doubles as a Lightdash
**API explorer**: a clean UI for driving the different data-retrieval endpoints
and measuring per-phase latency.

The core idea: every query run is decomposed into phases — **submit round-trip,
queue wait, warehouse execution, poll overhead, results fetch** — blending the
server's own `metadata.performance` numbers with our client wall-clock, so you
learn *where* the time went, not just how much.

See the design and plan in [`docs/superpowers/`](docs/superpowers/).

## Features

- **API Explorer** — pick a connection + endpoint (metric query / SQL / saved
  chart / underlying data), build a request, run it, and see the latency
  waterfall + raw response.
- **Concurrency test** — fire N parallel iterations and see aggregate stats
  (p50/p95/p99, min/max/mean, error rate) plus per-run breakdowns.
- **History** — every run is saved; reopen any run's waterfall, or re-run it.
- **Connections** — manage one or more Lightdash instances; tokens encrypted at
  rest.
- Account-based auth (all features gated behind sign-in).

## Tech stack

Next.js (App Router) + TypeScript · Tailwind v4 + shadcn/ui · Auth.js (credentials, JWT)
· Drizzle ORM + Vercel Postgres (Neon) · Vitest. Deployed to Vercel.

## Local development

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env.local` and fill in:

```
DATABASE_URL=    # Neon / Vercel Postgres pooled connection string
ENCRYPTION_KEY=  # 64 hex chars (32 bytes):  openssl rand -hex 32
AUTH_SECRET=     # Auth.js secret:           openssl rand -base64 33
```

`ENCRYPTION_KEY` encrypts Lightdash personal access tokens at rest (AES-256-GCM).
If you rotate it, existing stored tokens can no longer be decrypted and must be
re-entered.

### 3. Database schema

With `DATABASE_URL` set, push the schema:

```bash
npx drizzle-kit push      # or: npx drizzle-kit migrate  to apply the SQL in drizzle/
```

### 4. Run

```bash
npm run dev               # http://localhost:3000
npm test                  # unit tests (engine, crypto, pool)
npm run build             # production build
```

Sign up at `/sign-up`, then add a Lightdash connection under **Connections** and
use **Test connection** to verify it.

## Deploying to Vercel

1. **Create the Vercel project** and link this repo (`fiannello-por/apps`).
2. **Add a Postgres (Neon) store** in the Vercel dashboard; it sets
   `DATABASE_URL` for you.
3. **Set the other env vars** in Project Settings → Environment Variables:
   - `ENCRYPTION_KEY` = `openssl rand -hex 32`
   - `AUTH_SECRET` = `openssl rand -base64 33`
4. **Run migrations** against the provisioned database (locally, with the
   production `DATABASE_URL` in `.env.local`): `npx drizzle-kit push`.
5. **Deploy** (push to the connected branch, or `vercel --prod`).

### Function region & latency vantage

All timing is measured **server-side, from the Vercel function to Lightdash**, so
the measurement vantage is the deployed region. `vercel.json` pins
`regions: ["iad1"]` (US East) and sets `/api/run` `maxDuration` to 300s.

**Change the region in `vercel.json` to the one closest to your Render-hosted
Lightdash instance** — otherwise measured latency includes an avoidable
cross-region network hop. `maxDuration: 300` requires a Vercel **Pro** plan; on
Hobby it is capped at 60s (the per-query timeout default of 45s stays under
both).

### Lightdash auth scheme

The API client authenticates with `Authorization: ApiKey <personal-access-token>`
(`lib/engine/lightdash-client.ts`). If your instance expects a different scheme,
adjust the single `headers()` method there. Verify with **Test connection** after
the first deploy.
