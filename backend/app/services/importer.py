import io
import os

import bleach
import mammoth
import markdown as md
from fastapi import HTTPException, status

from app.config import get_settings

settings = get_settings()

ALLOWED_EXTENSIONS = {".txt", ".md", ".markdown", ".docx"}

# Tags TipTap's StarterKit + Underline can represent. Anything else is stripped.
ALLOWED_TAGS = [
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
    "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "code", "pre", "a",
]
ALLOWED_ATTRS = {"a": ["href", "title"]}


def _ext(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def _title_from_filename(filename: str) -> str:
    base = os.path.splitext(os.path.basename(filename or "Untitled"))[0]
    return base.strip() or "Untitled document"


def parse_upload(filename: str, data: bytes) -> dict:
    """Return {title, html} for a supported upload, or raise an HTTPException.

    - .txt          -> paragraphs from lines
    - .md/.markdown -> rendered via python-markdown
    - .docx         -> converted via mammoth
    HTML is sanitized to the subset the editor understands.
    """
    ext = _ext(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Unsupported file type. Supported: .txt, .md, .docx",
        )
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB limit",
        )
    if len(data) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")

    if ext == ".docx":
        html = _from_docx(data)
    elif ext in {".md", ".markdown"}:
        html = _from_markdown(data)
    else:
        html = _from_text(data)

    clean = bleach.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)
    if not clean.strip():
        clean = "<p></p>"
    return {"title": _title_from_filename(filename), "html": clean}


def _decode(data: bytes) -> str:
    for enc in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _from_text(data: bytes) -> str:
    text = _decode(data)
    paras = []
    for line in text.splitlines():
        line = line.strip()
        paras.append(f"<p>{bleach.clean(line)}</p>" if line else "<p></p>")
    return "".join(paras) or "<p></p>"


def _from_markdown(data: bytes) -> str:
    return md.markdown(_decode(data), extensions=["extra", "sane_lists"])


def _from_docx(data: bytes) -> str:
    try:
        result = mammoth.convert_to_html(io.BytesIO(data))
    except Exception:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Could not read .docx file"
        )
    return result.value
