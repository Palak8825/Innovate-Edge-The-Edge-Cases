# Bakaya — Agentic MSME Accounts-Receivable Desk

**Team:** The Edge Cases · **Hackathon:** InnovateZ 2026 (Round 2)

Bakaya is an accounts-receivable (AR) desk for Indian MSME suppliers who are
owed money by larger buyers and cannot afford a collections team. It tracks
overdue invoices, computes the **statutory interest and legal position** an MSME
is entitled to under the MSMED Act 2006, escalates each invoice through a
5-stage ladder, and uses an LLM to draft the actual recovery message — in the
buyer's language and at the right tone for the stage.

**Live demo:** https://innovate-edge--palakagarwal882.replit.app/

---

## 1. What this solves (problem & user flow)

Indian MSMEs are collectively owed thousands of crores in delayed B2B payments.
The law is strongly on the supplier's side (MSMED Act s.15/s.16, Income Tax Act
s.43B(h)), but most suppliers don't know the exact interest they can claim, the
eligibility rules, or the escalation path — and can't staff a recovery desk.

**User flow:**
1. Add a **buyer** (name, contact, preferred language).
2. Add an **invoice** against that buyer (amount, invoice date, due date).
3. Bakaya computes, per invoice: days overdue, statutory eligibility, compound
   interest, total payable, the current escalation stage, and whether the
   Section 43B(h) tax lever applies.
4. On the invoice page the supplier can **draft a recovery message** (LLM) and
   **escalate** the invoice to the next stage, choosing a channel.
5. The **dashboard** aggregates the whole book: total outstanding, interest
   accrued, and how many invoices are ODR-ready.

---

## 2. Under the hood (how it actually works)

### Data flow for a single request
```
React UI (Add Invoice / Invoice Detail)
        │  TanStack Query hook (generated from OpenAPI)
        ▼
Express API  /api/invoices, /api/buyers, /api/dashboard, /api/draft
        │  Zod validation (generated from the same OpenAPI spec)
        ▼
Rules engine (lib/interest.ts)  ── deterministic, no LLM ──
   • eligibility (Silpi Industries, SC 2021)
   • compound interest, monthly rests (MSMED Act s.16)
   • escalation stage (5-stage state machine)
   • Section 43B(h) flag
        │  finished numbers
        ▼
Drafting layer (/api/draft → Groq llama-3.3-70b)  ── LLM ──
   writes the human message AROUND the numbers; never computes them
        │  (on any failure → deterministic template fallback)
        ▼
Dispatch (/api/invoices/:id/send → lib/notify → Gmail SMTP)  ── email ──
   renders stage-coloured HTML, sends (EMAIL_MODE=real) or logs (simulation)
        │
        ▼
Postgres (Drizzle ORM): buyers, invoices, escalation_events
```

### The rules engine (the part a generic LLM cannot do)
`artifacts/api-server/src/lib/interest.ts` is pure, auditable TypeScript:

- **Eligibility** — MSMED s.16 protection applies only if the supplier's Udyam
  registration pre-dates the invoice date (*Silpi Industries v. KSRTC*, SC 2021).
- **Interest** — compound with monthly rests at **3 × RBI Bank Rate**.
  As of June 2026 the Bank Rate is **5.50%**, so the statutory rate is **16.5%
  p.a.** (Note: this is the *Bank Rate*, not the repo rate — the two diverged
  after the Dec 2025 repo cut. To update, change `RBI_BANK_RATE` in one place.)
- **Escalation ladder (5-stage, clock = days since invoice date):**

  | Stage | Days since invoice | Interest | 43B(h) | Action |
  |---|---|---|---|---|
  | `none` | 0–29 | no | no | monitor only |
  | `nudge` | 30–45 | no | no | proactive, pre-deadline, relationship-safe |
  | `tax_nudge` | 46–74 | yes | yes | interest accruing + 43B(h) tax lever |
  | `formal_demand` | 75–89 | yes | yes | formal demand notice |
  | `odr_ready` | 90+ | yes | yes | ODR pack → odr.msme.gov.in |

### The drafting layer
`POST /api/invoices/:id/draft` loads the invoice + buyer, runs the rules engine,
and sends the **finished numbers** to Groq (`llama-3.3-70b-versatile`) with a
tone chosen by stage and the output language set to the buyer's language
(English / Hindi / Tamil). The LLM is forbidden from changing any number. If
Groq is unavailable (no key, rate limit, network), the route falls back to a
deterministic template, so it can never hard-fail. The response includes
`"source": "llm" | "fallback"` so the behaviour is transparent.

---

## 3. Data sources & references
- **MSMED Act 2006** — s.15 (45-day limit), s.16 (compound interest at 3× Bank Rate).
- **Income Tax Act, Section 43B(h)** — buyer can deduct the expense only when paid.
- **Silpi Industries v. Kerala SRTC (Supreme Court, 2021)** — Udyam-must-predate-invoice eligibility rule.
- **RBI Bank Rate** (live macro input): 5.50% as of June 2026 → 16.5% statutory rate.
- **MSME ODR Portal** — odr.msme.gov.in (escalation destination).
- **Groq API** — `llama-3.3-70b-versatile` for message drafting only.
- **Sample/mock data:** there is no seed script — a fresh clone starts with an
  empty database. Demo buyers and invoices are created manually through the
  app's Add Buyer / Add Invoice flow (the public deployment is already populated
  with example data for demonstration).

---

## 4. Value beyond a generic LLM
Upload the same invoice to ChatGPT/Claude/Gemini and it cannot reliably:
- compute compound interest with monthly rests at the **live** RBI Bank Rate
  (it doesn't know today's rate, and LLMs are unreliable at this arithmetic);
- apply the **Silpi eligibility rule** (Udyam date vs invoice date);
- maintain an **escalation state machine** across a whole book of invoices and
  persist it;
- decide **when** the 43B(h) lever becomes applicable.

In Bakaya the LLM does exactly one job — turning audited numbers into a polite,
correctly-toned, multilingual message — while every legal/financial figure is
produced by deterministic, auditable code. That separation is the product.

---

## 5. Architecture & stack
- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend** (`artifacts/bakaya`): React + Vite, wouter routing, TanStack Query, shadcn UI, recharts
- **Backend** (`artifacts/api-server`): Express 5
- **Database** (`lib/db`): PostgreSQL + Drizzle ORM — tables: `buyers`, `invoices`, `escalation_events`
- **Contract-first API:** OpenAPI spec (`lib/api-spec`) → Orval codegen → typed React Query hooks (client) + Zod validators (server), so frontend and backend can never drift
- **LLM:** Groq `llama-3.3-70b-versatile` via the drafting route
- **Deployment:** Replit (autoscale); API on :8080, frontend on :26196, served behind a shared proxy

---

## 6. Setup & usage

### Prerequisites
- Node.js 24, pnpm, a PostgreSQL database, a free Groq API key (console.groq.com)

### Environment variables
| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `lib/db` | Postgres connection string |
| `GROQ_API_KEY` | `/api/draft`, `/api/invoices/:id/send` | free-tier Groq key; without it, drafting falls back to templates |
| `PORT` | api-server | API port (8080 in this setup) |
| `EMAIL_MODE` | `lib/notify` | `real` to actually send via Gmail SMTP; `simulation` (default) logs only |
| `GMAIL_ADDRESS` | `lib/notify` | sending Gmail account (when `EMAIL_MODE=real`) |
| `GMAIL_APP_PASSWORD` | `lib/notify` | 16-char Google App Password (not your normal password) |
| `DEMO_RECIPIENT_EMAIL` | `/api/invoices/:id/send` | optional: redirects all notices to one inbox so the demo never emails a real buyer |

On Replit these are set in **Secrets**; locally, export them in your shell.

### Install & run
```bash
pnpm install
pnpm --filter @workspace/db run push          # create/sync DB schema
pnpm --filter @workspace/api-server run dev    # API on :8080
pnpm --filter @workspace/bakaya run dev        # frontend on :26196
```
Other useful commands:
```bash
pnpm run typecheck                              # typecheck all packages
pnpm run build                                  # typecheck + build
pnpm --filter @workspace/api-spec run codegen   # regenerate hooks/validators after spec changes
```

### Quick API check
```bash
curl localhost:80/api/invoices
curl -X POST localhost:80/api/invoices/3/draft   # → {"stage":..., "source":"llm", "message":...}
curl -X POST localhost:80/api/invoices/3/send    # drafts + emails; → {"deliveryStatus":"sent"|"simulated", ...}
```

> **Note:** a freshly cloned + migrated database is **empty**. Add a buyer and an
> invoice through the UI (or `POST /api/buyers` then `POST /api/invoices`) before
> the dashboard and drafting flows show data. The live deployment is already
> populated with example invoices for demonstration.

---

## 7. Demo scenario
**Input:** invoice INV-2026-003, National Auto Components, ₹95,000, invoice
dated ~110 days ago.
**Processing:** rules engine → eligible, past the 45-day limit, compound interest
≈ ₹2,811, total payable ≈ ₹97,811, 43B(h) applies, stage = `odr_ready`.
**Output:** `POST /api/invoices/3/draft` returns an LLM-written recovery notice
in the buyer's language stating the principal, accrued interest, total payable,
the 43B(h) tax consequence, and the ODR escalation path — signed "Accounts Desk
(via Bakaya)".
**Why useful:** the supplier gets a legally-grounded, correctly-calculated,
ready-to-send message they could not have produced themselves or via a generic
chatbot.

---

## 8. Status — what's working, mocked, and next
**Working (end-to-end, on real persistence):**
- Add buyer / add invoice / list / detail — all persisted in Postgres
- Editable buyer email, saved to the DB (used as the notice recipient)
- Rules engine: eligibility, compound interest, 5-stage ladder, 43B(h) flag (deterministic & auditable)
- Dashboard computed from live DB queries
- LLM drafting via Groq with deterministic fallback (`source` field exposes which ran)
- **Real email dispatch** — `POST /api/invoices/:id/send` drafts the notice via
  Groq, renders a stage-coloured HTML email (invoice breakdown + legal footer),
  and sends it via Gmail SMTP through a `notify` layer. An `EMAIL_MODE` env var
  switches between `real` (actually sends) and `simulation` (logs only, default).
  Wired to the UI: "Confirm & Send" on the invoice page with the Email channel
  hits this route. Each send logs an escalation event (`channel="email"`,
  owner-approved) and returns `deliveryStatus` (`sent`/`simulated`/`failed`).
- One-click escalate + mark-paid; escalation events logged with channel + language
- Deployed and publicly reachable

**Mocked / seeded / demo-scoped:**
- No seed script — a fresh clone starts empty; demo data is entered through the UI (the live deployment is pre-populated)
- Supplier Udyam date is a single demo constant (a multi-tenant build would read it per-supplier)
- **Demo email routing:** `DEMO_RECIPIENT_EMAIL`, when set, redirects all notices
  to one inbox so the demo never emails a real buyer. Unset it (and the route
  uses the buyer's stored email) for production behaviour.

**Not yet built (roadmap):**
- **WhatsApp delivery** — email is live; WhatsApp is a recorded channel only, not yet dispatched.
- **Autonomous escalation sweep** — escalation/send is currently one-click per
  invoice; a scheduled sweep that advances the whole book (with owner approval
  gating the legal stages) is the planned "agentic" step.
- **Invoice ingestion** — currently manual entry; Tally/spreadsheet/OCR import is future work.
- **Multi-tenancy & auth.**
