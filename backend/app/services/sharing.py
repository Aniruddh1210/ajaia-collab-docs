import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser
from app.models import Document, DocumentShare, Profile
from app.schemas import ShareCreate


async def _owned_document(
    db: AsyncSession, user: CurrentUser, doc_id: uuid.UUID
) -> Document:
    doc = await db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    if doc.owner_id != user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the owner can manage sharing"
        )
    return doc


async def list_shares(
    db: AsyncSession, user: CurrentUser, doc_id: uuid.UUID
) -> list[dict]:
    await _owned_document(db, user, doc_id)
    rows = (
        await db.execute(
            select(DocumentShare, Profile)
            .join(Profile, Profile.id == DocumentShare.shared_with)
            .where(DocumentShare.document_id == doc_id)
            .order_by(DocumentShare.created_at)
        )
    ).all()
    return [
        {
            "id": share.id,
            "email": profile.email,
            "full_name": profile.full_name,
            "role": share.role,
            "created_at": share.created_at,
        }
        for share, profile in rows
    ]


async def add_share(
    db: AsyncSession, user: CurrentUser, doc_id: uuid.UUID, payload: ShareCreate
) -> dict:
    await _owned_document(db, user, doc_id)

    target = await db.scalar(
        select(Profile).where(Profile.email == payload.email.lower())
    )
    if target is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "No user found with that email"
        )
    if target.id == user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "You already own this document"
        )

    existing = await db.scalar(
        select(DocumentShare).where(
            DocumentShare.document_id == doc_id,
            DocumentShare.shared_with == target.id,
        )
    )
    if existing:
        existing.role = payload.role
        share = existing
    else:
        share = DocumentShare(
            id=uuid.uuid4(),
            document_id=doc_id,
            shared_with=target.id,
            role=payload.role,
        )
        db.add(share)
        await db.flush()

    return {
        "id": share.id,
        "email": target.email,
        "full_name": target.full_name,
        "role": share.role,
        "created_at": share.created_at,
    }


async def remove_share(
    db: AsyncSession, user: CurrentUser, doc_id: uuid.UUID, share_id: uuid.UUID
) -> None:
    await _owned_document(db, user, doc_id)
    result = await db.execute(
        delete(DocumentShare).where(
            DocumentShare.id == share_id,
            DocumentShare.document_id == doc_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
