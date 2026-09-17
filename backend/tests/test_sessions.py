from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer demo-token-123"}

def test_list_sessions():
    response = client.get("/api/sessions", headers=AUTH_HEADERS)
    assert response.status_code == 200
    sessions = response.json()
    assert isinstance(sessions, list)
    assert len(sessions) >= 1
    assert any(s["title"] == "Distributed Rate Limiter Design" for s in sessions)

def test_create_session():
    payload = {
        "title": "Payment Processing System",
        "candidate_name": "Bob Martin",
        "role_title": "Senior Backend Engineer",
    }
    response = client.post("/api/sessions", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == payload["title"]
    assert data["candidate_name"] == payload["candidate_name"]
    assert data["status"] == "live"
    assert "join_token" in data
    assert len(data["join_token"]) > 0

def test_update_session():
    # Create session first
    create_resp = client.post(
        "/api/sessions",
        json={"title": "Temporary Session", "candidate_name": "Alice"},
        headers=AUTH_HEADERS,
    )
    session_id = create_resp.json()["id"]

    # Update notes and status to completed
    update_resp = client.patch(
        f"/api/sessions/{session_id}",
        json={"notes": "Excellent architecture breakdown", "status": "completed"},
        headers=AUTH_HEADERS,
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["notes"] == "Excellent architecture breakdown"
    assert data["status"] == "completed"
    assert data["ended_at"] is not None

def test_delete_session():
    create_resp = client.post(
        "/api/sessions",
        json={"title": "To Delete"},
        headers=AUTH_HEADERS,
    )
    session_id = create_resp.json()["id"]

    del_resp = client.delete(f"/api/sessions/{session_id}", headers=AUTH_HEADERS)
    assert del_resp.status_code == 200
    assert del_resp.json()["ok"] is True

    get_resp = client.get(f"/api/sessions/{session_id}", headers=AUTH_HEADERS)
    assert get_resp.status_code == 404
