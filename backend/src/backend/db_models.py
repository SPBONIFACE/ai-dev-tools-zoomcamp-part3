from datetime import datetime, timezone
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from backend.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class UserDB(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    tokens = relationship("TokenDB", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("SessionDB", back_populates="owner", cascade="all, delete-orphan")

class TokenDB(Base):
    __tablename__ = "auth_tokens"

    token = Column(String(64), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("UserDB", back_populates="tokens")

class SessionDB(Base):
    __tablename__ = "interview_sessions"

    id = Column(String(36), primary_key=True)
    owner_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(120), nullable=False, default="System design interview")
    candidate_name = Column(String(120), default="", nullable=False)
    role_title = Column(String(120), default="", nullable=False)
    status = Column(String(20), default="live", nullable=False)
    join_token = Column(String(64), unique=True, index=True, nullable=False)
    notes = Column(Text, default="", nullable=False)
    link_revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    owner = relationship("UserDB", back_populates="sessions")
    board_elements = relationship("BoardElementDB", back_populates="session", cascade="all, delete-orphan")

class BoardElementDB(Base):
    __tablename__ = "board_elements"

    id = Column(String(64), primary_key=True)
    session_id = Column(String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    data = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    session = relationship("SessionDB", back_populates="board_elements")
