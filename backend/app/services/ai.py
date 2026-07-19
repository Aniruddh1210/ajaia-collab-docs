"""Gemini-backed writing assistant.

All calls go through the backend so the API key never reaches the browser.
We expose a single `assist()` entry point driven by a small, closed set of
actions (defined in ACTIONS) — the client can't send arbitrary prompts, which
keeps behaviour predictable and cost bounded.
"""

import asyncio
import logging

import httpx
from fastapi import HTTPException, status

from app.config import get_settings

logger = logging.getLogger("ajaia.ai")
settings = get_settings()

API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"

# Bound the text we send upstream so a huge document can't blow up latency or
# cost. ~24k chars is comfortably within the model's context for this use case.
MAX_INPUT_CHARS = 24_000

# Each action maps to a system instruction. Actions in SELECTION_ACTIONS
# transform the user's selected text; DOC_ACTIONS operate on the whole document.
_REWRITE_RULES = (
    "Preserve the original meaning and language. Return ONLY the rewritten "
    "text with no preamble, quotes, or explanation."
)

ACTIONS: dict[str, str] = {
    "improve": (
        "You are an editor. Improve the writing quality of the text: clarity, "
        f"flow, and word choice. {_REWRITE_RULES}"
    ),
    "fix": (
        "You are a proofreader. Fix spelling, grammar, and punctuation. Do not "
        f"otherwise rewrite. {_REWRITE_RULES}"
    ),
    "shorten": (
        "You are an editor. Make the text more concise while keeping the key "
        f"points. {_REWRITE_RULES}"
    ),
    "lengthen": (
        "You are an editor. Expand the text with relevant detail and examples, "
        f"keeping the tone consistent. {_REWRITE_RULES}"
    ),
    "professional": (
        "You are an editor. Rewrite the text in a professional, polished tone. "
        f"{_REWRITE_RULES}"
    ),
    "casual": (
        "You are an editor. Rewrite the text in a friendly, casual tone. "
        f"{_REWRITE_RULES}"
    ),
    "custom": (
        "You are a writing assistant. Apply the user's instruction to the text. "
        f"{_REWRITE_RULES}"
    ),
    "summarize": (
        "You are a summarizer. Write a concise summary of the document as a "
        "short paragraph followed by 3-5 key bullet points. Use plain text; "
        "start bullet lines with '- '. Return only the summary."
    ),
    "continue": (
        "You are a writing assistant. Continue the document naturally from where "
        "it ends, matching its tone and style. Write 1-2 short paragraphs. "
        "Return only the new text to append, with no preamble."
    ),
}

SELECTION_ACTIONS = {
    "improve", "fix", "shorten", "lengthen", "professional", "casual", "custom",
}
DOC_ACTIONS = {"summarize", "continue"}


def _build_prompt(action: str, text: str, instruction: str | None) -> str:
    if action == "custom":
        instr = (instruction or "").strip() or "Improve this text."
        return f"INSTRUCTION:\n{instr}\n\nTEXT:\n{text}"
    if action == "summarize":
        return f"DOCUMENT:\n{text}"
    if action == "continue":
        return f"DOCUMENT SO FAR:\n{text}"
    return f"TEXT:\n{text}"


def _extract_text(data: dict) -> str:
    """Pull the generated text out of a generateContent response.

    A response can contain multiple parts (e.g. a thought-signature part with
    no text); concatenate every part that actually carries text.
    """
    candidates = data.get("candidates") or []
    if not candidates:
        # Blocked prompt or empty result.
        feedback = data.get("promptFeedback", {})
        reason = feedback.get("blockReason")
        if reason:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"The request was blocked by the AI provider ({reason}).",
            )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI returned no result")

    cand = candidates[0]
    parts = (cand.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts).strip()

    if not text:
        finish = cand.get("finishReason")
        if finish == "MAX_TOKENS":
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "The response was cut off. Try a shorter selection.",
            )
        if finish in {"SAFETY", "PROHIBITED_CONTENT", "RECITATION"}:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "The AI declined to generate a response for this content.",
            )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI returned an empty response")
    return text


async def _call_gemini(system: str, prompt: str) -> str:
    """POST to Gemini, retrying once on a transient upstream error."""
    url = f"{API_ROOT}/{settings.gemini_model}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": settings.gemini_max_output_tokens,
            # Keep latency down: minimal reasoning is plenty for editing tasks.
            "thinkingConfig": {"thinkingLevel": "low"},
        },
    }
    headers = {
        "x-goog-api-key": settings.gemini_api_key,
        "Content-Type": "application/json",
    }

    last_exc: Exception | None = None
    async with httpx.AsyncClient(timeout=settings.gemini_timeout_seconds) as client:
        for attempt in range(2):
            try:
                resp = await client.post(url, json=body, headers=headers)
            except httpx.HTTPError as exc:
                last_exc = exc
                logger.warning("Gemini network error (attempt %d): %s", attempt + 1, exc)
                await asyncio.sleep(0.6)
                continue

            if resp.status_code == 200:
                return _extract_text(resp.json())

            # 404 with an empty body and 5xx are transient for these models;
            # retry once. Everything else is surfaced immediately.
            transient = resp.status_code >= 500 or (
                resp.status_code == 404 and not resp.text.strip()
            )
            logger.warning(
                "Gemini HTTP %s (attempt %d): %s",
                resp.status_code, attempt + 1, resp.text[:300],
            )
            if transient and attempt == 0:
                await asyncio.sleep(0.6)
                continue
            if resp.status_code == 429:
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "The AI service is rate limited right now. Please try again shortly.",
                )
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "The AI service is unavailable right now."
            )

    logger.error("Gemini call failed after retries: %s", last_exc)
    raise HTTPException(
        status.HTTP_502_BAD_GATEWAY, "Could not reach the AI service. Please try again."
    )


async def assist(action: str, text: str, instruction: str | None = None) -> str:
    """Run one assistant action over `text` and return the generated string."""
    if not settings.gemini_api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI features are not configured on this server.",
        )
    if action not in ACTIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown action: {action}")

    text = (text or "").strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No text provided.")
    if len(text) > MAX_INPUT_CHARS:
        text = text[:MAX_INPUT_CHARS]

    system = ACTIONS[action]
    prompt = _build_prompt(action, text, instruction)
    return await _call_gemini(system, prompt)
