import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser, get_current_user
from app.db import get_db
from app.schemas import (
    DocumentCreate,
    DocumentDetail,
    DocumentSummary,
    DocumentUpdate,
)
from app.services import documents as svc

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("", response_model=list[DocumentSummary])
async def list_documents(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_documents(db, user)


@router.post("", response_model=DocumentSummary, status_code=status.HTTP_201_CREATED)
async def create_document(
    payload: DocumentCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_document(db, user, payload)


@router.get("/{doc_id}", response_model=DocumentDetail)
async def get_document(
    doc_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc, access = await svc.get_document_with_access(db, user, doc_id)
    return svc.detail(doc, access)


@router.patch("/{doc_id}", response_model=DocumentDetail)
async def update_document(
    doc_id: uuid.UUID,
    payload: DocumentUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc, access = await svc.get_document_with_access(
        db, user, doc_id, require_edit=True
    )
    await svc.update_document(db, doc, payload)
    await db.flush()
    await db.refresh(doc)
    return svc.detail(doc, access)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc, access = await svc.get_document_with_access(db, user, doc_id)
    if access != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can delete")
    await svc.delete_document(db, doc_id)
    return None
