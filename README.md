# System Design Interview Platform (SDIP) — Part 3

> **Deploy a Full-Stack App with AI Coding Assistants**
> *Part 3 of the [AI Dev Tools Zoomcamp](https://github.com/DataTalksClub/ai-dev-tools-zoomcamp) by DataTalks.Club*

[![CI/CD Pipeline](https://github.com/SPBONIFACE/ai-dev-tools-zoomcamp-part3/actions/workflows/deploy.yml/badge.svg)](https://github.com/SPBONIFACE/ai-dev-tools-zoomcamp-part3/actions/workflows/deploy.yml)

---

## What This Part Covers

In Part 2 we built a working interview-canvas application locally — a React frontend, a FastAPI backend with WebSockets, and an SQLite database. Everything ran on our laptop.

**Part 3 takes that local prototype and turns it into something deployable, testable, and automatically shipped to the cloud.** The course walks through a clear sequence of steps, each building on the previous one:

```mermaid
flowchart TD
    A["1. Containerize the App\n(Single multi-stage Dockerfile)"] --> B["2. Switch from SQLite to Postgres\n(Production-grade database)"]
    B --> C["3. Docker Compose\n(Run everything locally with one command)"]
    C --> D["4. Integration & E2E Tests\n(Verify it actually works)"]
    D --> E["5. Deploy to the Cloud\n(Google Cloud Run + Neon Postgres)"]
    E --> F["6. CI/CD with GitHub Actions\n(Automate the whole thing)"]
```

The rest of this README is organized around these two setups — **local development** and **production deployment** — and explains how CI/CD bridges the gap between them.

---

## Table of Contents

- [Setup 1: Local Development (Docker Compose)](#setup-1-local-development-docker-compose)
  - [Step 1 — Containerize the Application](#step-1--containerize-the-application)
  - [Step 2 — Switch from SQLite to PostgreSQL](#step-2--switch-from-sqlite-to-postgresql)
  - [Step 3 — Docker Compose (One Command to Run Everything)](#step-3--docker-compose-one-command-to-run-everything)
  - [Step 4 — Integration and End-to-End Tests](#step-4--integration-and-end-to-end-tests)
- [Setup 2: Full Production Deployment](#setup-2-full-production-deployment)
  - [Step 5 — Deploy to the Cloud](#step-5--deploy-to-the-cloud)
  - [Step 6 — CI/CD with GitHub Actions](#step-6--cicd-with-github-actions)
- [CI/CD Learning Guide](#cicd-learning-guide)
  - [1. What is CI/CD? The Big Picture](#1-what-is-cicd-the-big-picture)
  - [2. How Our Pipeline Works in GitHub Actions](#2-how-our-pipeline-works-in-github-actions)
  - [3. Why This Architecture is Production-Grade](#3-why-this-architecture-is-production-grade)
- [Project Structure](#project-structure)

---

# Setup 1: Local Development (Docker Compose)

This is how you run and test the application entirely on your own machine — no cloud account needed, no external services. By the end of this setup you have a fully working full-stack app with a real PostgreSQL database, integration tests, and a Playwright browser test — all running locally.

## Step 1 — Containerize the Application

In development, the frontend and backend run as separate processes. In production, we don't need that — we build the frontend once and the backend serves the static files.

The [`Dockerfile`](./Dockerfile) uses a **two-stage build**:

```
Stage 1 (Node 22-alpine)         Stage 2 (Python 3.13-slim + Node runtime)
┌──────────────────────┐          ┌──────────────────────────────────┐
│  npm install          │          │  Copy compiled frontend from S1  │
│  npm run build        │  ──────► │  uv sync (Python deps)           │
│  → .output/ bundle    │          │  start.sh launches both servers  │
└──────────────────────┘          └──────────────────────────────────┘
```

* **Stage 1** compiles the React/Nuxt frontend into static HTML/JS/CSS with `NITRO_PRESET=node-server`.
* **Stage 2** starts from a slim Python image, installs Node.js for the SSR server, copies the compiled frontend, installs Python backend dependencies via `uv`, and uses [`start.sh`](./start.sh) to launch both the frontend SSR server (port 3000 internally) and FastAPI (port 8000 externally).

The result is a **single container** that serves the entire application.

## Step 2 — Switch from SQLite to PostgreSQL

SQLite is great for local development (zero config, data in a single file), but for production we need PostgreSQL — it handles concurrent connections, is network-accessible, and is what every managed database service runs.

Because we set up **SQLAlchemy** from the start (in Part 2), the switch is straightforward: we added `psycopg2-binary` as a dependency and updated [`database.py`](./backend/src/backend/database.py) to accept a `SDIP_DATABASE_URL` environment variable that works with both SQLite and PostgreSQL connection strings.

## Step 3 — Docker Compose (One Command to Run Everything)

Instead of manually starting a PostgreSQL container and then the app, [`docker-compose.yaml`](./docker-compose.yaml) defines both services together:

| Service | Image | Port | What it does |
|:---|:---|:---|:---|
| `postgres` | `postgres:16-alpine` | `5432` | Runs PostgreSQL with a healthcheck (`pg_isready`) |
| `app` | Built from local `Dockerfile` | `8100 → 8000` | Full-stack app, waits for Postgres to be healthy before starting |

**Run the entire stack with one command:**

```bash
docker compose up --build
```

Then open:
- **Application:** [http://localhost:8100](http://localhost:8100)
- **API Docs (Swagger):** [http://localhost:8100/docs](http://localhost:8100/docs)
- **Health Check:** [http://localhost:8100/api/health](http://localhost:8100/api/health)

**Stop everything:**

```bash
docker compose down
```

## Step 4 — Integration and End-to-End Tests

With Docker Compose running, we can now verify that the container, the database, and the frontend all work together. There are three levels of tests:

### Unit Tests (fast, no Docker needed)
```bash
make test
```
Runs 16 backend tests in ~0.7s using FastAPI's `TestClient` with an in-memory database. Tests auth flows, session CRUD, board operations, and WebSocket message framing.

### Integration Tests (against live Docker Compose stack)
```bash
make test-integration
```
Runs 5 scenarios against `http://localhost:8100`:
1. Container readiness and `/api/health` response.
2. Frontend bundle served correctly at `/`.
3. User registration, JWT authentication, and database persistence.
4. Full session lifecycle: create session → generate join link → candidate joins → push board operations → verify persistence.
5. Bidirectional WebSocket sync between interviewer and candidate.

### Playwright End-to-End Test (two real browsers)
```bash
make e2e
```
Opens two isolated Chromium browser contexts — one as the **interviewer**, one as the **candidate** — and verifies the complete collaboration workflow: login, create session, share link, join, draw on canvas, and confirm real-time sync.

At this point, we are **confident the application works**. Time to deploy it.

---

# Setup 2: Full Production Deployment

This is where the application leaves your laptop and runs on real cloud infrastructure, accessible to anyone on the internet. The course tutorial deploys to AWS (EC2 + CloudFormation), but you can use any cloud provider. We chose **Google Cloud Run** with **Neon Serverless PostgreSQL** for a zero-cost architecture.

## Step 5 — Deploy to the Cloud

```mermaid
flowchart LR
    subgraph Local["Your Laptop (Setup 1)"]
        DC["Docker Compose\nPostgres + App\nlocalhost:8100"]
    end
    subgraph Cloud["Google Cloud (Setup 2)"]
        CR["Cloud Run\n(europe-west9)\nAutoscales 0↔2 instances"]
        NeonDB["Neon.tech\nServerless PostgreSQL\n(SSL + auto-pause)"]
    end
    Local -.->|"Same Dockerfile\nSame code"| CR
    CR <--> NeonDB
```

The key difference between local and production:

| Aspect | Local (Docker Compose) | Production (Cloud Run) |
|:---|:---|:---|
| **Compute** | Your laptop runs the container | Google Cloud Run runs the same container |
| **Database** | PostgreSQL 16 in a local Docker container | Neon.tech serverless PostgreSQL (cloud-hosted, SSL) |
| **Database URL** | `postgresql://sdip:sdip@postgres:5432/sdip` | Injected via GitHub Secrets (`SDIP_DATABASE_URL`) |
| **Port** | `localhost:8100` | Public `https://*.a.run.app` URL with HTTPS |
| **Scaling** | Always running while Docker is up | Scales to 0 when idle (zero cost), auto-scales up on traffic |
| **How you deploy** | `docker compose up --build` | Automated via CI/CD on every `git push` |

### Cloud Infrastructure (Zero Cost)

| Component | Provider | Cost |
|:---|:---|:---|
| Compute & Serving | Google Cloud Run (`--min-instances 0 --max-instances 2`) | Free Tier |
| Database | Neon.tech Serverless PostgreSQL (auto-pause after 5 min idle) | Free Tier |
| Container Registry | Google Artifact Registry | Free Tier |
| CI/CD | GitHub Actions (2,000 min/month) | Free Tier |

## Step 6 — CI/CD with GitHub Actions

This is the final piece: every time we push to `main`, the application is automatically tested and deployed. No manual SSH, no clicking buttons in a cloud console.

The pipeline is defined in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) and runs four jobs:

```mermaid
flowchart TD
    Push["git push origin main"] --> Job1["Job 1: Backend Tests\n(pytest, 16 unit tests)"]
    Push --> Job2["Job 2: Frontend Build\n(Node 22, npm run build)"]

    Job1 -->|Pass| Job3["Job 3: Docker Compose\nIntegration & Playwright E2E"]
    Job2 -->|Pass| Job3

    Job3 -->|Pass| Job4["Job 4: Deploy to Cloud Run\n+ Health Check Verification"]

    Job1 -->|Fail| Stop["❌ Pipeline stops\nBroken code never reaches production"]
    Job2 -->|Fail| Stop
    Job3 -->|Fail| Stop
```

| Job | What it does | Why |
|:---|:---|:---|
| **1. Backend Tests** | Installs Python 3.13 + `uv`, runs `pytest` | Catches broken routes, auth bugs, model issues in seconds |
| **2. Frontend Build** | Installs Node 22, runs `npm run build` | Catches TypeScript errors, missing dependencies, broken bundler config |
| **3. Compose Integration & E2E** | Builds Docker Compose stack on the runner, runs all integration + Playwright tests | Proves the real container works with real Postgres and real browsers |
| **4. Deploy to Cloud Run** | Authenticates to GCP, deploys container, verifies live health check | Ships to production only if everything above passed |

Jobs 1 and 2 run **in parallel** (fast feedback). Job 3 only runs if both pass. Job 4 only runs if Job 3 passes **and** we're on the `main` branch.

---

# CI/CD Learning Guide

Steps 1 through 6 above show *what* we built and *how* to use it. But if you're new to CI/CD — or you've heard the term but it still feels abstract — this section explains the *why* behind it all.

In practice, the CI/CD pipeline (Step 6) is the glue between the two setups. It takes the same tests we run locally in Setup 1 (unit tests, Docker Compose integration tests, Playwright E2E) and re-runs them automatically on GitHub's servers every time we push code. Only if every test passes does it proceed to Setup 2's deployment step. This means we can never accidentally ship broken code to production — the pipeline acts as a gatekeeper between our laptop and the cloud.

The sections below unpack these ideas in more detail.

## 1. What is CI/CD? The Big Picture

In traditional software development without CI/CD:
1. Developers write code locally (*"It works on my machine!"*).
2. Code gets merged manually.
3. Things break unexpectedly in production because dependencies, environment variables, or databases differ.
4. Someone manually SSHs into a server late at night to pull files and restart processes, risking downtime and configuration drift.

**CI/CD automates this entire lifecycle so humans never have to perform manual deployments.**

```mermaid
flowchart LR
    Dev["Developer\ngit push"] --> CI["Continuous Integration (CI)\n• Unit tests\n• Linting & build\n• Integration & E2E tests"]
    CI -->|All Green| CD["Continuous Deployment (CD)\n• Build container\n• Push to registry\n• Deploy to Cloud Run\n• Verify health check"]
    CI -->|Any Failure| Alert["❌ Stop Pipeline\nAlert developer\nNever deploy broken code"]
```

### Part A: CI = Continuous Integration
* **The Goal:** Continuously integrate code changes into the shared repository without breaking existing functionality.
* **How it works:** Every time code is pushed or a Pull Request is opened, automated virtual runners spin up in the cloud, pull the code, install dependencies, and execute test suites.
* **Why it matters:** If someone introduces a typo, breaks an API contract, or introduces a regression, CI catches it in seconds **before** the code ever reaches production.

### Part B: CD = Continuous Delivery / Deployment
* **Continuous Delivery:** Code is automatically tested and packaged into a production-ready artifact (e.g., a Docker container), ready to deploy at the push of a button.
* **Continuous Deployment (what this project uses):** Every commit that merges into `main` and passes all CI tests is **automatically deployed to live cloud infrastructure without manual approval or intervention**.

---

## 2. How Our Pipeline Works in GitHub Actions

The pipeline is defined in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It follows modern software engineering best practices: **Fail-Fast Parallel Execution** followed by **Progressive Gating**.

### Deep Dive into the 4 Pipeline Jobs:

#### ⚡ Job 1: Backend Tests (Parallel)
* **Runner:** A clean `ubuntu-latest` virtual machine provisioned by GitHub.
* **What it does:** Sets up Python 3.13, syncs dependencies via `uv`, and executes `pytest` across all 16 backend unit tests.
* **Why it runs first in parallel:** Unit tests are blazingly fast (taking **~0.7 seconds**). If a backend route or auth logic is broken, the pipeline fails immediately without wasting minutes spinning up Docker containers.

#### ⚡ Job 2: Frontend Tests (Parallel)
* **Runner:** A separate `ubuntu-latest` VM, running at the same time as Job 1.
* **What it does:** Sets up Node.js 22, installs dependencies, and runs `NITRO_PRESET=node-server npm run build`.
* **Why it runs first in parallel:** Catches TypeScript errors, missing packages, or broken bundler configurations simultaneously alongside Job 1.

#### 🐳 Job 3: Compose Integration & Playwright E2E Tests (The Gatekeeper)
* **Dependency:** `needs: [backend-tests, frontend-tests]` — will **only execute if Jobs 1 & 2 passed**.
* **What it does:**
  1. Spins up the multi-container stack: `docker compose up --build -d` (PostgreSQL 16 + Unified Full-Stack Container).
  2. Runs a resilient wait loop until `http://localhost:8100/api/health` reports healthy.
  3. Installs headless **Chromium** via Playwright.
  4. Executes the **5 Integration Test Scenarios** against the running container.
  5. Executes the **Playwright E2E Test**: Opens two isolated browser sessions simulating an **Interviewer** and a **Candidate** collaborating on the canvas in real time.
* **Why it matters:** Unit tests verify code in isolation with mocks. This job proves that **the exact production Docker container works against real PostgreSQL and real web browsers**.

#### 🚀 Job 4: Deploy to Google Cloud Run (Continuous Deployment)
* **Dependency:** `needs: [integration-and-e2e]` and `if: github.ref == 'refs/heads/main'`.
* **What it does:**
  1. Authenticates securely to Google Cloud using the `GCP_SA_KEY` GitHub Secret (a service account key that was created in the GCP Console and stored as an encrypted GitHub repository secret).
  2. Runs `gcloud run deploy --source .` which builds the container image using Cloud Build and deploys it to **Google Cloud Run** in `europe-west9`.
  3. Injects the production database URL from GitHub Secrets (`SDIP_DATABASE_URL` pointing to Neon PostgreSQL with SSL).
  4. Configures autoscaling to zero (`--min-instances 0`) and allocates 512Mi memory.
  5. **Post-Deployment Health Check:** Fetches the live service URL via `gcloud run services describe`, then issues retried HTTP requests to `$SERVICE_URL/api/health` to confirm the deployment is alive before marking the workflow green.

---

## 3. Why This Architecture is Production-Grade

1. **Zero Secret Leaks:**
   * No database passwords, API tokens, or GCP service account keys exist in the repository.
   * All production credentials are injected strictly at runtime via encrypted **GitHub Actions Secrets** (`GCP_SA_KEY`, `SDIP_DATABASE_URL`).

2. **Zero-Cost Serverless Autoscaling:**
   * **Google Cloud Run:** Configured with `--min-instances 0`. When no users are active, instances scale to zero (0 € computing cost). When requests arrive, instances scale up automatically in seconds.
   * **Neon PostgreSQL:** Serverless PostgreSQL that pauses compute automatically after 5 minutes of inactivity, remaining within the free tier.

3. **Zero-Downtime Rolling Deployments:**
   * Google Cloud Run uses revision-based deployments. If a newly deployed revision fails its startup probe or health check, traffic is never switched to it, protecting end users from outages.

4. **Environment Parity:**
   * Both local development (`docker compose`) and production deployment (`Cloud Run`) use the exact same multi-stage `Dockerfile` and identical PostgreSQL drivers (`psycopg2-binary`). What you test locally is what runs in the cloud.

---

## Project Structure

```
.
├── .github/workflows/
│   └── deploy.yml                   # 4-stage CI/CD pipeline
├── backend/
│   ├── src/backend/
│   │   ├── main.py                  # FastAPI entrypoint, routes, WebSocket hub
│   │   ├── database.py              # SQLAlchemy engine (works with SQLite, local PG, and Neon)
│   │   └── models.py               # ORM models (User, Session, BoardState)
│   ├── tests/                       # 16 backend unit tests
│   └── pyproject.toml               # Python project config (uv)
├── e2e/
│   ├── test_compose_integration.py  # 5 integration tests against Docker Compose
│   └── test_two_session_e2e.py      # Playwright dual-browser E2E test
├── frontend/
│   ├── src/                         # React canvas frontend
│   └── package.json                 # Node 22 build scripts
├── Dockerfile                       # Multi-stage build (Node 22 → Python 3.13-slim)
├── docker-compose.yaml              # Local stack: PostgreSQL 16 + App
├── Makefile                         # Developer shortcuts (make test, make e2e, etc.)
├── start.sh                         # Container entrypoint (launches frontend SSR + FastAPI)
└── README.md                        # This file
```
