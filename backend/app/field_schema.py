"""
The fields of a cover page, derived from its markdown.

A port of `frontend/lib/cover-page-template.ts` and `frontend/lib/field-schema.ts`.
Both ends read the same markdown and must agree on every field name, because a
name only one side knows is a value the model fills in and the document never
receives. `test/field-schemas.json` at the repo root is asserted by both test
suites, so a change to either implementation that is not matched by the other
fails loudly rather than silently losing a term.

Pure: no FastAPI, no settings, no I/O beyond what the caller passes in.
"""

import re
from dataclasses import dataclass, field
from typing import Literal

HEADING = re.compile(r"^(#{1,3})\s+(.*)$")
LABEL = re.compile(r"^<label>(.*)</label>$")
OPTIONAL = re.compile(r"^<optional\s*/>$")
CHOICE = re.compile(r"^-\s+\[[ xX]\]\s+(.*)$")
SIGNING_STATEMENT = re.compile(r"^By signing this Cover Page.*$", re.MULTILINE)
ATTRIBUTION = re.compile(
    r"^Common Paper .*free to use under \[CC BY 4\.0\].*$", re.MULTILINE
)
PARTY_ROLES = re.compile(r"^\|\|\s*(.+?)\s*\|\s*(.+?)\s*\|?$")
PLACEHOLDER = re.compile(r"\[([^\]]*)\]")
LABELLED_LINE = re.compile(r"^(.+?):\s*\[(.*)\]\s*$")
GUIDANCE = re.compile(r"^(fill in|describe|list )", re.IGNORECASE)
DATE_PLACEHOLDER = re.compile(r"\bdates?\b", re.IGNORECASE)

MULTILINE_CHARS = 40
DEFAULT_PARTY_ROLES = ("Party 1", "Party 2")

PARTY_FIELDS = ("company", "name", "title", "notice_address")


@dataclass
class Section:
    heading: str
    hint: str | None = None
    choices: list[str] = field(default_factory=list)
    body: str = ""
    required: bool = True


@dataclass
class CoverPage:
    title: str
    intro: str
    sections: dict[str, Section]
    party_roles: tuple[str, str]


@dataclass
class ChoiceOption:
    sentence: str
    unit: str | None


@dataclass
class GroupLine:
    key: str
    label: str
    placeholder: str


@dataclass
class FieldSpec:
    kind: Literal["text", "date", "choice", "group"]
    key: str
    label: str
    hint: str | None
    required: bool
    initial: str = ""
    placeholder: str = ""
    multiline: bool = False
    options: list[ChoiceOption] = field(default_factory=list)
    lines: list[GroupLine] = field(default_factory=list)

    def wire_keys(self) -> list[str]:
        """Every name this field goes by on the wire."""
        if self.kind == "choice":
            return [f"{self.key}_option", f"{self.key}_number"]
        if self.kind == "group":
            return [line.key for line in self.lines]
        return [self.key]


@dataclass
class DocumentSchema:
    title: str
    party_roles: tuple[str, str]
    fields: list[FieldSpec]

    def by_key(self) -> dict[str, FieldSpec]:
        return {key: spec for spec in self.fields for key in spec.wire_keys()}


def slugify(heading: str) -> str:
    """`"Governing Law & Jurisdiction"` becomes `"governing_law_jurisdiction"`."""
    return re.sub(r"[^a-z0-9]+", "_", heading.lower()).strip("_")


def placeholder_of(text: str) -> str | None:
    match = PLACEHOLDER.search(text)
    return match.group(1) if match else None


def placeholder_unit(text: str) -> str:
    return re.sub(r"^\s*\d+\s*", "", placeholder_of(text) or "")


def parse_cover_page(markdown: str) -> CoverPage:
    signing = SIGNING_STATEMENT.search(markdown)
    attribution = ATTRIBUTION.search(markdown)
    signing_text = signing.group(0) if signing else ""
    attribution_text = attribution.group(0) if attribution else ""

    title = ""
    intro_lines: list[str] = []
    sections: dict[str, Section] = {}
    current: Section | None = None
    party_roles: tuple[str, str] | None = None
    body_lines: list[str] = []

    def flush() -> None:
        if current is not None:
            # Sections are keyed by heading, so a repeat would overwrite the
            # first and quietly drop a field somebody could have filled in.
            if current.heading in sections:
                raise SchemaError(f'Two sections both headed "{current.heading}"')
            current.body = "\n".join(body_lines).strip()
            sections[current.heading] = current
            body_lines.clear()

    for line in markdown.split("\n"):
        heading = HEADING.match(line)
        if heading:
            hashes, text = heading.group(1), heading.group(2)
            if hashes == "#":
                title = text
            elif hashes == "###":
                flush()
                current = Section(heading=text)
            continue

        if (
            line.startswith("|")
            or (signing_text and line == signing_text)
            or (attribution_text and line == attribution_text)
        ):
            roles = PARTY_ROLES.match(line)
            if roles and party_roles is None:
                party_roles = (roles.group(1), roles.group(2))
            continue

        if current is None:
            intro_lines.append(line)
            continue

        label = LABEL.match(line.strip())
        if label:
            current.hint = label.group(1)
            continue

        if OPTIONAL.match(line.strip()):
            current.required = False
            continue

        choice = CHOICE.match(line.strip())
        if choice:
            current.choices.append(choice.group(1).strip())
            continue

        body_lines.append(line)

    flush()

    return CoverPage(
        title=title,
        intro="\n".join(intro_lines).strip(),
        sections=sections,
        party_roles=party_roles or DEFAULT_PARTY_ROLES,
    )


def _labelled_lines(body: str) -> list[tuple[str, str]]:
    matches = (LABELLED_LINE.match(line.strip()) for line in body.split("\n"))
    return [(m.group(1), m.group(2)) for m in matches if m]


def _hint_for(section: Section) -> str | None:
    if section.hint:
        return section.hint
    if section.body and "[" not in section.body:
        return section.body
    return None


def _classify(section: Section) -> FieldSpec:
    common = {
        "key": slugify(section.heading),
        "label": section.heading,
        "hint": _hint_for(section),
        "required": section.required,
    }

    if len(section.choices) >= 2:
        return FieldSpec(
            kind="choice",
            options=[
                ChoiceOption(
                    sentence=sentence,
                    unit=(
                        placeholder_unit(sentence)
                        if any(c.isdigit() for c in (placeholder_of(sentence) or ""))
                        else None
                    ),
                )
                for sentence in section.choices
            ],
            **common,
        )

    lines = _labelled_lines(section.body)
    if len(lines) >= 2:
        return FieldSpec(
            kind="group",
            lines=[
                GroupLine(key=slugify(label), label=label, placeholder=placeholder)
                for label, placeholder in lines
            ],
            **common,
        )

    placeholder = placeholder_of(section.body) or ""
    if placeholder and DATE_PLACEHOLDER.search(placeholder):
        return FieldSpec(kind="date", **common)

    guidance = bool(GUIDANCE.match(placeholder))
    return FieldSpec(
        kind="text",
        initial="" if guidance else placeholder,
        placeholder=placeholder if guidance else "",
        multiline=not placeholder or len(placeholder) > MULTILINE_CHARS,
        **common,
    )


class SchemaError(Exception):
    """A cover page that cannot be turned into a usable set of fields."""


def parse_document_schema(markdown: str) -> DocumentSchema:
    cover_page = parse_cover_page(markdown)
    fields = [_classify(section) for section in cover_page.sections.values()]

    seen: set[str] = set()
    for spec in fields:
        for key in spec.wire_keys():
            if key in seen:
                raise SchemaError(f'{cover_page.title}: two fields both named "{key}".')
            seen.add(key)

    return DocumentSchema(
        title=cover_page.title,
        party_roles=cover_page.party_roles,
        fields=fields,
    )
