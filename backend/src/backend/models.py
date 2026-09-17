from datetime import datetime
from typing import Any, Literal, Optional, Union
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Auth Models
# ---------------------------------------------------------------------------

class AuthCredentials(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="User password")

class UserProfile(BaseModel):
    id: str
    email: str
    created_at: datetime

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile

class SuccessResponse(BaseModel):
    ok: bool = True

class ErrorResponse(BaseModel):
    detail: str

# ---------------------------------------------------------------------------
# Session Models
# ---------------------------------------------------------------------------

SessionStatus = Literal["draft", "live", "completed"]

class Session(BaseModel):
    id: str
    owner_id: str
    title: str = "System design interview"
    candidate_name: str = ""
    role_title: str = ""
    status: SessionStatus = "live"
    join_token: str
    notes: str = ""
    link_revoked: bool = False
    created_at: datetime
    updated_at: datetime
    ended_at: Optional[datetime] = None

class CreateSessionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    candidate_name: str = Field(default="", max_length=120)
    role_title: str = Field(default="", max_length=120)

class UpdateSessionRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=120)
    candidate_name: Optional[str] = Field(default=None, max_length=120)
    role_title: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=20000)
    status: Optional[SessionStatus] = None
    link_revoked: Optional[bool] = None

# ---------------------------------------------------------------------------
# Board & Canvas Models
# ---------------------------------------------------------------------------

ColorKey = Literal[
    "node-service",
    "node-data",
    "node-flow",
    "node-edge-net",
    "node-ai",
    "node-external",
    "node-note",
]

ShapeKey = Literal[
    "client",
    "service",
    "gateway",
    "loadbalancer",
    "database",
    "cache",
    "queue",
    "storage",
    "cdn",
    "llm",
    "external",
    "group",
    "note",
]

class NodeElement(BaseModel):
    id: str
    kind: Literal["node"] = "node"
    shape: ShapeKey
    x: float
    y: float
    w: float
    h: float
    label: str = ""
    sub: str = ""
    color: ColorKey

class EdgeElement(BaseModel):
    id: str
    kind: Literal["edge"] = "edge"
    from_node: str = Field(..., alias="from")
    to_node: str = Field(..., alias="to")
    style: Literal["solid", "dashed"] = "solid"
    arrow: Literal["end", "both", "none"] = "end"
    label: str = ""
    color: ColorKey

    model_config = {"populate_by_name": True}

class DrawElement(BaseModel):
    id: str
    kind: Literal["draw"] = "draw"
    points: list[float]
    color: ColorKey
    width: float = 2.0

class TextElement(BaseModel):
    id: str
    kind: Literal["text"] = "text"
    x: float
    y: float
    text: str
    color: ColorKey
    size: float = 16.0

BoardElement = Union[NodeElement, EdgeElement, DrawElement, TextElement, dict[str, Any]]

class BoardOp(BaseModel):
    type: Literal["upsert", "delete"]
    el: Optional[dict[str, Any]] = None
    id: Optional[str] = None

class PushOpsRequest(BaseModel):
    ops: list[BoardOp]

class BoardSessionSummary(BaseModel):
    id: str
    title: str
    role_title: str
    candidate_name: str
    status: str
    link_revoked: bool

class BoardJoinResponse(BaseModel):
    found: bool
    revoked: bool = False
    session: Optional[BoardSessionSummary] = None
    elements: list[dict[str, Any]] = []

class BoardNotFoundResponse(BaseModel):
    found: bool = False
    revoked: bool = False

class BoardOwnershipResponse(BaseModel):
    owned: bool
    session: Optional[Session] = None
