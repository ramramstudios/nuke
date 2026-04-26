# NUKE (Networked User Knowledge Eraser)

NUKE is a lightweight privacy tool that discovers where personal data is exposed online and orchestrates its removal across data broker networks. It combines automated workflows, centralized request dispatching (inspired by California's DROP platform), and guided manual actions when automation isn't possible.

---

## What This App Currently Does

- Creates user accounts and stores onboarding data as encrypted profile snapshots.
- Runs a simulated broker exposure scan so the dashboard has discovery results to work with.
- Creates one deletion request plus per-broker removal requests when a user submits removal.
- Sends real outbound email requests for the current vetted email brokers when live email mode is enabled.
- Stores outbound delivery evidence like provider message ids, timestamps, errors, retry counters, and per-attempt retry audit records.
- Accepts inbound broker replies through `/api/inbound/email`, matches them back to broker workflows, and stores match confidence plus signal traces.
- Classifies inbound replies into acknowledgment, completion, rejection, needs-more-info, or noise with a review flag for uncertain cases.
- Falls back to manual-link workflows for brokers that are not yet automated or when automation fails.
- Automatically retries email brokers that never respond, following a defined retry schedule (7d → 14d → escalate), and escalates unresponsive requests for manual review.
- Offers a managed-service pilot package with saved enrollment state, seat limits, manual-invoice billing, and dashboard-visible support checkpoints for human follow-up handling.
- Includes a Playwright form-automation foundation with reusable browser-session helpers, artifact capture, and a form-foundation smoke test.
- Converts blocked broker automations into explicit user chores with blocker reasons, direct handoff links, and evidence-backed request state, including CAPTCHA, bot-check, rate-limit, email-confirmation, identity-verification, profile-URL, and record-selection blockers.
- Persists form-automation evidence for support review, including run IDs, artifact directories, screenshots, logs, metadata, trace paths, final URLs, blocker reasons, and timeline-visible evidence events.
- Queues form automations as asynchronous database-backed jobs with retries, stale-lock recovery, concurrency controls, and per-broker cooldown throttling while keeping email broker requests immediate.
- Shows operator coverage and handoff reporting on the metrics dashboard, including automatic, assisted, blocked, and manual broker status, blocker mix, queue pressure, and per-broker next actions.

What is still limited today:

- Scan/discovery is still simulated.
- Form broker execution now includes broker-specific assisted flows for Spokeo, Advanced Background Checks, FamilyTreeNow, Nuwber, SmartBackgroundChecks, and That's Them. They run through the automation queue, reach the farthest reliable step automatically, then hand the user into the exact remaining chore with blocker classification and evidence. FastPeopleSearch still has an experimental runner, but live bot-check challenges make it a weaker practical target right now.
- Reply classification is rule-based and will need tuning as real broker traffic accumulates.
- Many brokers are form-driven or verification-driven flows, so “real automation” is currently strongest for the vetted email subset.
- Managed-service billing is manual for the pilot cohort; Stripe/self-serve subscription checkout is still future work.

---

## Quick Start

### Prerequisites

- **Node.js 20.9+** (required by Next.js 16) — check with `node -v`
- npm 10+ (ships with Node 20)
- Git

Install Node 20+ if needed:

```bash
# macOS (Homebrew)
brew install node@22

# Or use nvm
nvm install 22
nvm use 22
```

If Homebrew installs Node 22 but your shell still uses an older Node, add the repo-friendly path fix:

```bash
# Intel Macs
echo 'export NODE_BIN_DIR="/usr/local/opt/node@22/bin"' >> ~/.zshrc
echo 'export PATH="$NODE_BIN_DIR:$PATH"' >> ~/.zshrc

# Apple Silicon Macs
# echo 'export NODE_BIN_DIR="/opt/homebrew/opt/node@22/bin"' >> ~/.zshrc
# echo 'export PATH="$NODE_BIN_DIR:$PATH"' >> ~/.zshrc

source ~/.zshrc
node -v
npm -v
```

### Setup

```bash
# 1. Clone and install
git clone <repo-url> nuke && cd nuke
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — generate a real ENCRYPTION_KEY:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Generate a real JWT_SECRET:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Initialize database and seed brokers
npx prisma db push
npm run db:seed

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Spin Up Commands

For the email automation pilot, the quickest real-send path without buying a domain is Gmail SMTP:

```bash
# 1. Make sure Node 22 is active in this shell
export NODE_BIN_DIR="${NODE_BIN_DIR:-/usr/local/opt/node@22/bin}"
export PATH="$NODE_BIN_DIR:$PATH"

# 2. Launch the live email pilot with Gmail SMTP
GMAIL_SMTP_USER=you@gmail.com GMAIL_SMTP_APP_PASSWORD="xxxx xxxx xxxx xxxx" ./script.sh email-live
```

If you install Node with `nvm` or the official Node installer instead of Homebrew, run `unset NODE_BIN_DIR` first so the script uses your active `node` from `PATH`.

If you want a safe rehearsal first, use:

```bash
./script.sh email-dry-run
```

### First Run Walkthrough

1. Click **Get Started** → create an account (email + password)
2. Enter your personal information (encrypted before storage)
3. You're redirected to the **Dashboard**
4. Click **Run Scan** → discovers simulated exposures across the seeded broker registry
5. Click **Submit Removal** → dispatches deletion requests to all brokers
6. Requests with `requires_user_action` status show direct removal links
7. Hit `POST /api/simulate` to advance the simulation (brokers acknowledge/complete)

Email-method brokers can now be piloted with real outbound delivery by setting either Resend or Gmail SMTP:

```bash
# Resend
EMAIL_DELIVERY_MODE=resend
EMAIL_FROM=privacy@yourdomain.com
RESEND_API_KEY=re_...

# Gmail SMTP
EMAIL_DELIVERY_MODE=gmail-smtp
GMAIL_SMTP_USER=you@gmail.com
GMAIL_SMTP_APP_PASSWORD=xxxx xxxx xxxx xxxx
# The script will set EMAIL_FROM to match GMAIL_SMTP_USER
```

By default, the app stays in `dry-run` mode and records a synthetic provider message id without sending.

If you want a one-command live pilot once Node 22 is available, use either:

```bash
# Resend
EMAIL_FROM=privacy@yourdomain.com RESEND_API_KEY=re_... ./script.sh email-live

# Gmail SMTP
GMAIL_SMTP_USER=you@gmail.com GMAIL_SMTP_APP_PASSWORD="xxxx xxxx xxxx xxxx" ./script.sh email-live
```

That command will install dependencies, prepare `.env`, switch delivery to `resend` or `gmail-smtp`, push the Prisma schema, seed brokers, and start the dev server.

To run the Phase 1 live smoke test against one real email broker after you complete onboarding, use:

```bash
./script.sh email-brokers

# Resend
EMAIL_FROM=privacy@yourdomain.com RESEND_API_KEY=re_... ./script.sh email-smoke-test you@example.com "Epsilon"

# Gmail SMTP
GMAIL_SMTP_USER=you@gmail.com GMAIL_SMTP_APP_PASSWORD="xxxx xxxx xxxx xxxx" ./script.sh email-smoke-test you@example.com "Epsilon"
```

The smoke test sends one live broker email, then prints the stored `providerMessageId`, request ids, status, and timestamps from the database so you can confirm real provider acceptance.

For Gmail SMTP, use a Google App Password after enabling 2-Step Verification. The app sends from `GMAIL_SMTP_USER`, and `EMAIL_FROM` is automatically aligned to that Gmail address for the SMTP transaction.

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── onboarding/page.tsx         # Registration + profile intake
│   ├── dashboard/page.tsx          # Main dashboard UI
│   ├── dashboard/managed-service/  # Concierge pilot package + support status
│   └── api/
│       ├── auth/{register,login,me}/  # JWT auth endpoints
│       ├── intake/                    # PII submission (encrypted)
│       ├── scan/                      # Discovery engine trigger
│       ├── requests/                  # Unified deletion dispatch + status
│       ├── brokers/                   # Broker registry list
│       ├── managed-service/           # Concierge pilot enrollment + status
│       ├── custom-request/            # Ad-hoc URL removal
│       ├── inbound/email/              # Inbound broker email webhook
│       ├── cron/                      # Maintenance jobs endpoint
│       └── simulate/                  # MVP: advance broker responses
├── lib/
│   ├── auth/          # JWT signing/verification, bcrypt passwords
│   ├── crypto/        # AES-256-GCM encryption for PII fields
│   ├── brokers/       # Broker seed registry and opt-out metadata
│   ├── crawler/       # Discovery/scanning engine
│   ├── dispatcher/    # DROP-style centralized deletion dispatch
│   ├── automation/    # Playwright foundation, form runners, artifact capture
│   ├── removal/       # Removal engine (API → form → email → fallback)
│   ├── compliance/    # SLA tracking, overdue detection, status summaries
│   ├── communications/  # Inbound message ingestion & matching
│   ├── jobs/          # Background job scheduler
│   └── db.ts          # Prisma client singleton
├── components/
│   ├── StatusBadge.tsx    # Color-coded status labels
│   └── SLACountdown.tsx   # Days-remaining / overdue indicator
prisma/
├── schema.prisma      # Full data model
└── seed.ts            # Seeds the broker registry into the database
```

---

## Core Concepts

### Unified Deletion Request (DROP-style)

Users submit their data **once**. The system:
1. Encrypts and snapshots the PII
2. Fans out `RemovalRequest` records to every active broker
3. Each request follows the removal priority chain:
   - API call → Form automation → Email → **Fallback: user-actionable link**

### Broker Registry

Dozens of broker records are seeded across categories:
- **People search**: Spokeo, BeenVerified, Whitepages, Radaris, etc.
- **Data brokers**: Acxiom, LexisNexis, CoreLogic, Epsilon
- **Marketing/analytics**: LiveRamp, Clearbit, FullContact

Each broker defines: domain, search method, removal method, SLA, tier, priority, and opt-out instructions.

### Removal Priority Chain

```
1. API (programmatic DELETE)
2. Form (queued Playwright-assisted automation when enabled)
3. Email (structured deletion request)
4. Manual Link (discovers opt-out URL, shows to user)
```

If any automated method fails, the system falls back to discovering the broker's privacy/opt-out page and presenting it to the user with instructions.

### Compliance Tracking

Every `RemovalRequest` tracks:
- Status: `pending` → `submitted` → `acknowledged` → `completed`
- Or: `requires_user_action` / `rejected`
- SLA deadline (default 45 days from submission)
- Overdue detection

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Current user + profile status |
| POST | `/api/intake` | Submit/update PII (encrypted) |
| POST | `/api/scan` | Trigger exposure scan |
| GET | `/api/scan` | List past scans + exposures |
| POST | `/api/requests` | Submit centralized deletion request |
| GET | `/api/requests` | Compliance summary |
| GET | `/api/requests?detail=true` | Per-broker request details |
| GET | `/api/brokers` | List active brokers |
| GET | `/api/managed-service` | Concierge pilot package + current enrollment |
| POST | `/api/managed-service` | Reserve a managed-service pilot slot |
| PATCH | `/api/managed-service` | Mark payment sent or cancel the pilot |
| POST | `/api/custom-request` | Add ad-hoc removal URL |
| GET | `/api/custom-request` | List custom requests |
| POST | `/api/simulate` | MVP: advance broker responses |
| POST | `/api/inbound/email` | Receive inbound broker email (webhook) |
| POST | `/api/cron` | Run maintenance cycle |

---

## Security

- **PII encryption**: All personal data encrypted with AES-256-GCM before storage
- **Auth**: HTTP-only JWT cookies, bcrypt password hashing (12 rounds)
- **Separation**: Raw user data vs. derived/crawled data stored separately
- **No PII logging**: Sensitive fields never logged
- **Secrets**: All keys via environment variables

---

## Inbound Email Ingestion (Phase 2)

Broker replies are received via `POST /api/inbound/email`, a webhook-style endpoint protected by `INBOUND_WEBHOOK_SECRET` (bearer token, fail-closed).

### How it works

1. An email provider, forwarding service, or small relay posts inbound email events to the webhook.
2. The endpoint normalizes the provider payload into a common shape, then runs multi-signal matching:
   - **Thread references** (In-Reply-To / References / provider thread id) → highest-confidence match against `outboundMessageId` or `providerMessageId` on `RemovalRequest`
   - **Sender address** → exact match against broker `removalEndpoint`
   - **Sender domain** → matches against `Broker.domain`, `Broker.removalEndpoint`, or known alias domains
   - **Request context** → active status and recency within a 90-day window boost match confidence
   - **Subject heuristics** → broker name in subject provides a minor signal
3. Candidates are scored and ranked. If the top two candidates are too close in score with different requests, the match is marked `ambiguous` instead of guessing.
4. The normalized message, match result, confidence score, and signal audit trail are persisted as an `InboundMessage` record.
5. A rule-based reply classifier evaluates the subject and body to assign a classification label:
   - **acknowledgment** — broker confirms receipt or says the request is being processed
   - **completion** — broker confirms data was removed, suppressed, or opt-out processed
   - **rejection** — broker denies the request, reports no records found, or declares ineligibility
   - **needs_more_info** — broker asks for identity verification, additional documents, or a confirmation click
   - **noise** — auto-replies, out-of-office, delivery failures, newsletter chatter
   - Messages that don't match any pattern confidently are left unclassified (`null`).
6. Classification confidence, signal audit trail, and a `requiresReview` flag are persisted alongside the match data. Messages are flagged for review when confidence is low, the match is not fully resolved, or no label could be assigned.
7. When a high-confidence `needs_more_info` reply is matched to a specific removal request, a **UserTask** is auto-generated with:
   - Action type (verify_identity, provide_info, click_confirm, reply_to_broker, generic)
   - Plain-language instructions derived from classifier signals
   - Action URL extracted from the message when available
   - Due date parsed from the message or defaulting to 10 days
   - The matched `RemovalRequest` is advanced to `requires_user_action`
8. Weakly matched or low-confidence `needs_more_info` messages create `pending_review` tasks (or no task at all) instead of user-facing actions.
9. Unmatched and ambiguous messages are stored for later manual review.

### Calling the webhook

Wrapped relay payload:

```bash
curl -X POST http://localhost:3000/api/inbound/email \
  -H "Authorization: Bearer $INBOUND_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "resend",
    "payload": {
      "from": "privacy@spokeo.com",
      "to": "privacy@yourdomain.com",
      "subject": "Re: Privacy deletion request",
      "text": "Your request has been received.",
      "headers": { "In-Reply-To": "<original-message-id>" }
    }
  }'
```

Direct provider-style JSON with a provider hint:

```bash
curl -X POST "http://localhost:3000/api/inbound/email?provider=resend" \
  -H "Authorization: Bearer $INBOUND_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "privacy@spokeo.com",
    "to": "privacy@yourdomain.com",
    "subject": "Re: Privacy deletion request",
    "text": "Your request has been received.",
    "headers": { "In-Reply-To": "<original-message-id>" }
  }'
```

Response (201): `{ id, matchStatus, matchConfidence, matchSignals, matchedRemovalRequestId, matchedDeletionRequestId, matchedBrokerId, classification, classificationConfidence, requiresReview, taskId }`

### Environment

Set `INBOUND_WEBHOOK_SECRET` in `.env`. The endpoint rejects all requests if this is unset.

---

## No-Response Retry Policy (Phase 2)

Email-method broker requests that receive no meaningful response are automatically retried on a defined schedule, triggered by the maintenance cron cycle (`POST /api/cron`).

### Retry schedule

| Stage | Delay | Action |
|-------|-------|--------|
| 0 (initial send) | — | Original deletion email sent by removal engine |
| 1 | 7 days after initial send | First follow-up email |
| 2 | 14 days after stage 1 | Second follow-up email |
| 3 | 14 days after stage 2 | Escalated — marked `requires_user_action` for manual review |

### What counts as "no response"

A request is eligible for retry only when ALL of these are true:
- Method is `email` and status is `submitted`
- Retry stage has not reached the maximum
- Enough time has passed since the last attempt (per schedule above)
- No matched inbound message classified as acknowledgment, completion, rejection, or needs_more_info exists
- No pending user task (from chunk 4) blocks the request
- Noise-classified replies (auto-replies, out-of-office) do NOT suppress retries

### What suppresses retries

- Any meaningful broker response (acknowledgment, completion, rejection, needs_more_info)
- A pending or pending_review user task linked to the removal request
- Request status other than `submitted` (acknowledged, completed, rejected, requires_user_action)

### Cron integration

The retry evaluator runs as part of `runMaintenanceCycle()`. The cron response includes a `retries` object:

```json
{
  "retries": {
    "eligible": 3,
    "retried": 2,
    "escalated": 1,
    "skipped": 0,
    "errors": 0
  }
}
```

Each follow-up send, failed retry, and escalation is also persisted as a `RemovalRetryAttempt` audit record with stage, outcome, reason, timestamps, and any provider/error metadata available at the time.

Follow-up emails use stage-aware first-touch and second-touch copy. When a prior outbound message id is available, the delivery layer also attaches `Message-ID`, `In-Reply-To`, and `References` headers so retries can continue the earlier broker thread instead of starting a fresh conversation.

Broker simulation is disabled by default for cron-driven maintenance. Set `ENABLE_BROKER_SIMULATION=true` only for MVP demos where you intentionally want fake acknowledgments/completions mixed into the workflow.

### Current limitations

- No operator UI for reviewing escalated requests yet (chunk 8)
- Retry schedule is code-defined, not configurable per-broker
- Follow-up copy is stage-aware but still generic across brokers
- No Redis/BullMQ yet — email retries still run synchronously within the cron cycle

---

## Managed-Service Pilot (Phase 2)

NUKE now includes a small-cohort concierge offering for users who want human-supported submission review and follow-up handling on top of the automated email workflow.

### What the pilot includes

- One-time pilot fee of `$299`
- Up to 25 broker requests included in the package
- Two human follow-up rounds for email-driven brokers
- Weekly progress updates and a closeout summary
- Dashboard-visible status for reservation, payment submission, kickoff queue, and support checkpoints

### Billing and support flow

- Billing is **manual invoice only** for this pilot cohort
- The dashboard issues an invoice reference and tracks when the user marks payment as sent
- Kickoff is targeted within 2 business days after payment submission
- Support communication can be email-first or dashboard-first depending on the user’s selected preference

This is intentionally a pilot workflow, not a full self-serve checkout product. Stripe and broader subscription billing remain later milestones.

---

## MVP Limitations

This is a prototype focused on architecture, not production readiness:

- **Scan results are simulated** — random probability based on broker category
- **API removal methods are still stubbed** — no real HTTP calls yet
- **Broker-specific Playwright form flows are assisted, not universally end-to-end** — the browser foundation, env knobs, persisted artifact evidence, and named broker runners exist for the first priority waves, but live CAPTCHA, bot-check, and email-confirmation gates still route to user or operator chores
- **Email brokers support a phase 1 pilot** via Resend or Gmail SMTP; broker acknowledgements/completions are still simulated
- **Reply classification is rule-based** — deterministic keyword patterns, not ML; accuracy improves as real broker reply patterns accumulate
- **Only `needs_more_info` advances request status** — matched needs_more_info replies set the removal request to `requires_user_action`; other classifications are stored for review only
- **Retry follow-ups are still generic across brokers** — they now preserve thread references when possible, but broker-specific copy is still future work
- **No document upload** — tasks that require identity verification instruct the user to reply to the broker directly; file upload infrastructure is not yet built
- **Broker responses are simulated** — use `/api/simulate` to advance state
- **No real identity verification** — accounts auto-verify on registration
- **Managed-service billing is manual** — the pilot supports seat reservation and payment/status tracking, but not a real checkout processor yet
- **No cross-user operator console** — the pilot package is tracked per account today, not through a true admin role dashboard
- **No Redis/BullMQ** — form automation has an SQLite-backed queue for the MVP; a dedicated worker backend is still future work
- **SQLite** — swap to PostgreSQL for production (`DATABASE_URL` in `.env`)

---

## Roadmap

### Near-term
- [x] Playwright form automation foundation and smoke path
- [x] Broker-specific assisted Playwright automation for the first priority waves with challenge-aware handoffs
- [x] Persisted assisted-automation evidence for timeline and support review
- [x] SQLite-backed async form automation queue with retry, stale-lock recovery, concurrency, and broker cooldown controls
- [x] Coverage and handoff dashboard for automatic, assisted, blocked, and manual broker paths
- [x] Real email sending via Resend or Gmail SMTP
- [ ] Email-based identity verification
- [ ] Redis + BullMQ dedicated worker backend
- [ ] PostgreSQL migration

### Mid-term
- [ ] Real search engine + scraping pipeline
- [ ] Browser extension for live exposure detection
- [x] Inbound email ingestion webhook + matching (Phase 2, chunk 1)
- [x] Multi-signal broker reply matching with confidence scoring (Phase 2, chunk 2)
- [x] Rule-based reply classification engine (Phase 2, chunk 3)
- [x] User action task generation from broker replies (Phase 2, chunk 4)
- [x] No-response retry policy for email brokers (Phase 2, chunk 5)
- [ ] Email inbox parsing for broker confirmations
- [ ] Expand broker registry to 100+

### Long-term
- [ ] GDPR/EU broker support
- [ ] KYC-grade identity verification
- [ ] Subscription billing (Stripe)
- [ ] Public broker compliance transparency reports
- [ ] 1000+ broker coverage

---

## Scripts

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build (runs prisma generate first)
npm run start        # Start production server
npm run lint         # ESLint
npm run db:push      # Push schema to database
npm run db:seed      # Seed broker registry
npm run db:studio    # Open Prisma Studio (GUI)
npm run db:reset     # Reset DB + re-seed
npm run smoke:email  # Live email smoke test for one email broker
npm run smoke:form   # Playwright foundation smoke test for one form broker
npm run smoke:p3c4   # Assisted automation smoke for Wave 2 broker coverage
npm run smoke:p3c5   # Challenge classification and chore routing smoke test
npm run smoke:p3c6   # Assisted-automation evidence persistence smoke test
npm run smoke:p3c7   # Async automation queue and per-broker throttle smoke test
npm run smoke:p3c8   # Coverage and handoff dashboard reporting smoke test
npm run automation:install-browser  # Install Chromium for Playwright runs
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | Prisma + SQLite (PostgreSQL-ready) |
| Auth | JWT (jose) + bcrypt |
| Encryption | AES-256-GCM (Node crypto) |
| Validation | Zod |
| Styling | Tailwind CSS 4 |
| Jobs | SQLite-backed MVP queue; BullMQ + Redis planned |
| Automation | Playwright |

---

## License

Private — all rights reserved.
