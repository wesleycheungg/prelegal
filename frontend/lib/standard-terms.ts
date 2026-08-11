/**
 * Prepares `templates/mutual-nda.md` for rendering.
 *
 * The Standard Terms need no values merged into them — they are fixed legal
 * prose. They do contain `<span class="coverpage_link">Purpose</span>` markers,
 * which are cross-references back to the cover page above. We emphasise them so
 * a reader can see they point at a value defined on the cover page, rather than
 * substituting the value inline and losing that connection.
 */

const COVER_PAGE_REF = /<span class="coverpage_link">(.*?)<\/span>/g;
const LEADING_HEADING = /^#\s+.*\n/;

export function prepareStandardTerms(markdown: string): string {
  return markdown
    .replace(LEADING_HEADING, "") // The document supplies its own heading.
    .replace(COVER_PAGE_REF, "**$1**")
    .trim();
}
