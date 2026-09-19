# Homework 3: Containerize and Deploy – Agent Relay

This repository contains the completed work, conceptual explanations, and verified solutions for **Homework 3** of the DataTalksClub AI Dev Tools Zoomcamp.

---

## 1. What is Agent Relay? (The Post Office Analogy)

Think of **Agent Relay** as a **Private Post Office** (or message board) for software bots.

Imagine two bots:
* **Alice (Sender)**: Needs some work done (e.g. text capitalized).
* **Bob (Worker)**: Knows how to do the work (converts text to uppercase).

Alice and Bob **do not talk directly to each other**. Instead, they use the Relay:
1. **Registration**: Alice and Bob sign up at the Post Office. Each receives a secret ID badge (`agt_...` token).
2. **Alice posts a task**: Alice drops a note in Bob's mailbox with input `"hello world"`. The task status is **`queued`**.
3. **Bob claims the task**: Bob's process checks the Post Office and claims the note. The status changes to **`processing`**, and Bob gets a 60-second lease with a `claim_token`.
4. **Bob completes the task**: Bob processes the text (`"HELLO WORLD"`) and submits the result with his claim token. The status changes to **`completed`**.
5. **Alice reads the result**: Alice can check the Post Office anytime to view the output.

### Components:
* **API Server (`main.py`)**: The Post Office counter handling HTTP requests.
* **Database (`agent-relay.db` or PostgreSQL)**: The filing cabinet storing agents, tasks, and delivery attempts.
* **Dashboard (`dashboard.html`)**: A web interface where an agent views their mailbox using their `agt_...` token.

---

## 2. The Deployment Evolution: Why Kubernetes?

| Stage | How it Runs | What it Solves | Limitations |
| :--- | :--- | :--- | :--- |
| **1. Direct Python** (`python main.py`) | Directly on your operating system. | Fast to test locally. | "Works on my machine" issues; depends on host environment. |
| **2. Docker** (`docker run`) | In an isolated, reproducible container. | Packages code, runtime, and dependencies identically anywhere. | Single container. Doesn't automatically restart if it crashes, scale, or coordinate multiple services. |
| **3. Docker Compose** (`compose.yaml`) | Multi-container stack (API + PostgreSQL). | Connects multiple containers with private networking on one machine. | Runs on a single host. No auto-healing across servers, no automated rolling updates. |
| **4. Kubernetes** (K8s) | Distributed cluster orchestrator. | Automated self-healing, horizontal scaling, load balancing, and zero-downtime rollouts across any number of machines. | Steeper learning curve; requires cluster management. |

---

## 3. What is Kubernetes? (The Harbor Master Analogy)

* **Docker** is a single shipping container.
* **Docker Compose** is managing a couple of containers in your personal garage.
* **Kubernetes** is the **automated harbor crane and port authority**:
  - **Self-Healing**: If a container crashes at 3:00 AM, Kubernetes detects the failure and replaces it immediately.
  - **Auto-Scaling**: If traffic surges, Kubernetes spins up additional copies (replicas) of your container, and scales down when traffic subsides.
  - **Zero-Downtime Rollouts**: When deploying a new version, Kubernetes launches the new container, verifies its health check, routes user traffic to it, and only then shuts down the old one.
  - **Service Discovery & Load Balancing**: Provides a permanent internal DNS name and automatically distributes network traffic across all healthy copies.

---

## 4. Key Kubernetes Building Blocks

### 1. Pod
* **What it is**: The smallest deployable unit in Kubernetes. A Pod encapsulates one (or more) running containers with shared networking and storage.
* **Analogy**: A single worker at a workstation.

### 2. Deployment
* **What it is**: A declarative controller that manages Pods. You specify: *"Always keep 2 copies of Agent Relay running"*. If a Pod dies, the Deployment replaces it. When updating images, the Deployment orchestrates rolling updates.
* **Analogy**: The shift supervisor who ensures the required number of workers are always on duty.

### 3. Service
* **What it is**: A stable, permanent network abstraction. Because Pods are frequently created and destroyed with changing dynamic IP addresses, a Service assigns a fixed internal DNS name (e.g. `agent-relay` or `postgres`) and load-balances traffic to the underlying Pods.
* **Analogy**: The central office phone number—even if individual workers swap desks or take breaks, customers always call the same number.

### 4. PersistentVolumeClaim (PVC)
* **What it is**: A request for durable storage that outlives individual Pods. Essential for stateful workloads like PostgreSQL so data is preserved across container restarts.
* **Analogy**: A reserved physical safe deposit box that stays intact even if staff members change.

---

## 5. What is `kind`?

* **`kind`** stands for **K**ubernetes **in** **D**ocker.
* Instead of requiring expensive cloud infrastructure (AWS EKS, Google GKE, Azure AKS), `kind` spins up a complete, conformant Kubernetes cluster inside a local Docker container.
* It allows engineers to develop, test, and debug real Kubernetes manifests and deployments locally on macOS, Linux, or Windows for free.

---

## 6. How Dashboard Tokens & Tasks Work (Key Clarifications)

### The Agent Token (`agt_...`)
* Each registered agent (e.g. `alice`, `bob`) is assigned a permanent, unique secret token starting with `agt_...`.
* This token is **not** an external AI API key (like OpenAI or Gemini). It is an internal bearer token that acts as the agent's private mailbox keycard.
* Because tasks are strictly private between the sender and recipient, the dashboard requires an agent's token to know which mailbox to display.

### When New Tasks Occur: Just Click "Refresh"!
* You **do not need to clear the browser or re-enter the token** when new tasks are sent or completed.
* The browser saves the token in `sessionStorage`. To see updated task states (e.g. from `queued` to `processing` to `completed`), simply click the **Refresh** button (or reload the page).

### Why Did the Token Keep Changing Across Homework 3?
As we progressed through the homework questions, we moved between distinct environments, each with its own isolated database:
1. **Questions 1 & 2**: Local SQLite on host Mac.
2. **Question 3**: Standalone Docker container SQLite.
3. **Question 4**: Docker Compose with a PostgreSQL container.
4. **Question 5**: Local Kubernetes cluster with a PostgreSQL Pod and PVC.

Because each environment initialized a brand-new database, we registered a fresh agent identity in each step, which generated a new token for that environment. Once an agent exists in an active database, their token remains fixed.

---

## 7. Homework Questions & Solutions

### Question 1: Understand the project
**Question**: Which description matches the project's architecture?
- Agents exchange tasks directly with each other.
- **Agents claim tasks from a DB through an HTTP API. (Correct)**
- Agents consume tasks from a message broker.
- The browser stores and executes tasks.

---

### Question 2: Register agents and test the task flow
**Question**: Which task status does the sender see after the recipient submits its result?
- `queued`
- `processing`
- **`completed` (Correct)**
- `delivered`

**Verification**:
- Ran acceptance scenario 1: Alice registered, Bob registered, Alice sent task (`queued`), Bob claimed (`processing`), Bob completed with uppercase output (`completed`).
- Created automated integration test in `test_integration.py` passing via `pytest`.

---

### Question 3: Containerization
**Question**: Which Docker option publishes a container's port to your machine?
- `--expose`
- **`-p` (Correct)** (e.g. `docker run -p 8000:8000`)
- `-v`
- `--name`

**Implementation**:
- Built Dockerfile with `uv` and Python 3.11-slim.
- Bound Uvicorn to `0.0.0.0:8000`.
- Built image as `agent-relay:local`.

---

### Question 4: Docker Compose and PostgreSQL
**Question**: Which hostname should the API use to connect to the `postgres` service in Docker Compose?
- `localhost`
- **`postgres` (Correct)**
- `host.docker.internal`
- `0.0.0.0`

**Implementation**:
- Ported storage and database layer to support PostgreSQL alongside SQLite:
  - Configured PostgreSQL connection string normalization for `psycopg` (v3).
  - Replaced writer-lock with PostgreSQL row-level locking (`with_for_update(skip_locked=True)`).
  - Added startup database initialization retries in FastAPI lifespan.
- Created `compose.yaml` with services `agent-relay` and `postgres` (with healthcheck and volume).
- Verified `test_integration.py` and inspected data in PostgreSQL via `psql`.

---

### Question 5: Deploy to Kubernetes
**Question**: Which Kubernetes resource keeps the requested number of application replicas running and manages updates?
- Service
- ConfigMap
- **Deployment (Correct)**
- Secret

**Implementation**:
- Installed `kind` and verified `kubectl`.
- Created local cluster `kind`.
- Created manifests in `agent-relay/k8s/`:
  - `postgres.yaml`: PersistentVolumeClaim (`postgres-pvc`), Deployment (`postgres`), Service (`postgres`), readiness probe (`pg_isready`).
  - `agent-relay.yaml`: Deployment (`agent-relay`), Service (`agent-relay`), readiness probe (`GET /ready`).
- Loaded `agent-relay:local` into kind.
- Applied manifests and verified all pods `1/1 Running`.
- Port-forwarded `svc/agent-relay` and verified task flow and dashboard.

---

### Question 6: CI/CD
**Question**: What should happen if a test fails in this workflow?
- Deploy the new version and report the failure.
- **Keep the existing version running and stop the deployment. (Correct)**
- Delete the existing deployment.
- Deploy the previous image with the new tag.

**Implementation**:
- Created `.github/workflows/ci.yml` running:
  1. Automated spin-up of PostgreSQL container.
  2. Starter protocol tests (`test_agent_relay.py`) against PostgreSQL.
  3. API integration test (`test_integration.py`) against live relay server and PostgreSQL.
  4. Automatic cleanup of test database container.
  5. Building a new Docker image with unique tag (`agent-relay:v-<timestamp>`).
  6. Loading the image into the `kind` cluster.
  7. Rolling update of `deployment/agent-relay` and waiting for rollout completion (`kubectl rollout status`).
- Configured local execution with `act`:
  - Mounted Docker daemon socket (`/var/run/docker.sock`).
  - Mounted host kubeconfig (`~/.kube/config`).
  - Configured cluster server host translation (`host.docker.internal`) and TLS options for containerized runner.
- Updated dashboard heading in `dashboard.html` to `<h1>Agent Relay v2</h1>`.
- Ran the pipeline via `act`, verified all tests passed, new image was loaded, rollout completed, and the new heading `Agent Relay v2` appeared in the deployed dashboard at `http://127.0.0.1:8000/`.
