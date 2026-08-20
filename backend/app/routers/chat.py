"""
The AI that chooses an agreement and fills it in by talking to the user.

Two conversations share one endpoint. Until `document` is set the assistant is
working out which of the catalogued agreements is wanted, and the only thing it
can settle is which one that is. Once it is set, the assistant fills in that
document's fields and nothing else.

**The model populates values, never wording.** The finished agreement says only
what the template says: a choice field resolves to one of the sentences already
in the cover page with a number dropped into its bracket. So the model picks an
option index and supplies a count, and there is nowhere in the generated schema
below for it to put a sentence of its own even if it tried.

The field set is built per document from the cover page markdown, by the same
rules `frontend/lib/field-schema.ts` applies to the same file — see
`app.field_schema` for why that is safe.

The conversation is not stored. The client sends the history and the values it
holds with every turn, which keeps the server free of per-user state.
"""

import json
import logging
import re
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, status
from litellm import completion
from pydantic import BaseModel, Field, create_model

from app.config import Settings
from app.deps import SettingsDep
from app.documents import load_documents
from app.field_schema import PARTY_FIELDS, DocumentSchema, FieldSpec

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# Per the Cerebras skill in .claude/skills/cerebras. `openrouter/` is LiteLLM's
# provider prefix; the model is `openai/gpt-oss-120b` at OpenRouter itself.
MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

# Long enough for any answer worth quoting back, short enough that the values
# cannot become the expensive part of a request.
VALUE_EXCERPT_CHARS = 400


class ChatMessage(BaseModel):
    # No system role: the server owns the prompt, so a client cannot rewrite
    # the instruction that keeps the model from drafting its own clauses.
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """
    A turn of the conversation.

    `document` is null while one is still being chosen, and `values` is then
    empty — there are no fields to hold values for until a document is picked.
    """

    document: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    values: dict[str, str | int | None] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    reply: str
    document: str | None = None
    fields: dict[str, str | int | None] = Field(default_factory=dict)


def _annotation(spec: FieldSpec, key: str) -> tuple[Any, Any]:
    """The type and description of one wire field, for the generated model."""
    described = f"{spec.label}."
    if spec.hint:
        described += f" {spec.hint}."
    if not spec.required:
        described += " Optional."

    if spec.kind == "choice":
        if key.endswith("_option"):
            options = ", ".join(
                f'{index} = "{option.sentence}"'
                for index, option in enumerate(spec.options)
            )
            return (
                Literal[tuple(range(len(spec.options)))] | None,  # type: ignore[misc]
                Field(default=None, description=f"{described} {options}"),
            )
        return (
            str | None,
            Field(
                default=None,
                description=f"The number inside the chosen {spec.label} sentence, "
                "as digits.",
            ),
        )

    if spec.kind == "date":
        return (
            str | None,
            Field(default=None, description=f"{described} Strictly yyyy-mm-dd."),
        )

    if spec.kind == "group":
        line = next(line for line in spec.lines if line.key == key)
        hint = f" {line.placeholder}." if line.placeholder else ""
        return (str | None, Field(default=None, description=f"{line.label}.{hint}"))

    return (str | None, Field(default=None, description=described))


def _fields_model(schema: DocumentSchema) -> type[BaseModel]:
    """
    What the model may set for this document, one flat field per value.

    Built rather than written out because eleven documents have eleven field
    sets. The two parties are flattened rather than nested for the same reason
    they always were: a strict schema requires every property of a nested
    object to be present, which fights the one rule that matters here — say
    nothing about a field the user has not mentioned.
    """
    definitions: dict[str, tuple[Any, Any]] = {}

    for spec in schema.fields:
        for key in spec.wire_keys():
            definitions[key] = _annotation(spec, key)

    for index, role in enumerate(schema.party_roles, start=1):
        for name in PARTY_FIELDS:
            definitions[f"party{index}_{name}"] = (
                str | None,
                Field(default=None, description=f"{role}'s {name.replace('_', ' ')}."),
            )

    return create_model("Fields", **definitions)  # type: ignore[call-overload]


@lru_cache
def _turn_model(slug: str, catalog: Path, templates: Path) -> type[BaseModel]:
    """
    The response schema for one document, built once.

    Cached on the slug and the paths it was read from rather than on the schema
    itself, which holds lists and so cannot be a cache key. Building a Pydantic
    model per request would work, but it would be per request forever.
    """
    schema = load_documents(catalog, templates)[slug].schema
    return create_model(
        "ChatTurn",
        reply=(str, ...),
        fields=(_fields_model(schema), ...),
    )


@lru_cache
def _pick_model(slugs: tuple[str, ...]) -> type[BaseModel]:
    """
    A pick, constrained to the documents that actually exist.

    Typed as a `Literal` of real slugs so the model cannot name an agreement we
    have no cover page for — the redirection the ticket asks for is a property
    of the schema, not of the prompt behaving itself.
    """
    return create_model(
        "PickTurn",
        reply=(str, ...),
        document=(Literal[slugs] | None, Field(default=None)),  # type: ignore[valid-type]
    )


@lru_cache
def _pick_instructions(catalog: Path, templates: Path) -> str:
    catalogue = "\n".join(
        f"- `{document.slug}` — {document.title}: {document.description}"
        for document in load_documents(catalog, templates).values()
    )

    return f"""You are helping someone choose which agreement to draft. These \
are the only ones available:

{catalogue}

Ask what they need in plain conversational sentences, one or two things at a \
time. Do not use markdown.

When you are confident which one fits, set `document` to its slug and say \
which you have chosen and why in a sentence.

If they ask for something not on the list — an employment contract, a lease, a \
will — say plainly that you cannot generate it, name the closest agreement you \
do have and what it is for, and ask whether that would work. Do not set \
`document` until they agree.

Every reply must end with a question while no document is chosen. Never leave \
them with nothing to answer."""


def _field_guidance(spec: FieldSpec) -> str:
    need = "Required" if spec.required else "Optional"
    hint = f" {spec.hint}." if spec.hint else ""

    if spec.kind == "choice":
        options = "; ".join(
            f'{index} for "{option.sentence}"'
            for index, option in enumerate(spec.options)
        )
        numbered = next(
            (
                index
                for index, option in enumerate(spec.options)
                if option.unit is not None
            ),
            None,
        )
        number = (
            f" When {numbered}, put a whole number in `{spec.key}_number` as "
            f'digits, e.g. "2".'
            if numbered is not None
            else ""
        )
        return f"- {spec.label} -> `{spec.key}_option`: {options}.{number}{hint}"

    if spec.kind == "date":
        return (
            f"- {spec.label} -> `{spec.key}`, strictly `yyyy-mm-dd`. {need}. "
            f"Leave it null if they would rather write it in by hand at "
            f"signing, which is common.{hint}"
        )

    if spec.kind == "group":
        return "\n".join(
            f"- {line.label} -> `{line.key}`. {need}." for line in spec.lines
        )

    return f"- {spec.label} -> `{spec.key}`. {need}.{hint}"


@lru_cache
def _fill_instructions(slug: str, catalog: Path, templates: Path) -> str:
    """
    The standing instruction, with the cover page quoted in full.

    The template is pasted rather than parsed and restated. The frontend already
    parses this file, and a second parser here would be a second thing to drift
    from the markdown; quoting it means the model reads the same words the
    document will use.
    """
    document = load_documents(catalog, templates)[slug]
    schema = document.schema
    guidance = "\n".join(_field_guidance(spec) for spec in schema.fields)
    first, second = schema.party_roles

    return f"""You are helping someone fill in the Cover Page of a Common Paper \
{document.title}. Here is that Cover Page in full:

---
{document.cover_page}
---

Ask about one or two related things at a time, in plain conversational \
sentences. Do not send lists of every remaining field, and do not use markdown.

Record what they tell you in these fields:

{guidance}
- The signing parties -> `party1_company`, `party1_name`, `party1_title`, \
`party1_notice_address` for {first}, and the same `party2_` fields for \
{second}. Get both company names early; little else can be settled without \
them.

The fields marked Optional above, and the signatories' names, titles and notice \
addresses, are welcome but not needed for a usable agreement — offer to leave \
them to be completed by hand rather than pressing for them.

You never write, paraphrase or invent contract language. The only wording that \
will appear in the finished agreement is what is already written above, with a \
number filled into the bracket. If someone asks for a term the Cover Page does \
not offer — an arbitration clause, a liability cap, an assignment of IP — say \
plainly that this tool only fills in the {document.title} Cover Page and that a \
change like that needs a lawyer, and record nothing about it in `fields`.

While anything required is still missing, end every reply with a question about \
it. Never leave them with nothing to answer.

Set a field only when the latest message gives you its value or corrects it. \
Leave everything else null; never restate what you already know."""


def _with_values(instructions: str, values: dict[str, Any]) -> str:
    """
    The instructions, followed by what is already settled.

    Values are quoted at length rather than in full. They are resent every turn,
    and the form will accept a value of any size, so a long one would otherwise
    be paid for again on each message. The model only needs to know a field is
    answered, not to read all of it back.
    """
    excerpts = {
        key: value[:VALUE_EXCERPT_CHARS] if isinstance(value, str) else value
        for key, value in values.items()
    }

    return (
        f"{instructions}\n\n"
        "Already filled in, as JSON, and possibly shortened. A null is a "
        "question still to ask; anything else is settled, so do not ask about "
        f"it again unless they are correcting it:\n{json.dumps(excerpts, indent=2)}"
    )


def _valid_iso_date(value: str) -> bool:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _sanitize(schema: DocumentSchema, data: dict[str, Any]) -> dict[str, Any]:
    """
    Drop anything the document cannot use.

    The model is reliable but not guaranteed, and whatever survives here flows
    into an agreement someone may sign. A bad value becomes `None` — the field
    stays unanswered and the conversation carries on — rather than an error,
    because a malformed date is no reason to lose the rest of the turn.

    Numbers mirror `sanitizeYears` in `frontend/lib/document-values.ts`: digits
    only, no leading zeros, so "-3", "1.5" and "0" cannot become a term of years.
    """
    cleaned = dict(data)

    for key, value in cleaned.items():
        if isinstance(value, str):
            cleaned[key] = value.strip() or None

    by_key = schema.by_key()

    for key, value in list(cleaned.items()):
        spec = by_key.get(key)
        if spec is None or not value:
            continue

        if spec.kind == "date" and not _valid_iso_date(str(value)):
            logger.warning("Discarded an unusable date for %s: %r", key, value)
            cleaned[key] = None

        if spec.kind == "choice" and key.endswith("_number"):
            digits = re.sub(r"\D", "", str(value)).lstrip("0")
            if digits != value:
                logger.warning("Rewrote %s from %r to %r", key, value, digits)
            cleaned[key] = digits or None

    return cleaned


def _outstanding(schema: DocumentSchema, values: dict[str, Any]) -> FieldSpec | None:
    """The first required field still waiting for an answer, if any."""
    for spec in schema.fields:
        if not spec.required:
            continue

        if spec.kind == "choice":
            option = values.get(f"{spec.key}_option")
            index = option if isinstance(option, int) else 0
            chosen = spec.options[index] if index < len(spec.options) else None
            if chosen and chosen.unit and not values.get(f"{spec.key}_number"):
                return spec
            continue

        if any(not values.get(key) for key in spec.wire_keys()):
            return spec

    return None


def _ends_with_question(reply: str) -> bool:
    return reply.rstrip().endswith("?")


def _with_question(reply: str, outstanding: FieldSpec | None) -> str:
    """
    Guarantees the user always has something to answer.

    The instructions ask for a closing question and the model usually obliges,
    but a prompt is advice and this is a promise: a reply that settles a value
    and then stops leaves someone looking at an empty box wondering whose turn
    it is. The sentence added here is chat, never contract wording — it names a
    field, and the document's own text is untouched.
    """
    if _ends_with_question(reply) or outstanding is None:
        return reply

    return f"{reply.rstrip()} What should the {outstanding.label} be?"


def _guard(request: ChatRequest, settings: Settings) -> None:
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


def _ask(
    settings: Settings,
    instructions: str,
    messages: list[ChatMessage],
    response_model: type[BaseModel],
) -> BaseModel:
    try:
        response = completion(
            model=MODEL,
            messages=[
                {"role": "system", "content": instructions},
                *(message.model_dump() for message in messages),
            ],
            response_format=response_model,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
            max_tokens=settings.chat_max_tokens,
            timeout=settings.chat_timeout_seconds,
            api_key=settings.openrouter_api_key,
        )
        return response_model.model_validate_json(response.choices[0].message.content)
    except Exception:
        # Every failure reads the same to the caller because the useful response
        # to all of them is the same: say so, and let them try again. The
        # conversation and the values are the client's, so nothing is lost.
        logger.exception("The chat completion failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI assistant is unavailable just now. Try again.",
        ) from None


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest, settings: SettingsDep) -> ChatResponse:
    _guard(request, settings)

    documents = load_documents(settings.catalog_path, settings.templates_dir)

    if request.document is None:
        turn = _ask(
            settings,
            _pick_instructions(settings.catalog_path, settings.templates_dir),
            request.messages,
            _pick_model(tuple(documents)),
        )
        chosen: str | None = turn.document  # type: ignore[attr-defined]
        reply: str = turn.reply  # type: ignore[attr-defined]

        # Something to answer until a document is settled; after that the
        # filling conversation asks its own questions.
        if not chosen and not _ends_with_question(reply):
            reply = f"{reply.rstrip()} What kind of agreement do you need?"

        return ChatResponse(reply=reply, document=chosen)

    document = documents.get(request.document)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No document '{request.document}'",
        )

    turn = _ask(
        settings,
        _with_values(
            _fill_instructions(
                document.slug, settings.catalog_path, settings.templates_dir
            ),
            request.values,
        ),
        request.messages,
        _turn_model(document.slug, settings.catalog_path, settings.templates_dir),
    )

    fields = _sanitize(
        document.schema,
        turn.fields.model_dump(),  # type: ignore[attr-defined]
    )

    # What is still missing once this turn has been applied, which is what the
    # closing question should be about.
    settled = {**request.values, **{k: v for k, v in fields.items() if v is not None}}

    return ChatResponse(
        reply=_with_question(
            turn.reply,  # type: ignore[attr-defined]
            _outstanding(document.schema, settled),
        ),
        document=document.slug,
        fields=fields,
    )
