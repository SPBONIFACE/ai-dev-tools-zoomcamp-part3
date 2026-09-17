from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer demo-token-123"}

def test_join_board_public():
    # Public access without auth using join token
    response = client.get("/api/boards/demo-token")
    assert response.status_code == 200
    data = response.json()
    assert data["found"] is True
    assert data["revoked"] is False
    assert data["session"]["title"] == "Distributed Rate Limiter Design"
    assert len(data["elements"]) >= 4

    element_ids = [el["id"] for el in data["elements"]]
    assert "node-client" in element_ids
    assert "node-gateway" in element_ids

def test_join_board_not_found():
    response = client.get("/api/boards/invalid-unknown-token")
    assert response.status_code == 404

def test_push_ops_and_fetch():
    new_node = {
        "id": "node-lb-test",
        "kind": "node",
        "shape": "loadbalancer",
        "x": 200,
        "y": 200,
        "w": 160,
        "h": 74,
        "label": "HAProxy LB",
        "sub": "Round Robin",
        "color": "node-edge-net",
    }

    # Push upsert op
    push_resp = client.post(
        "/api/boards/demo-token/ops",
        json={"ops": [{"type": "upsert", "el": new_node}]},
    )
    assert push_resp.status_code == 200
    assert push_resp.json()["ok"] is True

    # Verify element is now in the board
    board_resp = client.get("/api/boards/demo-token")
    assert board_resp.status_code == 200
    element_ids = [el["id"] for el in board_resp.json()["elements"]]
    assert "node-lb-test" in element_ids

    # Push delete op
    delete_resp = client.post(
        "/api/boards/demo-token/ops",
        json={"ops": [{"type": "delete", "id": "node-lb-test"}]},
    )
    assert delete_resp.status_code == 200

    # Verify element was removed
    board_resp_after = client.get("/api/boards/demo-token")
    element_ids_after = [el["id"] for el in board_resp_after.json()["elements"]]
    assert "node-lb-test" not in element_ids_after

def test_get_owned_board():
    # As the owner
    resp = client.get("/api/boards/demo-token/owned", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["owned"] is True
    assert data["session"]["notes"] != ""

    # As unauthenticated
    unauth_resp = client.get("/api/boards/demo-token/owned")
    assert unauth_resp.status_code == 401
