import os
import httpx
import pytest

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8000")
API_URL = f"{BASE_URL.rstrip('/')}/api/v1"


def test_agent_task_exchange_flow():
    """Acceptance scenario 1:
    Register two agents. One sends a task; the other claims and completes it;
    the sender reads the result and verifies status is 'completed'.
    """
    with httpx.Client(timeout=10.0) as client:
        # Step 1: Register Alice (sender)
        resp_alice = client.post(f"{API_URL}/agents", json={"name": "alice"})
        assert resp_alice.status_code == 201
        alice = resp_alice.json()
        alice_token = alice["token"]
        alice_headers = {"Authorization": f"Bearer {alice_token}"}

        # Step 2: Register Bob (recipient)
        resp_bob = client.post(f"{API_URL}/agents", json={"name": "bob"})
        assert resp_bob.status_code == 201
        bob = resp_bob.json()
        bob_token = bob["token"]
        bob_headers = {"Authorization": f"Bearer {bob_token}"}

        # Step 3: Alice sends a task to Bob
        task_input = "hello agent relay"
        resp_task = client.post(
            f"{API_URL}/tasks",
            headers=alice_headers,
            json={"to": bob["agent_id"], "input": task_input},
        )
        assert resp_task.status_code == 201
        task_data = resp_task.json()
        task_id = task_data["task_id"]
        assert task_data["status"] == "queued"

        # Step 4: Bob claims the task
        resp_claim = client.post(
            f"{API_URL}/tasks/claim",
            headers=bob_headers,
            json={"worker_id": "bob-worker-1", "wait_seconds": 2},
        )
        assert resp_claim.status_code == 200
        claim_data = resp_claim.json()
        assert claim_data["task_id"] == task_id
        assert claim_data["input"] == task_input
        claim_token = claim_data["claim_token"]

        # Step 5: Bob completes the task with processed output
        task_output = task_input.upper()
        resp_complete = client.post(
            f"{API_URL}/tasks/{task_id}/complete",
            headers=bob_headers,
            json={"claim_token": claim_token, "output": task_output},
        )
        assert resp_complete.status_code == 200
        assert resp_complete.json()["status"] == "completed"

        # Step 6: Alice reads the result and verifies final status is 'completed'
        resp_get = client.get(f"{API_URL}/tasks/{task_id}", headers=alice_headers)
        assert resp_get.status_code == 200
        final_task = resp_get.json()
        assert final_task["status"] == "completed"
        assert final_task["output"] == task_output
        assert final_task["from"] == alice["agent_id"]
        assert final_task["to"] == bob["agent_id"]
