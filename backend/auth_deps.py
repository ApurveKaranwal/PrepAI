"""
=============================================================================
AUTHENTICATION & AUTHORIZATION DEPENDENCIES
=============================================================================
FastAPI dependencies that resolve the caller from an opaque bearer token and,
for recruiter routes, from their organization membership.

Design rule enforced here: the client never tells the server who it is or which
tenant it belongs to. Identity comes from the token; tenancy comes from the
`org_members` row that token resolves to. Any handler that scopes data MUST take
`org: OrgContext = Depends(require_org_member())` and use `org.org_id` — never a
value taken from the request body or query string.
=============================================================================
"""

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException

from database import get_auth_session_user, get_user_org, role_at_least


@dataclass
class AuthUser:
    uid: str
    email: str
    name: str


@dataclass
class OrgContext:
    org_id: int
    org_name: str
    org_slug: str
    role: str
    user: AuthUser

    @property
    def uid(self) -> str:
        return self.user.uid


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def require_user(authorization: Optional[str] = Header(None)) -> AuthUser:
    """Resolves the caller from `Authorization: Bearer <token>`, or 401s."""
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    record = get_auth_session_user(token)
    if not record:
        raise HTTPException(
            status_code=401,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthUser(uid=record["uid"], email=record.get("email") or "", name=record.get("name") or "")


def optional_user(authorization: Optional[str] = Header(None)) -> Optional[AuthUser]:
    """Same as require_user but returns None instead of raising."""
    token = _extract_bearer(authorization)
    if not token:
        return None
    record = get_auth_session_user(token)
    if not record:
        return None
    return AuthUser(uid=record["uid"], email=record.get("email") or "", name=record.get("name") or "")


def require_org_member(minimum_role: str = "member"):
    """
    Dependency factory. Resolves the caller's organization and asserts their
    seat is at least `minimum_role` ("member" < "admin" < "owner").
    """

    def _dependency(user: AuthUser = Depends(require_user)) -> OrgContext:
        org = get_user_org(user.uid)
        if not org:
            raise HTTPException(
                status_code=403,
                detail="You are not part of a hiring organization yet. Create one to continue.",
            )
        if not role_at_least(org.get("role"), minimum_role):
            raise HTTPException(
                status_code=403,
                detail=f"This action requires the {minimum_role} role or higher.",
            )
        return OrgContext(
            org_id=org["id"],
            org_name=org["name"],
            org_slug=org["slug"],
            role=org["role"],
            user=user,
        )

    return _dependency
