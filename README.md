# NUKE (Networked User Knowledge Eraser)

NUKE is a lightweight privacy tool that discovers where personal data is exposed online and orchestrates its removal across data broker networks. It combines automated workflows, centralized request dispatching (inspired by California's DROP platform), and guided manual actions when automation isn't possible.

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

### First Run Walkthrough

1. Click **Get Started** → create an account (email + password)
2. Enter your personal information (encrypted before storage)
3. You're redirected to the **Dashboard**
4. Click **Run Scan** → discovers simulated exposures across 20 brokers
5. Click **Submit Removal** → dispatches deletion requests to all brokers
6. Requests with `requires_user_action` status show direct removal links
7. Hit `POST /api/simulate` to advance the simulation (brokers acknowledge/complete)

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── onboarding/page.tsx         # Registration + profile intake
│   ├── dashboard/page.tsx          # Main dashboard UI
│   └── api/
│       ├── auth/{register,login,me}/  # JWT auth endpoints
│       ├── intake/                    # PII submission (encrypted)
│       ├── scan/                      # Discovery engine trigger
│       ├── requests/                  # Unified deletion dispatch + status
│       ├── brokers/                   # Broker registry list
│       ├── custom-request/            # Ad-hoc URL removal
│       ├── cron/                      # Maintenance jobs endpoint
│       └── simulate/                  # MVP: advance broker responses
├── lib/
│   ├── auth/          # JWT signing/verification, bcrypt passwords
│   ├── crypto/        # AES-256-GCM encryption for PII fields
│   ├── brokers/       # Broker seed registry (20 real brokers)
│   ├── crawler/       # Discovery/scanning engine
│   ├── dispatcher/    # DROP-style centralized deletion dispatch
│   ├── removal/       # Removal engine (API → form → email → fallback)
│   ├── compliance/    # SLA tracking, overdue detection, status summaries
│   ├── jobs/          # Background job scheduler
│   └── db.ts          # Prisma client singleton
├── components/
│   ├── StatusBadge.tsx    # Color-coded status labels
│   └── SLACountdown.tsx   # Days-remaining / overdue indicator
prisma/
├── schema.prisma      # Full data model
└── seed.ts            # Seeds 20 real broker entries
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

20 real-world brokers seeded across categories:
- **People search**: Spokeo, BeenVerified, Whitepages, Radaris, etc.
- **Data brokers**: Acxiom, LexisNexis, CoreLogic, Epsilon
- **Marketing/analytics**: LiveRamp, Clearbit, FullContact

Each broker defines: domain, search method, removal method, SLA, and tier.

### Removal Priority Chain

```
1. API (programmatic DELETE)
2. Form (Playwright automation — stub in MVP)
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
| POST | `/api/custom-request` | Add ad-hoc removal URL |
| GET | `/api/custom-request` | List custom requests |
| POST | `/api/simulate` | MVP: advance broker responses |
| POST | `/api/cron` | Run maintenance cycle |

---

## Security

- **PII encryption**: All personal data encrypted with AES-256-GCM before storage
- **Auth**: HTTP-only JWT cookies, bcrypt password hashing (12 rounds)
- **Separation**: Raw user data vs. derived/crawled data stored separately
- **No PII logging**: Sensitive fields never logged
- **Secrets**: All keys via environment variables

---

## MVP Limitations

This is a prototype focused on architecture, not production readiness:

- **Scan results are simulated** — random probability based on broker category
- **Removal methods are stubbed** — no real HTTP calls, Playwright, or SMTP
- **Broker responses are simulated** — use `/api/simulate` to advance state
- **No real identity verification** — accounts auto-verify on registration
- **No Redis/BullMQ** — background jobs run synchronously via API calls
- **SQLite** — swap to PostgreSQL for production (`DATABASE_URL` in `.env`)

---

## Roadmap

### Near-term
- [ ] Playwright form automation for top 5 brokers
- [ ] Real email sending via SendGrid/Resend
- [ ] Email-based identity verification
- [ ] Redis + BullMQ for async job processing
- [ ] PostgreSQL migration

### Mid-term
- [ ] Real search engine + scraping pipeline
- [ ] Browser extension for live exposure detection
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
| Jobs (planned) | BullMQ + Redis |
| Automation (planned) | Playwright |

---

## License

Private — all rights reserved.
