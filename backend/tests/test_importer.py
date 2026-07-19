"""File-import parsing and validation."""

import pytest
from fastapi import HTTPException

from app.services.importer import parse_upload


def test_txt_becomes_paragraphs():
    result = parse_upload("notes.txt", b"Hello world\nSecond line")
    assert result["title"] == "notes"
    assert "<p>Hello world</p>" in result["html"]
    assert "<p>Second line</p>" in result["html"]


def test_markdown_headings_and_bold():
    md = b"# Title\n\nSome **bold** and *italic* text\n\n- item one\n- item two"
    result = parse_upload("guide.md", md)
    html = result["html"]
    assert "<h1>Title</h1>" in html
    assert "<strong>bold</strong>" in html
    assert "<em>italic</em>" in html
    assert "<li>item one</li>" in html


def test_unsupported_extension_rejected():
    with pytest.raises(HTTPException) as exc:
        parse_upload("malware.exe", b"MZ...")
    assert exc.value.status_code == 415


def test_oversize_rejected():
    big = b"x" * (5 * 1024 * 1024 + 1)
    with pytest.raises(HTTPException) as exc:
        parse_upload("huge.txt", big)
    assert exc.value.status_code == 413


def test_empty_file_rejected():
    with pytest.raises(HTTPException) as exc:
        parse_upload("empty.txt", b"")
    assert exc.value.status_code == 400


def test_html_is_sanitized():
    # A script tag in markdown must be stripped, not preserved.
    result = parse_upload("x.md", b"Hello <script>alert(1)</script> world")
    assert "<script>" not in result["html"]
    assert "alert(1)" not in result["html"] or "<script" not in result["html"]
