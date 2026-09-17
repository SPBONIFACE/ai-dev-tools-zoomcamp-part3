from fastapi import APIRouter, Depends, HTTPException, status
from backend.auth import get_current_user
from backend.models import (
    BoardJoinResponse,
    BoardOwnershipResponse,
    BoardSessionSummary,
    PushOpsRequest,
    SuccessResponse,
    UserProfile,
)
from backend.store import store

router = APIRouter(prefix="/api/boards", tags=["Board"])

@router.get("/{token}", response_model=BoardJoinResponse)
def join_board(token: str):
    session = store.get_session_by_token(token)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if session.link_revoked:
        return BoardJoinResponse(
            found=True,
            revoked=True,
            session=BoardSessionSummary(
                id=session.id,
                title=session.title,
                role_title=session.role_title,
                candidate_name=session.candidate_name,
                status=session.status,
                link_revoked=True,
            ),
            elements=[],
        )

    elements = store.get_elements_for_session(session.id)

    return BoardJoinResponse(
        found=True,
        revoked=False,
        session=BoardSessionSummary(
            id=session.id,
            title=session.title,
            role_title=session.role_title,
            candidate_name=session.candidate_name,
            status=session.status,
            link_revoked=False,
        ),
        elements=elements,
    )

@router.post("/{token}/ops", response_model=SuccessResponse)
def push_ops(token: str, payload: PushOpsRequest):
    session = store.get_session_by_token(token)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if session.link_revoked or session.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session link is revoked or session is completed",
        )

    store.apply_board_ops(session.id, payload.ops)
    return SuccessResponse(ok=True)

@router.get("/{token}/owned", response_model=BoardOwnershipResponse)
def get_owned_board(token: str, user: UserProfile = Depends(get_current_user)):
    session = store.get_session_by_token(token)
    if not session:
        return BoardOwnershipResponse(owned=False, session=None)

    if session.owner_id == user.id:
        return BoardOwnershipResponse(owned=True, session=session)

    return BoardOwnershipResponse(owned=False, session=None)
