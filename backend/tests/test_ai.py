"""AI writing-assistant endpoint.

The upstream Gemini call is mocked so these run offline and deterministically.
We patch the network boundary (`_call_gemini`) and let the real router,
schema validation, action dispatch, and prompt building run.
"""

import pytest
from fastapi import HTTPException

from app.services import ai as ai_svc


@pytest.fixture
def mock_gemini(monkeypatch):
    """Capture the (system, prompt) sent upstream and return a canned reply."""
    calls: list[tuple[str, str]] = []

    async def fake_call(system: str, prompt: str) -> str:
        calls.append((system, prompt))
        return "IMPROVED TEXT"

    # A key must be present or assist() short-circuits with 503.
    monkeypatch.setattr(ai_svc.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(ai_svc, "_call_gemini", fake_call)
    return calls


@pytest.mark.asyncio
async def test_assist_improves_selection(client, alice, mock_gemini):
    resp = await client.post(
        "/api/ai/assist",
        headers=alice.headers,
        json={"action": "improve", "text": "this are bad writing"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"action": "improve", "result": "IMPROVED TEXT"}
    # The selected text is forwarded into the prompt.
    assert "this are bad writing" in mock_gemini[0][1]


@pytest.mark.asyncio
async def test_custom_action_includes_instruction(client, alice, mock_gemini):
    resp = await client.post(
        "/api/ai/assist",
        headers=alice.headers,
        json={
            "action": "custom",
            "text": "Hello world",
            "instruction": "Translate to French",
        },
    )
    assert resp.status_code == 200
    _system, prompt = mock_gemini[0]
    assert "Translate to French" in prompt
    assert "Hello world" in prompt


@pytest.mark.asyncio
async def test_assist_requires_auth(client, mock_gemini):
    resp = await client.post(
        "/api/ai/assist",
        json={"action": "improve", "text": "hi there"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_blank_text_rejected(client, alice, mock_gemini):
    resp = await client.post(
        "/api/ai/assist",
        headers=alice.headers,
        json={"action": "improve", "text": "   "},
    )
    assert resp.status_code == 422  # schema validation


@pytest.mark.asyncio
async def test_unknown_action_rejected(client, alice, mock_gemini):
    resp = await client.post(
        "/api/ai/assist",
        headers=alice.headers,
        json={"action": "hack", "text": "hello"},
    )
    assert resp.status_code == 422  # not in the AIAction literal


@pytest.mark.asyncio
async def test_missing_key_returns_503(client, alice, monkeypatch):
    monkeypatch.setattr(ai_svc.settings, "gemini_api_key", "")
    resp = await client.post(
        "/api/ai/assist",
        headers=alice.headers,
        json={"action": "improve", "text": "hello"},
    )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_upstream_failure_surfaces_as_502(client, alice, monkeypatch):
    async def boom(system, prompt):
        raise HTTPException(502, "The AI service is unavailable right now.")

    monkeypatch.setattr(ai_svc.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(ai_svc, "_call_gemini", boom)
    resp = await client.post(
        "/api/ai/assist",
        headers=alice.headers,
        json={"action": "summarize", "text": "a long document about cats"},
    )
    assert resp.status_code == 502


def test_extract_text_handles_multipart():
    """A thought-signature part with no text must be skipped, not crash."""
    data = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"thoughtSignature": "abc"},
                        {"text": "Hello "},
                        {"text": "world"},
                    ]
                },
                "finishReason": "STOP",
            }
        ]
    }
    assert ai_svc._extract_text(data) == "Hello world"


def test_extract_text_raises_on_safety_block():
    data = {"candidates": [{"content": {"parts": []}, "finishReason": "SAFETY"}]}
    with pytest.raises(HTTPException) as exc:
        ai_svc._extract_text(data)
    assert exc.value.status_code == 422
