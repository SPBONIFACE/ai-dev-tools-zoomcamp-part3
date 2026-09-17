from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from backend.auth import get_current_user
from backend.models import (
    AuthCredentials,
    AuthResponse,
    ErrorResponse,
    SuccessResponse,
    UserProfile,
)
from backend.store import store, verify_password

router = APIRouter(prefix="/api/auth", tags=["Auth"])
security = HTTPBearer(auto_error=False)

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(cred: AuthCredentials):
    existing = store.get_user_by_email(cred.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )
    user = store.create_user(cred.email, cred.password)
    token = store.create_token_for_user(user.id)
    return AuthResponse(access_token=token, token_type="bearer", user=user)

@router.post("/login", response_model=AuthResponse)
def login(cred: AuthCredentials):
    user_dict = store.get_user_by_email(cred.email)
    if not user_dict or not verify_password(cred.password, user_dict["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = store.create_token_for_user(user_dict["id"])
    user = UserProfile(
        id=user_dict["id"],
        email=user_dict["email"],
        created_at=user_dict["created_at"],
    )
    return AuthResponse(access_token=token, token_type="bearer", user=user)

@router.get("/me", response_model=UserProfile)
def get_me(user: UserProfile = Depends(get_current_user)):
    return user

@router.post("/logout", response_model=SuccessResponse)
def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials:
        store.revoke_token(credentials.credentials)
    return SuccessResponse(ok=True)
