<div align="center">

# 🎟️ LEASELOCK

### Distributed High-Concurrency Seat Allocation & Leased-Locking Engine

<p>Zero-Double-Booking Ticket Reservation Platform Built on PostgreSQL Strict Serializability, Real-Time Ephemeral Presence, and Leased Invariants.</p>

[![React 19](https://img.shields.io/badge/React-19-9DE2C0?style=for-the-badge&logo=react&logoColor=071714&labelColor=0B2B26)](https://react.dev/)
[![Express 5](https://img.shields.io/badge/Express-5-9DE2C0?style=for-the-badge&logo=express&logoColor=071714&labelColor=0B2B26)](https://expressjs.com/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-9DE2C0?style=for-the-badge&logo=postgresql&logoColor=071714&labelColor=0B2B26)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-9DE2C0?style=for-the-badge&logo=docker&logoColor=071714&labelColor=0B2B26)](https://www.docker.com/)
[![Render](https://img.shields.io/badge/Render-Deployed-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com)

**"The seat is not yours until the database commits that it is."**

[Run Locally](#-run-locally) · [System Architecture](#-system-architecture) · [Concurrency Guarantees](#-concurrency--double-booking-protection) · [Live Presence](#-real-time-live-ghost-selection-presence) · [API Specification](#-api-specification) · [Verification & Load Testing](#-verification--stress-testing)

</div>

<br>

> [!IMPORTANT]
> **Production-Grade Concurrency Demonstration:** LeaseLock is an advanced distributed systems and transactional web architecture project. Financial transactions and refunds use a deterministic mock payment state engine with full cryptographic idempotency keys to demonstrate zero race conditions and zero double-booking under extreme load.

---

## 📌 The Core Problem

When thousands of users simultaneously click the exact same front-row seat during a high-demand flash sale (concerts, flight bookings, transit ticketing):
1. **Naive read-then-write logic creates Double-Bookings** (Lost Updates / Race Conditions).
2. **Client-side countdown timers drift or get manipulated**, leading to seat hoarding.
3. **Database deadlocks occur** when concurrent transactions lock rows in arbitrary order.
4. **Network disconnects during payment trap seats** in permanent orphaned holds.

**LeaseLock solves this through a multi-layered concurrency engine:**
- **Strict Row Serialization:** Deterministic sorted `SELECT ... FOR UPDATE` row locks.
- **Database Advisory Locks:** `pg_try_advisory_xact_lock` prevents background expiry worker collisions.
- **Hard Unique Constraints:** Relational partial indexes guarantee strictly **1 winner per seat** ($N$ requests $\to 1$ commit, $N-1$ immediate `409 Conflict`).
- **Real-Time Ephemeral Ghost Presence:** SSE broadcasts live user selections sub-50ms across all viewers before an atomic hold is even created.
- **Self-Healing Lease Management:** Persistent floating checkout banner with 1-click hold resumption across all payment states (`PENDING_PAYMENT`, `PAYMENT_FAILED`) and explicit immediate hold cancellation.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Clients["Client Layer (React 19 + Vite)"]
        UserA["User A (Browser)"]
        UserB["User B (Browser)"]
        Admin["Admin Dashboard"]
    end

    subgraph Edge["API & Orchestration Layer (Node.js / Express 5)"]
        AuthMiddleware["Auth & Session Middleware (HTTP-only Cookies)"]
        RateLimiter["Rate Limiting & Helmet Guard"]
        IdempotencyLayer["Idempotency Key Guard (SHA-256 Hashing)"]
        HoldEngine["Hold & Allocation Engine"]
        PaymentEngine["Stateful Payment Simulation"]
        SSEBroadcaster["SSE Event Stream Broadcaster"]
        DraftManager["In-Memory Ephemeral Draft Registry"]
    end

    subgraph Workers["Background Daemons"]
        ExpiryWorker["Hold Expiry Daemon (10s Polling)"]
        WaitlistWorker["Waitlist Auto-Promotion Worker"]
    end

    subgraph Storage["Durable Storage Layer (PostgreSQL 17 / Neon)"]
        SeatClaims["seat_claims (Unique event_seat_id)"]
        HoldTable["seat_holds (TTL Timestamps)"]
        AdvisoryLock["pg_try_advisory_xact_lock()"]
        AuditLogs["audit_logs (Immutable Action Trail)"]
    end

    UserA -->|POST /v1/holds| RateLimiter
    UserB -->|POST /v1/holds| RateLimiter
    RateLimiter --> AuthMiddleware --> IdempotencyLayer --> HoldEngine
    HoldEngine -->|Atomic Tx with FOR UPDATE| SeatClaims
    HoldEngine -->|Hold Expiry Check| HoldTable
    ExpiryWorker -->|pg_try_advisory_xact_lock| AdvisoryLock
    HoldEngine -->|Broadcast Inventory Commit| SSEBroadcaster
    UserA -.->|POST /v1/events/:id/drafts| DraftManager
    DraftManager -.->|drafts-changed SSE| SSEBroadcaster
    SSEBroadcaster -.->|Sub-50ms Live Feed| UserA
    SSEBroadcaster -.->|Sub-50ms Live Feed| UserB
```

---

## ⚡ Concurrency & Double-Booking Protection

### 1. Deterministic Row-Level Locking (`FOR UPDATE`)
When a user requests $K$ seats, LeaseLock sorts requested seat IDs lexicographically before acquiring locks:
```sql
SELECT id, status FROM event_seats 
WHERE id = ANY($1) 
ORDER BY id ASC 
FOR UPDATE;
```
*Why?* Ordering eliminates cyclic wait dependencies, mathematically preventing deadlock conditions between simultaneous multi-seat claims.

### 2. Multi-Layer Database Invariants
Even if application logic fails or multiple API instances race concurrently:
```sql
CREATE UNIQUE INDEX idx_unique_active_seat_claim 
ON seat_claims(event_seat_id);
```
Under PostgreSQL Read Committed / Serializable isolation, the first transaction commits the row. All competing transactions immediately fail with a Postgres `23505 unique_violation` and are converted by the API into a clean, deterministic `409 Conflict: SEATS_UNAVAILABLE` response.

### 3. PostgreSQL Advisory Locking on Expiry Daemon
Background cleanup workers running concurrently across instances acquire a non-blocking transaction-level advisory lock:
```sql
SELECT pg_try_advisory_xact_lock(987654);
```
If another instance is actively processing expired holds, the worker skips execution gracefully without lock contention or table thrashing.

### 4. Sequence Diagram: Simultaneous Same-Seat Race
```mermaid
sequenceDiagram
    autonumber
    participant Alice as Customer A (0.00ms)
    participant Bob as Customer B (+0.02ms)
    participant API as LeaseLock Engine
    participant DB as PostgreSQL (ACID)
    participant SSE as SSE Broadcaster

    par Concurrent Seat Claim
        Alice->>API: POST /v1/holds [Seat A1]
        Bob->>API: POST /v1/holds [Seat A1]
    end

    Note over API,DB: Transaction Begins
    API->>DB: BEGIN TRANSACTION (Alice)
    API->>DB: SELECT FOR UPDATE (Alice locks A1)
    DB-->>API: Row Locked (Alice)

    API->>DB: BEGIN TRANSACTION (Bob)
    API->>DB: SELECT FOR UPDATE (Bob waits on A1 lock...)

    API->>DB: INSERT INTO seat_claims (Alice, A1)
    API->>DB: COMMIT (Alice)
    DB-->>API: Commit Success: A1 Held

    Note over DB,API: Lock Released to Bob
    DB-->>API: Bob resumes SELECT FOR UPDATE
    API->>DB: Check seat_claims for A1
    DB-->>API: A1 already claimed!
    API->>DB: ROLLBACK (Bob)

    API-->>Alice: 201 Created (Hold ID: hld_123, TTL: 300s)
    API-->>Bob: 409 Conflict (SEATS_UNAVAILABLE)

    API->>SSE: Broadcast `seat-updated` (A1: HELD)
    SSE-->>Alice: Update UI State
    SSE-->>Bob: Update UI State (A1 turns Orange/Locked)
```

---

## 🔮 Real-Time Live Ghost Selection Presence

To minimize seat selection contention *before* checkout intent is submitted, LeaseLock implements an ultra-low latency **Ghost Presence Engine**:

1. **Sub-50ms Ephemeral Broadcasts:** When a user selects a seat on their interactive map, an ephemeral `POST /v1/events/:id/drafts` is fired.
2. **Decoupled Memory Registry:** Draft selections live in high-speed volatile server memory with auto-clearing TTLs (bypassing heavy database disk I/O).
3. **Pulsing UI Indicators:** Other connected users immediately see a purple pulsating **"Selecting"** badge on those seats.
4. **Instant Self-Clearing:** If the user unselects, disconnects, navigates away, or creates an authoritative hold, the draft state is immediately purged and synced.

---

## 🔄 Universal Hold Recovery & Checkout State Machine

```mermaid
stateDiagram-v2
    [*] --> AVAILABLE : Initial State
    AVAILABLE --> DRAFTING : User clicks seat (SSE Ghost Broadcast)
    DRAFTING --> ACTIVE_HOLD : POST /v1/holds (Atomic 5-min TTL)
    DRAFTING --> AVAILABLE : User deselects or navigates away
    
    ACTIVE_HOLD --> PENDING_PAYMENT : User enters Checkout Modal
    ACTIVE_HOLD --> AVAILABLE : User clicks "Cancel Hold" OR 5-min TTL Expires
    
    PENDING_PAYMENT --> CONFIRMED : Mock Payment Succeeded (200 OK)
    PENDING_PAYMENT --> PAYMENT_FAILED : Mock Payment Failed (Card Error / Decline)
    
    PAYMENT_FAILED --> PENDING_PAYMENT : 1-Click "Resume Checkout" (Timer still active)
    PAYMENT_FAILED --> AVAILABLE : Hold Expires OR User cancels
    
    CONFIRMED --> CANCELLED : Customer cancels (≥ 2 hours before event)
    CANCELLED --> AVAILABLE : Seat released to inventory / Waitlist auto-promoted
```

### Key Recovery Features:
- **Persistent Floating Resume Banner:** Visible across the entire public app if an active hold exists.
- **Session-Tethered Token Recovery:** `GET /v1/holds/active/current` recovers active cart state on page refresh, browser crash, or tab reopening.
- **One-Click Manual Release:** Dedicated "Release seats" / "Cancel hold" button frees inventory immediately without forcing other users to wait for the 5-minute timeout.

---

## 🛡️ Anti-Hoarding & Fair Allocation Rules

| Policy | Implementation | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Max 6 Seats / User** | `MAX_SEATS_PER_HOLD = 6` | Validated at API boundary & transactional insertion |
| **Single Active Hold** | 1 unconfirmed hold per customer per event | Database partial unique index on `(user_id, event_id)` |
| **Strict 5-Minute TTL** | `expires_at = NOW() + INTERVAL '5 min'` | Backend worker & query timestamp filtering (No client trust) |
| **No TTL Extension** | Modifying seats maintains original hold expiry | Update transactions preserve original `created_at` / `expires_at` |
| **2-Hour Cancellation Cutoff** | `event.start_time - NOW() >= 2 hours` | Strict server-side verification before issuing refunds |
| **Proportional Refunds** | Partial/full cancellation calculates refund snapshot | Immutable financial ledger recording in `payments` |

---

## 📡 API Specification

All endpoints are versioned under `/v1` and return standard RFC-7807 JSON error responses:

```json
{
  "code": "SEATS_UNAVAILABLE",
  "message": "One or more selected seats have already been claimed.",
  "requestId": "req_9f82a0d1"
}
```

### Core Endpoints

#### Authentication & Profile
- `POST /v1/auth/register` — Register customer account (bcrypt hashed, HTTP-only session cookie).
- `POST /v1/auth/login` — Authenticate and receive session.
- `POST /v1/auth/logout` — Revoke session token in database.
- `GET /v1/auth/me` — Inspect current authenticated session & role (`customer` | `admin`).

#### Events & Real-Time Presence
- `GET /v1/events` — List all published events and live availability counts.
- `GET /v1/events/:id` — Event details and pricing tiers.
- `GET /v1/events/:id/seats` — Authoritative seat grid with status (`AVAILABLE`, `HELD`, `BOOKED`).
- `GET /v1/events/:id/seat-events` — **SSE Stream** for real-time inventory and draft updates.
- `POST /v1/events/:id/drafts` — Broadcast ephemeral seat selection state (<50ms).

#### Transactional Holds & Checkout
- `POST /v1/holds` — Atomically claim 1–6 seats with 5-minute lease (`Idempotency-Key` supported).
- `GET /v1/holds/active/current` — Recover user's active unexpired hold.
- `PUT /v1/holds/:id/seats` — Modify seats in active hold without extending TTL.
- `DELETE /v1/holds/:id` — Explicitly cancel hold and release seats immediately.
- `POST /v1/holds/:id/checkout` — Transition hold to `PENDING_PAYMENT`.
- `POST /v1/holds/:id/confirm` — Finalize booking with simulated payment result.

#### Bookings & Waitlist
- `GET /v1/bookings` — View user booking history.
- `GET /v1/bookings/:id` — View booking confirmation details and seat breakdown.
- `POST /v1/bookings/:id/cancel` — Cancel booking (with refund calculation if $\ge 2$ hrs before event).
- `POST /v1/waitlist` — Join FIFO waitlist for sold-out events.

#### Admin & Diagnostics
- `GET /v1/admin/dashboard` — Live system metrics (active holds, total revenue, seat velocity).
- `GET /v1/admin/events` / `POST /v1/admin/events` — Event and inventory management.
- `GET /v1/admin/audit-logs` — Immutable administrative and transactional audit trail.
- `POST /v1/admin/concurrency-demo` — Execute controlled multi-threaded race simulation.
- `GET /v1/health` / `GET /v1/health/ready` — Production liveness and database readiness probes.

---

## 💻 Tech Stack

| Domain | Technology | Rationale & Responsibility |
| :--- | :--- | :--- |
| **Frontend** | **React 19, Vite 7, React Router 7** | Component state, optimistic UI, SSE subscription, interactive SVG seatmap |
| **Styling** | **Custom Vanilla CSS Design System** | High-performance tokens, glassmorphism, responsive grid, zero CSS-in-JS overhead |
| **Backend API** | **Node.js, Express 5** | RESTful routing, input validation, SSE orchestration, rate limiting |
| **Database** | **PostgreSQL 17 / Neon Serverless** | Strict ACID transactions, row-level locks (`FOR UPDATE`), unique constraints |
| **Real-Time** | **Server-Sent Events (SSE)** | Unidirectional push for inventory changes and sub-50ms draft presence |
| **Security** | **HTTP-Only Cookies, Helmet, bcrypt** | Mitigate XSS, CSRF, brute-force attacks; strict origin validation |
| **DevOps** | **Docker, Docker Compose, Render** | Containerized multi-stage builds, cloud hosting, health monitoring |
| **Testing** | **Node Test Runner, Vitest, k6** | Unit, integration, automated contention, and high-concurrency load testing |

---

## 🚀 Run Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v20.x or higher)
- [Docker & Docker Compose](https://www.docker.com/) (optional, for containerized PostgreSQL)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Timeregularity/LeaseLock.git
cd LeaseLock
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
PORT=8080
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/leaselock
CLIENT_ORIGIN=http://localhost:3000
SESSION_SECRET=your_super_secret_session_key_min_32_chars_long
```

### 3. Start Database & Run Migrations
Using Docker Compose for local PostgreSQL:
```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

### 4. Start Development Servers
In Terminal 1 (Express API):
```bash
npm run dev:server
```
In Terminal 2 (Vite Frontend):
```bash
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

### Default Demo Accounts
| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@leaselock.local` | `Admin123!` | Full Admin Panel, Audit Logs, Event Creation, Race Demos |
| **Customer** | `customer@leaselock.local` | `Customer123!` | Standard Seat Booking, Hold Recovery, Waitlist |

---

## 🧪 Verification & Stress Testing

LeaseLock includes a comprehensive multi-tier test suite to prove correctness under extreme contention:

```bash
# Run all unit, frontend, and integration tests
npm run test:all

# Run backend integration tests
npm run test:server

# Run frontend Vitest suite
npm run test:frontend

# Run database invariant verification script
npm run check:invariants
```

### High-Concurrency Race Simulation (k6)
Simulate 50+ concurrent users attempting to claim the exact same high-demand seat within a 5ms window:

```bash
# Install Grafana k6, then execute:
$env:BASE_URL = 'http://localhost:8080'
$env:ADMIN_EMAIL = 'admin@leaselock.local'
$env:ADMIN_PASSWORD = 'Admin123!'
$env:CONTENDERS = '50'
$env:SEAT_ID = 'A1'
npm run test:k6:contention
```

**Expected Result:**
```text
✓ Exactly 1 user receives HTTP 201 (Hold Created)
✓ Exactly 49 users receive HTTP 409 (Conflict: SEATS_UNAVAILABLE)
✓ Total Active DB Claims for Seat A1 = 1 (Zero Double-Bookings)
```

---

## ☁️ Deployment Guide

### Deploying to Render & Neon (Cloud)
1. **Database:** Provision a serverless PostgreSQL database on [Neon.tech](https://neon.tech).
2. **Web Service on Render:**
   - Link your GitHub repository.
   - Use the included [`render.yaml`](render.yaml) or Docker environment.
   - Set environment variables:
     - `DATABASE_URL`: Your Neon connection string (ensure `?sslmode=require`).
     - `NODE_ENV`: `production`
     - `PORT`: `10000`
     - `HOST`: `0.0.0.0`
     - `CLIENT_ORIGIN`: Your production frontend URL (or same domain).
     - `SESSION_SECRET`: Strong 64-character random string.
3. Build Command: `npm install && npm run build`
4. Start Command: `node server/db/migrate.js && node server/index.js`

---

## 📂 Project Structure

```text
LeaseLock/
├── src/                          # Frontend Application (React 19 + Vite)
│   ├── components/               # Navbar, SeatMap, CheckoutModal, ResumeBanner, Alerts
│   ├── pages/                    # PublicPages, AdminPages, AuthPages, EventDetail
│   ├── context/                  # AuthContext, ToastContext
│   └── main.jsx                  # Application entry & router configuration
├── public/
│   └── css/                      # Modular Vanilla CSS Design System (tokens, seats, layout)
├── server/                       # Backend Application (Node.js + Express 5)
│   ├── routes/                   # REST Endpoints (auth, events, holds, bookings, admin)
│   ├── holds/                    # Transactional Allocation Engine & Advisory Locks
│   ├── bookings/                 # Booking lifecycle, cancellations & refund logic
│   ├── realtime/                 # SSE Broadcaster & Ephemeral Ghost Draft Registry
│   ├── jobs/                     # Background Daemons (Hold Expiry, Waitlist Promotion)
│   ├── middleware/               # Auth Guards, Idempotency, Rate Limiting, Audit Logger
│   └── db/                       # PostgreSQL Connection Pool, Migrations, Seed Data
├── scripts/                      # Load testing (k6) & Database Invariant Validators
├── docs/                         # Requirements, Architecture, & Operations Documentation
├── Dockerfile                    # Multi-stage optimized production container
├── compose.yaml                  # Local development stack (App + PostgreSQL)
└── render.yaml                   # Infrastructure-as-Code for Render Cloud Deployment
```

---

## 🎓 Academic & Engineering Highlights

LeaseLock was engineered as an industry-grade distributed systems capstone:
- **ACID Integrity under Pressure:** Proves that business correctness cannot rely on frontend state; true invariants belong in database row locks and relational constraints.
- **Micro-Presence Architecture:** Demonstrates how decoupled in-memory SSE streams can prevent user contention before transactions hit the relational database.
- **Idempotent RESTful Design:** Guarantees that dropped packets and network retries never generate duplicate charges or corrupted cart state.

---

<div align="center">

### Built with craftsmanship by [Timeregularity](https://github.com/Timeregularity)

</div>
