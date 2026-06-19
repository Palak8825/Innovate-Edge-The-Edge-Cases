# Bakaya — MSME AR Desk

AI-powered accounts receivable automation for Indian MSMEs: tracks overdue invoices, auto-escalates through a 5-stage ladder, calculates compound interest at 3× RBI rate, and assembles ODR filing packs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (wouter routing, TanStack Query, shadcn UI, recharts)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → `@workspace/api-client-react` hooks)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — source of truth for DB schema (buyers, invoices, escalation_events)
- `lib/api-spec/openapi.yaml` — source of truth for API contract
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas (do not edit)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/interest.ts` — MSMED interest calc (3× RBI = 19.5% p.a., compound, after 45 days)
- `artifacts/bakaya/src/pages/` — all frontend pages
- `artifacts/bakaya/src/index.css` — theme tokens (deep indigo primary, warm off-white)

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives both Zod validators (server) and React Query hooks (client) via Orval codegen. Run `pnpm --filter @workspace/api-spec run codegen` after spec changes.
- **Interest calc**: MSMD Act mandates compound interest at 3× RBI Bank Rate (currently 6.5% → 19.5% p.a.) from day 45 of the due date. Section 43B(h) disallows buyer tax deduction on unpaid MSME invoices.
- **5-stage escalation ladder**: none → nudge (day 30) → tax_nudge (day 46) → formal_demand (day 75) → odr_ready (day 90+). Each stage generates a multilingual message (Tamil/Hindi/English) via `generateEscalationMessage()`.
- **ODR pack**: At odr_ready stage the UI surfaces a "Submit to ODR Portal" button linking to odr.msme.gov.in.
- **Shared proxy**: API at `/api/*` (port 8080), frontend at `/` (port 26196). Use `localhost:80/api/...` for curl tests — never direct port access.

## Product

- **Dashboard**: total outstanding, overdue amount, escalation stage bar chart, recent communication activity
- **Invoice management**: list with status/stage filter + search, detail view with interest meter and escalation timeline
- **Buyer management**: card grid with outstanding balance, per-buyer invoice history
- **Escalation**: one-click escalation to next stage with WhatsApp/Email/System channel choice; multilingual auto-drafted message shown in communication history
- **Interest calculator**: shows principal, accrued interest (compound at 19.5%), total due, daily interest, Section 43B(h) applicability
- **ODR filing pack**: assembled automatically when invoice crosses 90 days; links directly to odr.msme.gov.in

## User preferences

_No explicit preferences recorded yet._

## Gotchas

- After changing `routes/index.ts`, the API server must be restarted to pick up new routers.
- After changing the OpenAPI spec, run codegen before building frontend.
- `pnpm run typecheck:libs` is needed before leaf checks when lib packages change.
- The `amount` column in `invoicesTable` is `numeric` (stored as string by pg driver) — always `parseFloat()` before arithmetic.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
