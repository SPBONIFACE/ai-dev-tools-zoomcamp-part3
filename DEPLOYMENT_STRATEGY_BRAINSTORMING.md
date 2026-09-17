# Deployment Strategy & Architecture Brainstorming: Zoomcamp Part 3

> **Status:** Brainstorming & Architecture Design (No implementation yet)  
> **Course:** AI Dev Tools Zoomcamp — Part 3 (*Deploy a Full-Stack App with AI Coding Assistants*)  
> **Reference App Inspected:** [`spend-ai-190226`](file:///Users/sandrab/procurement_gen_ai/gemini_ai_apps/Hub_Transfer/spend-ai-190226)

---

## 1. Context & Objectives

In Part 2, we built the **System Design Interview Canvas** application locally:
- **Frontend:** React + Vite (interactive canvas with real-time sync).
- **Backend:** FastAPI with WebSockets for bidirectional canvas updates.
- **Database:** SQLite with SQLAlchemy.

In Part 3, the course goal is to:
1. Package the full-stack app into a **single multi-stage Docker container**.
2. Migrate from SQLite to **PostgreSQL**.
3. Validate functionality using **Docker Compose** and **Playwright E2E tests**.
4. Deploy to the cloud and automate updates via **GitHub Actions CI/CD with OIDC**.

While the course tutorial uses **AWS (EC2 + CloudFormation)**, we are evaluating **zero-cost / low-cost alternatives**, with a specific focus on **Google Cloud Platform (Cloud Run)** and how to replicate the proven patterns already implemented in your [`spend-ai-190226`](file:///Users/sandrab/procurement_gen_ai/gemini_ai_apps/Hub_Transfer/spend-ai-190226) project.

---

## 2. Key Insights from Inspecting `spend-ai-190226`

We reviewed [`spend-ai-190226/Dockerfile`](file:///Users/sandrab/procurement_gen_ai/gemini_ai_apps/Hub_Transfer/spend-ai-190226/Dockerfile) and [`spend-ai-190226/GCP_DEPLOYMENT_IMPLEMENTATION.md`](file:///Users/sandrab/procurement_gen_ai/gemini_ai_apps/Hub_Transfer/spend-ai-190226/GCP_DEPLOYMENT_IMPLEMENTATION.md). The existing architecture has critical alignments with this course:

### A. The Multi-Stage Dockerfile Is Already Proven
The `spend-ai` Dockerfile implements the exact pattern prescribed in Part 3 of the course:
- **Stage 1 (`node:18-alpine`):** Installs npm dependencies and compiles React/Vite into `/app/dist`.
- **Stage 2 (`python:3.11-slim`):** Installs Python backend dependencies (`requirements.txt`), copies the built `/dist` static directory from Stage 1 into the Python container, and runs `uvicorn main:app --host 0.0.0.0 --port 8000`.
- **Takeaway for Interview Canvas:** We can reuse this identical two-stage structure for the interview canvas app, ensuring FastAPI serves both the API/WebSockets and the compiled React assets.

### B. The Stateless Container & Database Dilemma
In `spend-ai-190226/GCP_DEPLOYMENT_IMPLEMENTATION.md`, you clearly documented the challenge of container state:
> *"Cloud Run containers are stateless and ephemeral. The filesystem resets on every cold start. SQLite data would be lost every time the container scales to zero... Cloud SQL db-f1-micro costs ~EUR 7–9/month (the one cost item that breaks free tier)."*

This is the exact reason Part 3 migrates from SQLite to PostgreSQL:
- An external database is required because the container cannot store persistent data on its local filesystem.
- If we use GCP Cloud SQL, it introduces a fixed ~$8–$15/month cost.
- **The Zero-Cost Fix:** Decouple compute (Cloud Run) from the database by using a **free-tier serverless PostgreSQL** provider (such as Neon or Supabase).

---

## 3. Evaluated Deployment Options

### Option A: GCP Cloud Run + Serverless Postgres (Neon / Supabase)
*(Recommended — Replicating the `spend-ai` pattern at **$0 cost**)*

* **Architecture:**
  ```
  User Browser
      │ (HTTPS / WSS)
      ▼
  GCP Cloud Run (interview-canvas container: FastAPI + static React)
      │
      ├── WebSockets (handled natively by Cloud Run)
      └── Database queries via SSL connection string
              │
              ▼
      Neon.tech / Supabase (Serverless PostgreSQL - Free Tier)
  ```
* **Why it fits:**
  - **Scale-to-Zero:** Cloud Run bills $0 when idle. GCP provides 2 million requests and 360,000 vCPU-seconds free per month.
  - **Zero Database Bill:** Neon gives 0.5 GB storage with auto-suspend when idle for $0/month.
  - **No Reverse Proxy Needed:** Cloud Run natively provisions valid SSL/TLS certificates and supports WebSockets out of the box (bypassing the need to configure Caddy/Nginx).
  - **CI/CD Alignment:** GitHub Actions can deploy directly to Cloud Run using **GCP Workload Identity Federation (WIF)**, mirroring the keyless OIDC architecture taught in the course for AWS.

---

### Option B: Local Docker Compose + Cloudflare Tunnel (`cloudflared`)
*(Zero Cloud Account Needed — 100% Free & Open-Source Friendly)*

* **Architecture:**
  ```
  Public User ──► Cloudflare Edge (Free SSL / DDoS protection)
                        │
                        ▼ (Outbound encrypted tunnel)
                  cloudflared daemon (running on your Mac)
                        │
                        ▼
            Docker Compose Stack (Local)
            ├── Frontend + FastAPI Container (Port 8000)
            └── PostgreSQL 16 Alpine Container (Port 5432 + Volume)
  ```
* **Why it fits:**
  - **Strictly $0:** No cloud provider account, no credit card required.
  - **Exact Course Fidelity:** You run the exact `docker-compose.yaml` (App + Postgres container) created during the workshop.
  - **Safe Exposure:** Cloudflare Tunnel gives you a public HTTPS URL (e.g., `https://my-interview-app.trycloudflare.com` or your own domain) without opening any ports on your home router.
  - **Limitation:** Only accessible while your local machine is awake.

---

### Option C: Hugging Face Spaces (Docker Space) + Neon Postgres
*(The AI Community Standard — Zero Cost)*

* **Architecture:**
  - Deploy the multi-stage `Dockerfile` to a **Hugging Face Docker Space**.
  - Provide `SDIP_DATABASE_URL` via Hugging Face Space Secrets pointing to Neon PostgreSQL.
* **Why it fits:**
  - **100% Free Forever:** Includes 2 vCPU and 16 GB RAM at $0.
  - Very popular among seasoned AI engineers for portfolio demos and sharing applications with recruiters/collaborators.
  - Built-in Git push-to-deploy workflow.

---

### Option E: Scaleway Cloud (European Sovereign Cloud)
*(French / European Cloud alternative to AWS & GCP — Paris `fr-par` region)*

Given your requirement for EU data residency (as seen in your `spend-ai` project with Paris `europe-west9`), **Scaleway** (an Iliad subsidiary headquartered in Paris) is the premier European sovereign cloud alternative.

#### 1. Serverless Model: Scaleway Serverless Containers *(Equivalent to GCP Cloud Run)*
* **Architecture:**
  - **Compute:** Scaleway **Serverless Containers** running the multi-stage Docker image.
  - **Registry:** Scaleway Container Registry (`rg.fr-par.scw.cloud`).
  - **Database:** Free-tier Serverless Postgres (Neon / Supabase) or Scaleway Serverless SQL.
* **Cost:** **Virtually €0.00 / month**.
  - Scaleway provides a monthly free tier: **200,000 vCPU-seconds**, **400,000 GB-seconds**, and **100,000 requests free** every month.
  - Scales to 0 when idle.
* **Networking & SSL:** Automatic TLS and custom domain / default hostname (`*.functions.fnc.fr-par.scw.cloud`) out of the box with WebSocket support.

#### 2. Single-VM Model: Scaleway Stardust or PLAY2-NANO *(Direct Mirror of the Course PDF)*
* **Architecture:**
  - 1 tiny European VM (**Stardust** at ~**€1.50/mo** or **PLAY2-NANO** at ~**€3.00/mo**).
  - Runs the exact Docker Compose stack from the course:
    - **Caddy container** (automatic TLS + reverse proxy + WSS).
    - **App container** (FastAPI + React).
    - **PostgreSQL 16 container** with persistent local block storage.
* **Why it fits:** 100% fidelity to the PDF's architecture, fully under European jurisdiction (zero US CLOUD Act exposure).

#### 3. IaC & CI/CD on Scaleway
* **Infrastructure as Code (IaC):** Instead of AWS CloudFormation, Scaleway is managed via the official **Scaleway Terraform Provider** (`scaleway/scaleway`).
* **CI/CD:** GitHub Actions logs in using Scaleway IAM API keys (`SCW_ACCESS_KEY` & `SCW_SECRET_KEY`) to build, test, and deploy.

---

## 4. Feature & Cost Comparison Matrix

| Criteria | Course Default (AWS EC2 + CloudFormation) | Option A: GCP Cloud Run + Neon | Option E: Scaleway Serverless Containers | Scaleway VM (Stardust / PLAY2) | Option B: Local Compose + Cloudflare |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Monthly Cost** | ~$5–$15 / mo | **$0.00** | **€0.00** (within free tier) | **~€1.50–€3.00 / mo** | **$0.00** |
| **Data Residency** | US/EU (AWS) | Paris (`europe-west9`) | Paris (`fr-par-1/2`) | Paris (`fr-par-1/2`) | Local Mac |
| **Sovereignty** | US Hyperscaler | US Hyperscaler | 100% European (France) | 100% European (France) | Private |
| **Compute Type** | Dedicated VM (EC2) | Serverless Container | Serverless Container | Dedicated micro-VM | Local Machine |
| **Database** | Docker Postgres on EC2 | Neon Serverless Postgres | Neon or Serverless Postgres | Docker Postgres on volume | Docker Postgres on volume |
| **WebSocket** | Via Caddy on EC2 | Native | Supported (HTTP/2 & WSS) | Via Caddy | Native |
| **SSL / HTTPS** | Caddy automatic TLS | Automatic via Google | Automatic via Scaleway | Caddy automatic TLS | Cloudflare |
| **IaC** | CloudFormation | Terraform | Terraform (`scaleway/scaleway`)| Terraform | docker-compose.yaml |

---

## 5. Recommended Decision Path

When we proceed to implementation:

1. **Local & Testing Stages (Steps 1–5 in PDF):**
   - We will follow the course workflow completely:
     - Multi-stage Docker build (`Dockerfile` similar to `spend-ai-190226/Dockerfile`).
     - Local PostgreSQL container setup.
     - `docker-compose.yaml` combining App + DB with health checks.
     - Playwright end-to-end tests for the real-time two-session scenario.
   - *This part is 100% cloud-agnostic.*

2. **Cloud Deployment (Step 6 in PDF):**
   - **Recommendation:** Adopt **Option A (GCP Cloud Run + Neon Postgres)**.
     - It directly reuses your proven GCP and Docker setup from `spend-ai-190226`.
     - It avoids the ~€8/mo Cloud SQL charge by using Neon's free tier.
     - It provides a true public `*.a.run.app` URL with WebSocket support.

3. **CI/CD Pipeline (Step 7 in PDF):**
   - Instead of AWS CloudFormation / AWS OIDC, create a GitHub Actions workflow using:
     - Parallel frontend & backend test jobs.
     - Integration test job running against Docker Compose + Playwright.
     - `google-github-actions/auth` using **Workload Identity Federation (WIF)** to deploy to Cloud Run without static secrets.
