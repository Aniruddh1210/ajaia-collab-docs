import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser
from app.models import Document, DocumentShare, Profile
from app.schemas import DocumentCreate, DocumentUpdate


async def list_documents(db: AsyncSession, user: CurrentUser) -> list[dict]:
    """Owned + shared documents, newest first, each tagged with the user's access."""
    owned = (
        select(Document)
        .options(selectinload(Document.owner))
        .where(Document.owner_id == user.id)
    )
    shared = (
        select(Document, DocumentShare.role)
        .join(DocumentShare, DocumentShare.document_id == Document.id)
        .options(selectinload(Document.owner))
        .where(DocumentShare.shared_with == user.id)
    )

    items: list[dict] = []
    for doc in (await db.scalars(owned)).all():
        items.append(_summary(doc, "owner"))
    for doc, role in (await db.execute(shared)).all():
        items.append(_summary(doc, role))

    items.sort(key=lambda d: d["updated_at"], reverse=True)
    return items


async def get_document_with_access(
    db: AsyncSession, user: CurrentUser, doc_id: uuid.UUID, *, require_edit: bool = False
) -> tuple[Document, str]:
    """Fetch a document the user may access, returning (doc, access).

    Raises 404 if the document does not exist OR the user has no access
    (we deliberately do not distinguish, to avoid leaking existence).
    Raises 403 if require_edit and the user is only a viewer.
    """
    doc = await db.scalar(
        select(Document)
        .options(selectinload(Document.owner))
        .where(Document.id == doc_id)
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    if doc.owner_id == user.id:
        return doc, "owner"

    share = await db.scalar(
        select(DocumentShare).where(
            DocumentShare.document_id == doc_id,
            DocumentShare.shared_with == user.id,
        )
    )
    if share is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    if require_edit and share.role != "editor":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You only have view access to this document"
        )
    return doc, share.role


async def create_document(
    db: AsyncSession, user: CurrentUser, payload: DocumentCreate
) -> dict:
    doc = Document(
        id=uuid.uuid4(),
        owner_id=user.id,
        title=payload.title,
        content=payload.content,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc, attribute_names=["created_at", "updated_at"])
    doc.owner = await db.get(Profile, user.id)
    return _summary(doc, "owner")


async def update_document(
    db: AsyncSession, doc: Document, payload: DocumentUpdate
) -> None:
    if payload.title is not None:
        doc.title = payload.title
    if payload.content is not None:
        doc.content = payload.content


async def delete_document(db: AsyncSession, doc_id: uuid.UUID) -> None:
    await db.execute(delete(Document).where(Document.id == doc_id))


def _summary(doc: Document, access: str) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "updated_at": doc.updated_at,
        "owner_email": doc.owner.email if doc.owner else "",
        "access": access,
    }


def detail(doc: Document, access: str) -> dict:
    return {
        **_summary(doc, access),
        "content": doc.content,
        "created_at": doc.created_at,
    }
