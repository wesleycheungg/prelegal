/**
 * Prepares a document's Standard Terms for rendering.
 *
 * The Standard Terms need no values merged into them — they are fixed legal
 * prose. They do contain markers like
 * `<span class="coverpage_link">Purpose</span>`, which are cross-references
 * back to the cover page above. We emphasise them so a reader can see they
 * point at a value defined on the cover page, rather than substituting the
 * value inline and losing that connection.
 *
 * Common Paper uses three class names for the same idea depending on the
 * document — `coverpage_link`, `keyterms_link` and `orderform_link` — and all
 * three have to be handled. Matching only the first left raw `<span>` markup
 * on the face of every document except the Mutual NDA.
 */

const COVER_PAGE_REF =
  /<span class="(?:coverpage|keyterms|orderform)_link"[^>]*>(.*?)<\/span>/g;
/** Section and sub-section headings, which the renderer styles itself. */
const HEADING_SPAN = /<span class="header_[23]"[^>]*>(.*?)<\/span>/g;
/** Anchors Common Paper uses for cross-referencing, with no text of their own. */
const EMPTY_SPAN = /<span [^>]*><\/span>\s*/g;
const LEADING_HEADING = /^#\s+.*\n/;

export function prepareStandardTerms(markdown: string): string {
  return markdown
    .replace(LEADING_HEADING, "") // The document supplies its own heading.
    .replace(EMPTY_SPAN, "")
    .replace(HEADING_SPAN, "**$1**")
    .replace(COVER_PAGE_REF, "**$1**")
    .trim();
}
