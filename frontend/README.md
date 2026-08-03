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

## How it works

The agreement text is never duplicated in this app. `templates/` at the
repository root holds the [Common Paper](https://commonpaper.com) markdown
templates, and the page reads them directly:

| File | Role |
| --- | --- |
| `lib/templates.ts` | Reads `../templates/*.md`. Server-only. |
| `lib/cover-page-template.ts` | Parses the cover page into headings, `<label>` hints, `- [ ]` choices and `[placeholders]`. Pure. |
| `lib/mnda.ts` | The user's values, and the functions turning them into cover page wording. Pure. |
| `lib/standard-terms.ts` | Prepares the Standard Terms for rendering. Pure. |
| `app/page.tsx` | Server Component: reads and parses the templates, hands them to the client. |
| `components/mnda-creator.tsx` | Owns the values; form beside live preview. |
| `components/mnda-form.tsx` | The input fields. Labels and hints come from the template. |
| `components/agreement-document.tsx` | The agreement as it will appear on paper. |

Because the templates are parsed rather than restated, the form's help text, its
radio button wording and the suggested purpose all come from the markdown. Edit
a template and the app follows.

Everything outside `lib/templates.ts` is pure and free of React and Node APIs,
so the same merge logic could back a server-side renderer later without change.

### Downloading

"Download PDF" calls `window.print()`. The print rules at the bottom of
`app/globals.css` hide the app chrome and let the agreement fill the page, so
the browser's own "Save as PDF" produces the document. There is no PDF library.

### A note on `../templates`

`app/page.tsx` reads outside its own directory, at build time — the page
prerenders to static HTML with no runtime file access. Two consequences:

- The repository root must be present when `npm run build` runs.
- If this app is ever built separately from the templates, that read is the one
  thing to change. It is isolated in `lib/templates.ts` for exactly that reason.

## Scope

This is the KAN-3 prototype. Values live in React state only — there is no
persistence, no accounts and no server. The other eleven templates in
`catalog.json` are not wired up yet.
