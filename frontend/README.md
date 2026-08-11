# frontend

The Prelegal web app. Currently a single tool: a **Mutual NDA creator** that
takes a handful of details and produces a complete, downloadable agreement.

Built with Next.js (App Router), TypeScript and Tailwind CSS.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

Other scripts: `npm run build`, `npm start`, `npm run lint`.

## Testing

```bash
npm test          # once
npm run test:watch
```

Vitest, with pure logic and PDF rendering in Node and component tests in jsdom
(opted into per file with a `@vitest-environment jsdom` docblock). Tests run
against the real templates in `templates/` rather than inline fixtures — coping
with those documents is the parser's whole job, and a fixture that drifted from
them would test nothing.

`components/mnda-pdf.test.tsx` renders a real PDF and reads the text back out of
its content streams. That covers what the document *says*; it says nothing about
how it *looks*. Layout, real browser downloads, printing and accessibility are
covered by the checklist in [`docs/manual-testing.md`](docs/manual-testing.md),
which also records the known gaps.

## How it works

The agreement text is never duplicated in this app. `templates/` at the
repository root holds the [Common Paper](https://commonpaper.com) markdown
templates, and the page reads them directly:

| File | Role |
| --- | --- |
| `lib/templates.ts` | Reads `../templates/*.md`. Server-only. |
| `lib/cover-page-template.ts` | Parses the cover page into headings, `<label>` hints, `- [ ]` choices and `[placeholders]`. Pure. |
| `lib/inline-markdown.ts` | Parses `**bold**` and `[links](url)` into text runs. Pure. |
| `lib/mnda.ts` | The user's values, and the functions turning them into cover page wording. Pure. |
| `lib/standard-terms.ts` | Prepares the Standard Terms for rendering. Pure. |
| `lib/agreement.ts` | Builds the finished agreement as a display-independent model. Pure. |
| `app/page.tsx` | Server Component: reads and parses the templates, hands them to the client. |
| `components/mnda-creator.tsx` | Owns the values; form beside live preview. |
| `components/mnda-form.tsx` | The input fields. Labels and hints come from the template. |
| `components/agreement-document.tsx` | Renders the agreement model to HTML. |
| `components/mnda-pdf.tsx` | Renders the same model to PDF. |

Because the templates are parsed rather than restated, the form's help text, its
radio button wording and the suggested purpose all come from the markdown. Edit
a template and the app follows.

Everything in `lib/` outside `lib/templates.ts` is pure and free of React and
Node APIs, so the same merge logic could back a server-side renderer later
without change.

### Downloading

"Download PDF" builds the file in the browser with
[`@react-pdf/renderer`](https://react-pdf.org) and saves it straight to disk —
no print dialog. The renderer is imported on demand inside the click handler,
because it is by far the largest dependency here and nobody should pay for it
just to load the form.

The PDF uses the built-in Times faces, so no font files are downloaded and the
output is small with real selectable, searchable text.

**Both the preview and the PDF render the one `Agreement` model** from
`lib/agreement.ts`. That extra layer exists so the document a user reads on
screen and the document they download cannot drift apart — for a legal agreement
that matters more than the indirection costs.

`app/globals.css` also carries print rules, so browser print (⌘P) still produces
a clean copy of the agreement without the app chrome.

### A note on `../templates`

`app/page.tsx` reads outside its own directory, at build time — the page
prerenders to static HTML with no runtime file access. Two consequences:

- The repository root must be present when `npm run build` runs.
- If this app is ever built separately from the templates, that read is the one
  thing to change. It is isolated in `lib/templates.ts` for exactly that reason.

## Scope

This is the KAN-3 prototype. Values live in React state only — there is no
persistence, no accounts and no server. The remaining ten templates in
`catalog.json` are not wired up yet.
