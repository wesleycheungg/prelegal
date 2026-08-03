# Manual test plan — Mutual NDA creator

The automated suite (`npm test`) covers what the app *says*: template parsing,
resolved wording, form behaviour, and the text inside the generated PDF.

It cannot cover what the app *looks like* or how a real browser handles the
download. **The PDF's visual layout in particular is untested by machine** — the
suite reads text out of the file but never sees the page. Everything below is
the part a person has to do.

Run `npm run dev` and open http://localhost:3000 unless a case says otherwise.

---

## 1. First impressions

| # | Step | Expected |
| --- | --- | --- |
| 1.1 | Load the page | Form on the left, agreement on the right, no layout shift or flash |
| 1.2 | Read the document pane | Cover page fields, then a signature table, then 11 numbered Standard Terms |
| 1.3 | Check the Purpose field | Pre-filled with the template's suggested wording |
| 1.4 | Check the Effective Date | Blank, hinted "Leave blank to complete by hand at signing" |
| 1.5 | Check unfilled fields in the document | Show a horizontal rule to write on, not empty space |

## 2. Live preview

| # | Step | Expected |
| --- | --- | --- |
| 2.1 | Type in Governing Law | Document updates on each keystroke, no perceptible lag |
| 2.2 | Set MNDA Term to 1 year | Document reads "Expires 1 year…" — singular |
| 2.3 | Change it to 2 | Reads "Expires 2 years…" — plural |
| 2.4 | Clear the year box entirely | Reads "Expires ______ from Effective Date." — no double space, no collapse |
| 2.5 | Select "Continues until terminated" | Year box is ignored; document uses the alternative sentence |
| 2.6 | Click into the year box while the alternative is selected | Selection flips back to the fixed term |
| 2.7 | Select "In perpetuity" | Term of Confidentiality reads "In perpetuity." |
| 2.8 | Pick a date, then click **Today** | Field becomes today's local date; document shows it as e.g. "August 3, 2026" |
| 2.9 | Type a multi-line Notice Address | Line breaks are preserved in the signature table |
| 2.10 | Type a long Purpose (a paragraph) | Wraps cleanly; no overflow past the page edge |
| 2.11 | Leave Modifications empty | Document reads "None." |

## 3. Download — **the highest-risk area**

Do this in **Chrome, Safari and Firefox**.

| # | Step | Expected |
| --- | --- | --- |
| 3.1 | Fill both companies, click **Download PDF** | File downloads immediately. **No print dialog appears.** |
| 3.2 | Check the filename | `Mutual NDA - <Party 1> and <Party 2>.pdf` |
| 3.3 | Leave a company blank and download | Filename falls back to `Mutual NDA.pdf` |
| 3.4 | Watch the button during generation | Reads "Preparing…", disabled, then returns to "Download PDF" |
| 3.5 | Click Download twice quickly | No duplicate or corrupt file |

### 3a. Open the PDF and look at it

This is the part no test performs.

| # | Check | Expected |
| --- | --- | --- |
| 3a.1 | Overall | Reads as a legal document: serif type, sensible margins |
| 3a.2 | Signature table | All borders present and joined; no doubled or missing edges |
| 3a.3 | Signature and Date rows | Tall enough to sign by hand |
| 3a.4 | Column widths | Party columns equal; label column narrower |
| 3a.5 | Page breaks | No heading orphaned at a page foot; no signature row split across pages |
| 3a.6 | Numbered clauses | 1–11, numbers aligned, text not overlapping the numbers |
| 3a.7 | Long notice address | Wraps inside its cell rather than overflowing |
| 3a.8 | Select text in the PDF | Text is selectable and copyable — not an image |
| 3a.9 | Search the PDF for "Confidential" | Finds matches |
| 3a.10 | Click the CC BY link | Opens the Creative Commons licence |
| 3a.11 | Compare against the preview | Same content, same order, same values |
| 3a.12 | Curly quotes | "AS IS" and "party's" render correctly, not as boxes or gaps |

### 3b. Printing (secondary path)

| # | Step | Expected |
| --- | --- | --- |
| 3b.1 | Press ⌘P / Ctrl+P | Preview shows the agreement only — no header, no form, no buttons |
| 3b.2 | Check the print preview | Margins sensible, nothing clipped at the edges |

## 4. Responsive layout

| # | Step | Expected |
| --- | --- | --- |
| 4.1 | Widen to a desktop width | Two columns; form sticks while the document scrolls |
| 4.2 | Narrow to a tablet width | Columns stack, form above document |
| 4.3 | Narrow to ~375px (mobile) | Nothing overflows horizontally; the signature table stays readable |
| 4.4 | Scroll a long document on desktop | Form panel scrolls independently and does not detach |

## 5. Keyboard and screen reader

| # | Step | Expected |
| --- | --- | --- |
| 5.1 | Tab from the top | Every control reachable in a sensible order |
| 5.2 | Tab to the Download button | Visible focus ring |
| 5.3 | Use arrow keys on a radio group | Moves between the two options and updates the document |
| 5.4 | Activate Download with Enter and with Space | Both work |
| 5.5 | With VoiceOver/NVDA, enter the document | Announced as a region named "Agreement" |
| 5.6 | Navigate the signature table | Row and column headers announced with each cell |
| 5.7 | Trigger a download failure (offline, throttled) | The error is announced — it is a live alert |
| 5.8 | Zoom the browser to 200% | Layout still usable, nothing clipped |

## 6. Edge cases

| # | Step | Expected |
| --- | --- | --- |
| 6.1 | Download with the form untouched | Valid PDF, blanks throughout, still signable by hand |
| 6.2 | Paste 5,000 characters into Purpose | App stays responsive; PDF paginates |
| 6.3 | Enter a company name with `/ \ : * ? " < > \|` | Download succeeds; filename has them stripped |
| 6.4 | Enter accented and non-Latin text (e.g. `Ünïcode`, `株式会社`) | Preview shows both. **The PDF keeps `Ünïcode` but silently drops `株式会社`** — a known limitation, covered by a test. Confirm the behaviour is still exactly this, and no error is shown. |
| 6.5 | Set the year to 0 or a negative number | Document still reads sensibly |
| 6.6 | Set the effective date far in the past/future (1900, 2200) | Formats correctly |
| 6.7 | Change the system time zone to UTC+13 and set a date | Date does not shift by a day |
| 6.8 | Edit `templates/mutual-nda-cover-page.md`, restart dev | Form hints and radio wording follow the edit |

## 7. Build and deploy

| # | Step | Expected |
| --- | --- | --- |
| 7.1 | `npm run build` | Succeeds; `/` reported as static |
| 7.2 | `npm start`, then download | Works the same as in dev |
| 7.3 | Open DevTools Network, load the page, then click Download | The PDF renderer is fetched only on click, not on load |
| 7.4 | Build with `templates/` renamed away | Build fails with a clear error — confirms the documented coupling |

---

## Known gaps

- **No automated visual regression.** Section 3a is the only guard on PDF layout.
- **No cross-browser automation.** Section 3 is manual by necessity.
- **Characters outside Latin-1 are silently dropped from the PDF.** The built-in
  Times faces cover Latin-1 only, so CJK and similar scripts vanish with no
  error and no warning to the user. In a legal document that is silent data
  loss. Fixing it means embedding a font with wider coverage. Pinned by a test
  in `components/mnda-pdf.test.tsx` so the behaviour cannot change unnoticed.
- **No end-to-end test.** There is no Playwright or Cypress suite driving a real
  browser; the download path is covered by mocks plus this document.
