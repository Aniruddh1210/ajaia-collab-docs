from fastapi import APIRouter, Depends, File, UploadFile

from app.deps import CurrentUser, get_current_user
from app.services.importer import parse_upload

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("")
async def import_file(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Parse an uploaded .txt/.md/.docx into sanitized HTML.

    Returns {title, html}. The client converts the HTML to TipTap JSON with
    the editor's own parser and creates the document via POST /api/documents.
    """
    data = await file.read()
    return parse_upload(file.filename or "", data)
