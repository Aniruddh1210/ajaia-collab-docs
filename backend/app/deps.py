import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.models import Profile

settings = get_settings()


@dataclass
class CurrentUser:
    id: uuid.UUID
    email: str
    full_name: str | None
    avatar_url: str | None


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience=settings.jwt_audience,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    claims = _decode_token(token)

    sub = claims.get("sub")
    email = claims.get("email")
    if not sub or not email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing sub/email")
    email = email.lower()

    user_id = uuid.UUID(str(sub))
    meta = claims.get("user_metadata") or {}
    full_name = meta.get("full_name") or meta.get("name")
    avatar_url = meta.get("avatar_url") or meta.get("picture")

    # Upsert the profile so we can resolve users by email when sharing.
    existing = await db.get(Profile, user_id)
    if existing is None:
        # Guard against a stale row that used a different id for this email.
        dup = await db.scalar(select(Profile).where(Profile.email == email))
        if dup is None:
            db.add(
                Profile(
                    id=user_id,
                    email=email,
                    full_name=full_name,
                    avatar_url=avatar_url,
                )
            )
            await db.flush()
    else:
        # Keep profile metadata fresh on each login.
        if existing.email != email:
            existing.email = email
        existing.full_name = full_name or existing.full_name
        existing.avatar_url = avatar_url or existing.avatar_url

    return CurrentUser(
        id=user_id, email=email, full_name=full_name, avatar_url=avatar_url
    )
