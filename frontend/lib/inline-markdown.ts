/**
 * A minimal inline markdown parser.
 *
 * The Common Paper templates use only two inline constructs: `**bold**` and
 * `[text](url)`. Parsing them into runs lets the same content drive both the
 * HTML preview and the PDF, neither of which can consume markdown directly.
 */

export interface TextRun {
  text: string;
  bold?: boolean;
  href?: string;
}

const TOKEN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

export function parseInline(markdown: string): TextRun[] {
  const runs: TextRun[] = [];
  let consumed = 0;

  for (const match of markdown.matchAll(TOKEN)) {
    const [token, bold, linkText, href] = match;
    if (match.index > consumed) {
      runs.push({ text: markdown.slice(consumed, match.index) });
    }
    runs.push(
      bold !== undefined ? { text: bold, bold: true } : { text: linkText, href },
    );
    consumed = match.index + token.length;
  }

  if (consumed < markdown.length) {
    runs.push({ text: markdown.slice(consumed) });
  }

  return runs;
}
