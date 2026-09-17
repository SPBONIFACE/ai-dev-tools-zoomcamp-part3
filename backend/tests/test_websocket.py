from fastapi.testclient import TestClient
from backend.main import app
from backend.store import store

client = TestClient(app)

def test_websocket_connection():
    token = "demo-token"
    with client.websocket_connect(f"/ws/board/{token}?name=Tester&role=candidate") as ws:
        # Verify connection accepted and ready
        cursor_msg = {"type": "cursor", "x": 100, "y": 200, "user": "Tester"}
        ws.send_json(cursor_msg)

def test_websocket_ops_persistence():
    token = "demo-token"
    with client.websocket_connect(f"/ws/board/{token}?name=Candidate1&role=candidate") as ws:
        new_shape = {
            "id": "node-ws-persisted",
            "kind": "node",
            "shape": "queue",
            "x": 320,
            "y": 320,
            "w": 170,
            "h": 70,
            "label": "Kafka Queue",
            "sub": "topic: events",
            "color": "node-flow",
        }
        ws.send_json({"type": "board_ops", "ops": [{"type": "upsert", "el": new_shape}]})
        ack = ws.receive_json()
        assert ack["type"] == "ops_ack"

        session = store.get_session_by_token(token)
        assert session is not None
        elements = store.get_elements_for_session(session.id)
        assert any(el["id"] == "node-ws-persisted" for el in elements)
