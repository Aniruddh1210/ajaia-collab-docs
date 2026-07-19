import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Role = Literal["viewer", "editor"]
Access = Literal["owner", "editor", "viewer"]

EMPTY_DOC = {"type": "doc", "content": []}


class DocumentCreate(BaseModel):
    title: str = Field(default="Untitled document", max_length=200)
    content: dict[str, Any] = Field(default_factory=lambda: dict(EMPTY_DOC))

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        return v.strip() or "Untitled document"


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: dict[str, Any] | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip() or "Untitled document"


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    updated_at: datetime
    owner_email: str
    access: Access


class DocumentDetail(DocumentSummary):
    content: dict[str, Any]
    created_at: datetime


class ShareCreate(BaseModel):
    email: EmailStr
    role: Role = "editor"


class ShareOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None = None
    role: Role
    created_at: datetime
