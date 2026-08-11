"""
The AI that fills in the agreement by talking to the user.

Mutual NDA only, and the whole feature lives in this one file. A second
document type will want its own field set and its own prompt, and what those
should look like will be clearer with a second example in hand than it is now.

**The model populates values, never wording.** The finished agreement says only
what the template says: `resolveMndaTerm` picks between the two sentences the
template already contains and substitutes a year count. So the model chooses
`mnda_term_kind` and `mnda_term_years`, and there is nowhere in the schema below
for it to put a sentence of its own even if it tried.

The conversation is not stored. The client sends the history and the values it
holds with every turn, which keeps the server free of per-user state.
"""

import logging
import re
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from litellm import completion
from pydantic import BaseModel, Field

from app.deps import SettingsDep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# Per the Cerebras skill in .claude/skills/cerebras. `openrouter/` is LiteLLM's
# provider prefix; the model is `openai/gpt-oss-120b` at OpenRouter itself.
MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

COVER_PAGE = "mutual-nda-cover-page.md"


class ChatFields(BaseModel):
    """
    What the model may set, one flat field per value.

    The two parties are flattened rather than nested because a strict schema
    requires every property of a nested object to be present, which fights the
    one rule that matters here: say nothing about a field the user has not
    mentioned. `None` means "no change", so a turn that learns one thing sends
    one field.

    The names mirror `MndaValues` in `frontend/lib/mnda.ts`, and the two `kind`
    fields reuse its exact strings so the client can assign them straight
    across. `frontend/lib/chat.ts` is the one place that translates.
    """

    purpose: str | None = None
    effective_date: str | None = None
    mnda_term_kind: Literal["fixed", "untilTerminated"] | None = None
    mnda_term_years: str | None = None
    confidentiality_kind: Literal["fixed", "perpetual"] | None = None
    confidentiality_years: str | None = None
    governing_law: str | None = None
    jurisdiction: str | None = None
    modifications: str | None = None
    party1_company: str | None = None
    party1_name: str | None = None
    party1_title: str | None = None
    party1_notice_address: str | None = None
    party2_company: str | None = None
    party2_name: str | None = None
    party2_title: str | None = None
    party2_notice_address: str | None = None


class ChatTurn(BaseModel):
    """The model's reply, and whatever this turn taught it about the fields."""

    reply: str
    fields: ChatFields


class ChatMessage(BaseModel):
    # No system role: the server owns the prompt, so a client cannot rewrite
    # the instruction that keeps the model from drafting its own clauses.
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    values: ChatFields


class ChatResponse(BaseModel):
    reply: str
    fields: ChatFields


@lru_cache
def _cover_page(templates_dir: Path) -> str:
    return (templates_dir / COVER_PAGE).read_text(encoding="utf-8")


@lru_cache
def _instructions(templates_dir: Path) -> str:
    """
    The standing instruction, with the cover page quoted in full.

    The template is pasted rather than parsed and restated. The frontend already
    parses this file, and a second parser here would be a second thing to drift
    from the markdown; quoting it means the model reads the same words the
    document will use.
    """
    return f"""You are helping someone fill in the Cover Page of a Common Paper \
Mutual NDA. Here is that Cover Page in full:

---
{_cover_page(templates_dir)}
---

Ask about one or two related things at a time, in plain conversational \
sentences. Do not send lists of every remaining field, and do not use markdown.

Record what they tell you in these fields:

- Purpose -> `purpose`. The bracketed sentence above is a fair default if they \
have no preference of their own.
- Effective Date -> `effective_date`, strictly `yyyy-mm-dd`. Leave it null if \
they would rather write it in by hand at signing, which is common.
- MNDA Term -> `mnda_term_kind`: "fixed" for the first checkbox option above, \
"untilTerminated" for the second. When fixed, put a whole number of years in \
`mnda_term_years` as digits, e.g. "2".
- Term of Confidentiality -> `confidentiality_kind`: "fixed" or "perpetual", \
and `confidentiality_years` when fixed.
- Governing Law & Jurisdiction -> `governing_law` and `jurisdiction`.
- MNDA Modifications -> `modifications`, or null, which reads as "None."
- The signing parties -> `party1_company`, `party1_name`, `party1_title`, \
`party1_notice_address`, and the same for `party2_`. Get both company names \
early; little else can be settled without them.

Only the companies, purpose, effective date, terms, governing law and \
jurisdiction are needed for a usable agreement. The signatories' names, titles \
and notice addresses are welcome but optional — offer to leave them to be \
completed by hand rather than pressing for them.

You never write, paraphrase or invent contract language. The only wording that \
will appear in the finished agreement is what is already written above, with a \
number filled into the bracket. If someone asks for a term the Cover Page does \
not offer — an arbitration clause, a liability cap, an assignment of IP — say \
plainly that this tool only fills in the Mutual NDA Cover Page and that a \
change like that needs a lawyer, and record nothing about it in `fields`.

Set a field only when the latest message gives you its value or corrects it. \
Leave everything else null; never restate what you already know."""


def _prompt(templates_dir: Path, values: ChatFields) -> str:
    return (
        f"{_instructions(templates_dir)}\n\n"
        "Already filled in, as JSON. A null is a question still to ask; "
        "anything else is settled, so do not ask about it again unless they "
        f"are correcting it:\n{values.model_dump_json(indent=2)}"
    )


def _valid_iso_date(value: str) -> bool:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _sanitize(fields: ChatFields) -> ChatFields:
    """
    Drop anything the document cannot use.

    The model is reliable but not guaranteed, and whatever survives here flows
    into an agreement someone may sign. A bad value becomes `None` — the field
    stays unanswered and the conversation carries on — rather than an error,
    because a malformed date is no reason to lose the rest of the turn.

    This mirrors `sanitizeYears` in `frontend/lib/mnda.ts`: digits only, no
    leading zeros, so "-3", "1.5" and "0" cannot become a term of years.
    """
    data = fields.model_dump()

    for key, value in data.items():
        if isinstance(value, str):
            data[key] = value.strip() or None

    if data["effective_date"] and not _valid_iso_date(data["effective_date"]):
        logger.warning(
            "Discarded an unusable effective date: %r", data["effective_date"]
        )
        data["effective_date"] = None

    for key in ("mnda_term_years", "confidentiality_years"):
        if data[key]:
            digits = re.sub(r"\D", "", data[key]).lstrip("0")
            if digits != data[key]:
                logger.warning("Rewrote %s from %r to %r", key, data[key], digits)
            data[key] = digits or None

    return ChatFields(**data)


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest, settings: SettingsDep) -> ChatResponse:
    if not settings.openrouter_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI assistant is not configured. Set OPENROUTER_API_KEY.",
        )

    if len(request.messages) > settings.chat_max_messages:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="This conversation has grown too long. Start a new one.",
        )

    if any(
        len(message.content) > settings.chat_max_message_chars
        for message in request.messages
    ):
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="That message is too long.",
        )

    messages = [
        {"role": "system", "content": _prompt(settings.templates_dir, request.values)},
        *(message.model_dump() for message in request.messages),
    ]

    try:
        response = completion(
            model=MODEL,
            messages=messages,
            response_format=ChatTurn,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
            max_tokens=settings.chat_max_tokens,
            timeout=settings.chat_timeout_seconds,
            api_key=settings.openrouter_api_key,
        )
        turn = ChatTurn.model_validate_json(response.choices[0].message.content)
    except Exception:
        # Every failure reads the same to the caller because the useful response
        # to all of them is the same: say so, and let them try again. The
        # conversation and the values are the client's, so nothing is lost.
        logger.exception("The chat completion failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI assistant is unavailable just now. Try again.",
        ) from None

    return ChatResponse(reply=turn.reply, fields=_sanitize(turn.fields))
