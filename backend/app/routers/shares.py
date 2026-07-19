import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser, get_current_user
from app.db import get_db
from app.schemas import ShareCreate, ShareOut
from app.services import sharing as svc

router = APIRouter(prefix="/api/documents/{doc_id}/shares", tags=["shares"])


@router.get("", response_model=list[ShareOut])
async def list_shares(
    doc_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_shares(db, user, doc_id)


@router.post("", response_model=ShareOut, status_code=status.HTTP_201_CREATED)
async def add_share(
    doc_id: uuid.UUID,
    payload: ShareCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await svc.add_share(db, user, doc_id, payload)


@router.delete("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_share(
    doc_id: uuid.UUID,
    share_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await svc.remove_share(db, user, doc_id, share_id)
    return None
