import os
import json
import uuid
import asyncio
import pytest
import httpx
import websockets

BASE_URL = os.getenv("COMPOSE_BASE_URL", "http://localhost:8100")
WS_URL = os.getenv("COMPOSE_WS_URL", "ws://localhost:8100")

def test_compose_health_and_service():
    """Scenario 1: Verify container readiness and health status."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        resp = client.get("/api/health")
        assert resp.status_code == 200, f"Health check failed: {resp.text}"
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "interview-platform-backend"

def test_compose_frontend_served():
    """Scenario 2: Verify the frontend bundle is built and served via HTTP 8100."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        resp = client.get("/")
        assert resp.status_code == 200, f"Frontend root returned {resp.status_code}"
        text = resp.text.lower()
        assert "<html" in text or "<!doctype html>" in text
        assert "canvas" in text or "interview" in text or "link" in text

def test_compose_user_signup_and_database_persistence():
    """Scenario 3: Verify user registration and PostgreSQL authentication."""
    unique_id = uuid.uuid4().hex[:8]
    email = f"compose_user_{unique_id}@example.com"
    password = "ComposePassword123!"

    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        # Signup
        signup_resp = client.post("/api/auth/signup", json={"email": email, "password": password})
        assert signup_resp.status_code == 201, f"Signup failed: {signup_resp.text}"
        data = signup_resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == email
        token = data["access_token"]

        # Verify Me endpoint with token
        me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == email

def test_compose_session_lifecycle_and_candidate_access():
    """Scenario 4: Verify session creation, join link generation, candidate access, and PostgreSQL persistence."""
    unique_id = uuid.uuid4().hex[:8]
    email = f"interviewer_{unique_id}@example.com"
    password = "StrongPassword123!"

    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        # 1. Sign up interviewer
        signup = client.post("/api/auth/signup", json={"email": email, "password": password})
        assert signup.status_code == 201
        token = signup.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Create interview session
        session_payload = {
            "title": "Senior Distributed Systems Architect",
            "candidate_name": "Alex Candidate",
            "role_title": "Backend Lead",
        }
        create_resp = client.post("/api/sessions", json=session_payload, headers=headers)
        assert create_resp.status_code == 201, f"Session create failed: {create_resp.text}"
        session = create_resp.json()
        assert session["title"] == session_payload["title"]
        join_token = session["join_token"]
        assert len(join_token) > 0

        # 3. Candidate joins using join_token (unauthenticated)
        candidate_resp = client.get(f"/api/boards/{join_token}")
        assert candidate_resp.status_code == 200, f"Candidate join failed: {candidate_resp.text}"
        cand_data = candidate_resp.json()
        assert cand_data["found"] is True
        assert cand_data["revoked"] is False
        assert cand_data["session"]["candidate_name"] == "Alex Candidate"

        # 4. Push board element via API (persisted in PostgreSQL)
        element_id = f"el-{uuid.uuid4().hex[:6]}"
        new_element = {
            "id": element_id,
            "kind": "node",
            "shape": "database",
            "x": 250,
            "y": 180,
            "w": 140,
            "h": 80,
            "label": "PostgreSQL Primary",
            "sub": "port: 5432",
            "color": "node-data",
        }
        ops_payload = {"ops": [{"type": "upsert", "el": new_element}]}
        ops_resp = client.post(f"/api/boards/{join_token}/ops", json=ops_payload)
        assert ops_resp.status_code == 200, f"Push ops failed: {ops_resp.text}"

        # 5. Verify element persisted in database
        board_verify = client.get(f"/api/boards/{join_token}")
        assert board_verify.status_code == 200
        elements = board_verify.json()["elements"]
        assert any(el["id"] == element_id for el in elements)

@pytest.mark.anyio
async def test_compose_websocket_two_session_sync():
    """Scenario 5: Verify real-time bidirectional WebSocket synchronization between Interviewer and Candidate."""
    unique_id = uuid.uuid4().hex[:8]
    email = f"ws_interviewer_{unique_id}@example.com"
    password = "WsPassword123!"

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        signup = await client.post("/api/auth/signup", json={"email": email, "password": password})
        assert signup.status_code == 201
        token = signup.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        create_resp = await client.post(
            "/api/sessions",
            json={"title": "WebSocket Realtime Sync Test", "candidate_name": "Jane Candidate"},
            headers=headers,
        )
        assert create_resp.status_code == 201
        join_token = create_resp.json()["join_token"]

    interviewer_ws_url = f"{WS_URL}/ws/board/{join_token}?name=Interviewer&role=interviewer"
    candidate_ws_url = f"{WS_URL}/ws/board/{join_token}?name=Candidate&role=candidate"

    # Connect both Interviewer and Candidate over WebSocket to the live container
    async with websockets.connect(interviewer_ws_url) as ws_interviewer, \
               websockets.connect(candidate_ws_url) as ws_candidate:

        # Candidate sends a board operation (adds a component)
        shape_id = f"node-ws-{uuid.uuid4().hex[:6]}"
        ws_op = {
            "type": "board_ops",
            "ops": [
                {
                    "type": "upsert",
                    "el": {
                        "id": shape_id,
                        "kind": "node",
                        "shape": "api",
                        "x": 100,
                        "y": 100,
                        "w": 120,
                        "h": 60,
                        "label": "API Gateway",
                        "color": "node-flow",
                    },
                }
            ],
        }
        await ws_candidate.send(json.dumps(ws_op))

        # Candidate receives ACK
        cand_ack_raw = await asyncio.wait_for(ws_candidate.recv(), timeout=5.0)
        cand_ack = json.loads(cand_ack_raw)
        assert cand_ack["type"] == "ops_ack"

        # Interviewer receives presence (candidate joined) and the broadcasted board_ops update
        received_types = []
        for _ in range(2):
            msg_raw = await asyncio.wait_for(ws_interviewer.recv(), timeout=5.0)
            msg = json.loads(msg_raw)
            received_types.append(msg.get("type"))
            if msg.get("type") == "board_ops":
                assert any(op["el"]["id"] == shape_id for op in msg["ops"])

        assert "presence" in received_types
        assert "board_ops" in received_types
