import hashlib
import os
from datetime import datetime, timezone
from typing import Any, List, Optional
from uuid import uuid4
from fastapi import WebSocket
from sqlalchemy.orm import Session as DbSession

from backend.database import Base, SessionLocal, engine
from backend.db_models import BoardElementDB, SessionDB, TokenDB, UserDB
from backend.models import Session, UserProfile

def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return f"{salt}${pwd_hash}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, pwd_hash = stored_hash.split("$", 1)
        test_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
        return test_hash == pwd_hash
    except Exception:
        return False

def to_pydantic_session(s: SessionDB) -> Session:
    return Session(
        id=s.id,
        owner_id=s.owner_id,
        title=s.title,
        candidate_name=s.candidate_name,
        role_title=s.role_title,
        status=s.status, # type: ignore
        join_token=s.join_token,
        notes=s.notes,
        link_revoked=s.link_revoked,
        created_at=s.created_at,
        updated_at=s.updated_at,
        ended_at=s.ended_at,
    )

class DatabaseStore:
    def __init__(self) -> None:
        # In-memory WebSocket active connections per room token
        self.room_connections: dict[str, set[WebSocket]] = {}
        # Ensure database tables exist
        Base.metadata.create_all(bind=engine)
        self.seed_data()

    def get_db(self) -> DbSession:
        return SessionLocal()

    def seed_data(self) -> None:
        db = self.get_db()
        try:
            # Seed user if doesn't exist
            user_id = "00000000-0000-0000-0000-000000000001"
            user = db.query(UserDB).filter(UserDB.id == user_id).first()
            now = datetime.now(timezone.utc)
            if not user:
                user = UserDB(
                    id=user_id,
                    email="interviewer@example.com",
                    password_hash=hash_password("password123"),
                    created_at=now,
                )
                db.add(user)
                db.commit()

            # Seed demo token if doesn't exist
            demo_token = "demo-token-123"
            token_obj = db.query(TokenDB).filter(TokenDB.token == demo_token).first()
            if not token_obj:
                token_obj = TokenDB(token=demo_token, user_id=user_id, created_at=now)
                db.add(token_obj)
                db.commit()

            # Seed demo interview session
            session_id = "11111111-1111-1111-1111-111111111111"
            join_token = "demo-token"
            session = db.query(SessionDB).filter(SessionDB.id == session_id).first()
            if not session:
                session = SessionDB(
                    id=session_id,
                    owner_id=user_id,
                    title="Distributed Rate Limiter Design",
                    candidate_name="Alexey Grigorev",
                    role_title="Staff Software Engineer",
                    status="live",
                    join_token=join_token,
                    notes="Discuss sliding window log vs token bucket. Great system depth.",
                    link_revoked=False,
                    created_at=now,
                    updated_at=now,
                    ended_at=None,
                )
                db.add(session)
                db.commit()

            # Seed board elements for this session
            existing_elements = db.query(BoardElementDB).filter(BoardElementDB.session_id == session_id).count()
            if existing_elements == 0:
                seed_elements = [
                    {
                        "id": "node-client",
                        "kind": "node",
                        "shape": "client",
                        "x": 100,
                        "y": 240,
                        "w": 150,
                        "h": 74,
                        "label": "Client App",
                        "sub": "web / mobile",
                        "color": "node-service",
                    },
                    {
                        "id": "node-gateway",
                        "kind": "node",
                        "shape": "gateway",
                        "x": 360,
                        "y": 240,
                        "w": 160,
                        "h": 74,
                        "label": "API Gateway",
                        "sub": "Envoy / Kong",
                        "color": "node-edge-net",
                    },
                    {
                        "id": "node-redis",
                        "kind": "node",
                        "shape": "cache",
                        "x": 620,
                        "y": 140,
                        "w": 140,
                        "h": 92,
                        "label": "Redis Cluster",
                        "sub": "Sliding Window",
                        "color": "node-data",
                    },
                    {
                        "id": "node-service",
                        "kind": "node",
                        "shape": "service",
                        "x": 620,
                        "y": 320,
                        "w": 160,
                        "h": 80,
                        "label": "Backend Service",
                        "sub": "FastAPI Core",
                        "color": "node-service",
                    },
                    {
                        "id": "edge-client-gw",
                        "kind": "edge",
                        "from": "node-client",
                        "to": "node-gateway",
                        "style": "solid",
                        "arrow": "end",
                        "label": "HTTPS",
                        "color": "node-edge-net",
                    },
                    {
                        "id": "edge-gw-redis",
                        "kind": "edge",
                        "from": "node-gateway",
                        "to": "node-redis",
                        "style": "dashed",
                        "arrow": "end",
                        "label": "Check Quota",
                        "color": "node-data",
                    },
                    {
                        "id": "edge-gw-svc",
                        "kind": "edge",
                        "from": "node-gateway",
                        "to": "node-service",
                        "style": "solid",
                        "arrow": "end",
                        "label": "Forward req",
                        "color": "node-service",
                    },
                    {
                        "id": "note-reqs",
                        "kind": "node",
                        "shape": "note",
                        "x": 840,
                        "y": 180,
                        "w": 180,
                        "h": 140,
                        "label": "Requirements",
                        "sub": "100k rps, <10ms overhead, multi-region",
                        "color": "node-note",
                    },
                ]
                for el in seed_elements:
                    db.add(BoardElementDB(id=el["id"], session_id=session_id, data=el, updated_at=now))
                db.commit()

        finally:
            db.close()

    # --- User & Auth Operations ---
    def create_user(self, email: str, password: str) -> UserProfile:
        db = self.get_db()
        try:
            user_id = str(uuid4())
            now = datetime.now(timezone.utc)
            user = UserDB(
                id=user_id,
                email=email.lower().strip(),
                password_hash=hash_password(password),
                created_at=now,
            )
            db.add(user)
            db.commit()
            return UserProfile(id=user_id, email=user.email, created_at=now)
        finally:
            db.close()

    def get_user_by_email(self, email: str) -> Optional[dict[str, Any]]:
        db = self.get_db()
        try:
            user = db.query(UserDB).filter(UserDB.email == email.lower().strip()).first()
            if not user:
                return None
            return {
                "id": user.id,
                "email": user.email,
                "password_hash": user.password_hash,
                "created_at": user.created_at,
            }
        finally:
            db.close()

    def get_user_by_id(self, user_id: str) -> Optional[UserProfile]:
        db = self.get_db()
        try:
            user = db.query(UserDB).filter(UserDB.id == user_id).first()
            if not user:
                return None
            return UserProfile(id=user.id, email=user.email, created_at=user.created_at)
        finally:
            db.close()

    def create_token_for_user(self, user_id: str) -> str:
        db = self.get_db()
        try:
            token = os.urandom(24).hex()
            token_obj = TokenDB(token=token, user_id=user_id, created_at=datetime.now(timezone.utc))
            db.add(token_obj)
            db.commit()
            return token
        finally:
            db.close()

    def get_user_id_by_token(self, token: str) -> Optional[str]:
        db = self.get_db()
        try:
            token_obj = db.query(TokenDB).filter(TokenDB.token == token).first()
            return token_obj.user_id if token_obj else None
        finally:
            db.close()

    def revoke_token(self, token: str) -> bool:
        db = self.get_db()
        try:
            token_obj = db.query(TokenDB).filter(TokenDB.token == token).first()
            if token_obj:
                db.delete(token_obj)
                db.commit()
                return True
            return False
        finally:
            db.close()

    # --- Session Operations ---
    def list_sessions_for_user(self, owner_id: str) -> List[Session]:
        db = self.get_db()
        try:
            sessions = (
                db.query(SessionDB)
                .filter(SessionDB.owner_id == owner_id)
                .order_by(SessionDB.created_at.desc())
                .all()
            )
            return [to_pydantic_session(s) for s in sessions]
        finally:
            db.close()

    def get_session_by_id(self, session_id: str) -> Optional[Session]:
        db = self.get_db()
        try:
            s = db.query(SessionDB).filter(SessionDB.id == session_id).first()
            return to_pydantic_session(s) if s else None
        finally:
            db.close()

    def get_session_by_token(self, join_token: str) -> Optional[Session]:
        db = self.get_db()
        try:
            s = db.query(SessionDB).filter(SessionDB.join_token == join_token).first()
            return to_pydantic_session(s) if s else None
        finally:
            db.close()

    def create_session(
        self,
        owner_id: str,
        title: str,
        candidate_name: str = "",
        role_title: str = "",
    ) -> Session:
        db = self.get_db()
        try:
            session_id = str(uuid4())
            join_token = os.urandom(8).hex()[:14]
            now = datetime.now(timezone.utc)
            s = SessionDB(
                id=session_id,
                owner_id=owner_id,
                title=title,
                candidate_name=candidate_name,
                role_title=role_title,
                status="live",
                join_token=join_token,
                notes="",
                link_revoked=False,
                created_at=now,
                updated_at=now,
                ended_at=None,
            )
            db.add(s)
            db.commit()
            return to_pydantic_session(s)
        finally:
            db.close()

    def update_session(self, session_id: str, patch: dict[str, Any]) -> Optional[Session]:
        db = self.get_db()
        try:
            s = db.query(SessionDB).filter(SessionDB.id == session_id).first()
            if not s:
                return None

            now = datetime.now(timezone.utc)
            for k, v in patch.items():
                if v is not None and hasattr(s, k):
                    setattr(s, k, v)

            if patch.get("status") == "completed" and s.status == "completed":
                s.ended_at = now
            elif patch.get("status") in ("draft", "live"):
                s.ended_at = None

            s.updated_at = now
            db.commit()
            db.refresh(s)
            return to_pydantic_session(s)
        finally:
            db.close()

    def delete_session(self, session_id: str) -> bool:
        db = self.get_db()
        try:
            s = db.query(SessionDB).filter(SessionDB.id == session_id).first()
            if not s:
                return False
            db.delete(s)
            db.commit()
            return True
        finally:
            db.close()

    # --- Board Element Operations ---
    def get_elements_for_session(self, session_id: str) -> List[dict[str, Any]]:
        db = self.get_db()
        try:
            rows = db.query(BoardElementDB).filter(BoardElementDB.session_id == session_id).all()
            return [r.data for r in rows]
        finally:
            db.close()

    def apply_board_ops(self, session_id: str, ops: List[Any]) -> bool:
        db = self.get_db()
        try:
            now = datetime.now(timezone.utc)
            for op in ops:
                op_type = op.type if hasattr(op, "type") else op.get("type")
                if op_type == "upsert":
                    el = op.el if hasattr(op, "el") else op.get("el")
                    if el and isinstance(el, dict):
                        el_id = el.get("id")
                        if el_id:
                            existing = (
                                db.query(BoardElementDB)
                                .filter(BoardElementDB.session_id == session_id, BoardElementDB.id == el_id)
                                .first()
                            )
                            if existing:
                                existing.data = el
                                existing.updated_at = now
                            else:
                                db.add(BoardElementDB(id=el_id, session_id=session_id, data=el, updated_at=now))
                elif op_type == "delete":
                    del_id = op.id if hasattr(op, "id") else op.get("id")
                    if del_id:
                        db.query(BoardElementDB).filter(
                            BoardElementDB.session_id == session_id,
                            BoardElementDB.id == del_id,
                        ).delete()
            db.commit()
            return True
        finally:
            db.close()

# Singleton store backed by SQLAlchemy database
store = DatabaseStore()
