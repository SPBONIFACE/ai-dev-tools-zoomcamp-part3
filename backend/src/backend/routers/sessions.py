from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from backend.auth import get_current_user
from backend.models import (
    CreateSessionRequest,
    Session,
    SuccessResponse,
    UpdateSessionRequest,
    UserProfile,
)
from backend.store import store

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])

@router.get("", response_model=List[Session])
def list_sessions(user: UserProfile = Depends(get_current_user)):
    return store.list_sessions_for_user(user.id)

@router.post("", response_model=Session, status_code=status.HTTP_201_CREATED)
def create_session(data: CreateSessionRequest, user: UserProfile = Depends(get_current_user)):
    return store.create_session(
        owner_id=user.id,
        title=data.title,
        candidate_name=data.candidate_name,
        role_title=data.role_title,
    )

@router.get("/{id}", response_model=Session)
def get_session(id: str, user: UserProfile = Depends(get_current_user)):
    session = store.get_session_by_id(id)
    if not session or session.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session

@router.patch("/{id}", response_model=Session)
def update_session(id: str, patch: UpdateSessionRequest, user: UserProfile = Depends(get_current_user)):
    existing = store.get_session_by_id(id)
    if not existing or existing.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    patch_dict = patch.model_dump(exclude_unset=True)
    updated = store.update_session(id, patch_dict)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return updated

@router.delete("/{id}", response_model=SuccessResponse)
def delete_session(id: str, user: UserProfile = Depends(get_current_user)):
    existing = store.get_session_by_id(id)
    if not existing or existing.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    deleted = store.delete_session(id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return SuccessResponse(ok=True)
