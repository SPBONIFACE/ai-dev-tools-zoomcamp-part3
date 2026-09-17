from fastapi.testclient import TestClient
from backend.main import app
from backend.store import store

client = TestClient(app)

def test_login_seed_user():
    response = client.post(
        "/api/auth/login",
        json={"email": "interviewer@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "interviewer@example.com"

def test_login_invalid_credentials():
    response = client.post(
        "/api/auth/login",
        json={"email": "interviewer@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]

import uuid

def test_signup_new_user():
    unique_id = uuid.uuid4().hex[:8]
    email = f"new_interviewer_{unique_id}@example.com"
    response = client.post(
        "/api/auth/signup",
        json={"email": email, "password": "securepassword123"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["user"]["email"] == email
    token = data["access_token"]

    # Verify /api/auth/me works with new token
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email

def test_signup_duplicate_email():
    response = client.post(
        "/api/auth/signup",
        json={"email": "interviewer@example.com", "password": "password123"},
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]

def test_me_unauthorized():
    response = client.get("/api/auth/me")
    assert response.status_code == 401

def test_logout():
    # Login to get fresh token
    login_resp = client.post(
        "/api/auth/login",
        json={"email": "interviewer@example.com", "password": "password123"},
    )
    token = login_resp.json()["access_token"]

    # Logout
    logout_resp = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_resp.status_code == 200
    assert logout_resp.json()["ok"] is True

    # Verify token is now invalid
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 401
