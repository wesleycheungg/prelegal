# Manual test plan — Agreement creator

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
| 1.1 | Load the page | Chat on the left, "Tell the assistant what you need" on the right. No document yet, no layout shift |
| 1.2 | Check the header | Download PDF and the Form toggle are both disabled until a document is chosen |
| 1.3 | Pick Mutual NDA from **Agreement type** | Cover page fields, then a signature table, then 11 numbered Standard Terms |
| 1.4 | Check the Purpose field | Pre-filled with the template's suggested wording |
| 1.5 | Check the Effective Date | Blank, hinted "Leave blank to complete by hand at signing" |
| 1.6 | Check unfilled fields in the document | Show a horizontal rule to write on, not empty space |

## 1a. All eleven documents

Do these once per document, from the **Agreement type** picker.

| # | Step | Expected |
| --- | --- | --- |
| 1a.1 | Pick each of the eleven in turn | Each renders a cover page and its own Standard Terms, with no raw `<span …>` markup anywhere |
| 1a.2 | Check the signature table header | Names the document's own parties — PROVIDER/CUSTOMER, PROVIDER/PARTNER, COMPANY/PROVIDER, PARTY 1/PARTY 2 |
| 1a.3 | Switch to Form | Field captions match the cover page's headings; party groups carry the same names as the table |
| 1a.4 | Fill something in, then switch document | The new document starts empty. Nothing carries across |
| 1a.5 | Download each one | Filename is the document's own title; the PDF opens and reads correctly |

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
| 3a.5 | Page breaks | No heading orphaned at a page foot. The signature table moves whole to the next page rather than splitting — expect white space above it, not a broken table |
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

## 3c. The chat

Needs the backend: `scripts/start-mac.sh`, then http://localhost:8000.

### 3c-i. Choosing a document

| # | Step | Expected |
| --- | --- | --- |
| 3c.1 | Load the page | Chat pane on the left with a greeting; no request was made to load it |
| 3c.2 | "We want to let a customer trial our software for a month" | Picks the Pilot Agreement, says why, and the document appears on the right |
| 3c.3 | Reload, then "I need an employment contract" | **Declines**, names the closest document it does have and what it is for, and asks whether that would work. No document is chosen |
| 3c.4 | Answer "yes, that works" | It then picks that document |
| 3c.5 | Reload, then "I need a lease for our offices" | Declines the same way — this is not a hard-coded list of known requests |
| 3c.6 | Once a document is chosen, "actually make it an NDA instead" | Stays on the chosen document. Use the **Agreement type** picker to change it |

### 3c-ii. Filling it in

| # | Step | Expected |
| --- | --- | --- |
| 3c.7 | "An NDA between Acme Inc. and Globex Ltd." | Reply names both; chips list PARTY 1 and PARTY 2 Company; both appear in the signature table |
| 3c.8 | "Two years, Delaware law, courts in New Castle DE" | Term reads "Expires 2 years from Effective Date." — the template's sentence, not the assistant's |
| 3c.9 | "Effective 3 August 2026" | Document shows `August 3, 2026`. The assistant converts to ISO; a date it cannot parse is dropped rather than shown wrong |
| 3c.10 | "Make it run until we terminate it" | Term switches to the template's second sentence |
| 3c.11 | "Add a clause capping liability at $1m" | Declines, says it needs a lawyer, and **nothing about it appears in the document** |
| 3c.12 | Fill in a Cloud Service Agreement by chat | Its own fields are gathered — subscription period, payment process, cap — not the NDA's |
| 3c.13 | Answer only some of what it asks | Every reply still ends with a question while anything required is blank |
| 3c.14 | Keep going until everything required is in | It stops asking and says so |
| 3c.15 | Switch to Form | Everything the chat gathered is in the fields |
| 3c.16 | Change Governing Law in the form, switch back to Chat | The change holds, and the document shows it |
| 3c.17 | Download PDF after a chat | Same document as the preview |

### 3c-iii. Focus and failure

| # | Step | Expected |
| --- | --- | --- |
| 3c.18 | Send with the mouse, wait for the reply | **The cursor is back in the message box** — start typing without clicking |
| 3c.19 | Send with Enter, wait for the reply | Same |
| 3c.20 | Send a message that chooses the document | Same, even though the pane rebuilt around the new document |
| 3c.21 | Stop the backend, send a message | An error bubble appears, the message returns to the box, focus returns to it, and the document is untouched |
| 3c.22 | `npm run dev` on :3000, load the page | Chat shows the "needs the backend running" notice; the picker and Form still work |
| 3c.23 | Send with Enter; Shift+Enter | Enter sends, Shift+Enter starts a new line |

## 3d. Accounts

Needs the backend. Accounts are cleared whenever the server restarts, so expect
to register again after one.

| # | Step | Expected |
| --- | --- | --- |
| 3d.1 | Visit `/` signed out | The whole tool works: pick a document, chat, fill the form, download a PDF. Only saving is unavailable |
| 3d.2 | Choose a document signed out | The header offers "Sign in to save", not a Save button |
| 3d.3 | `/sign-up` with a short password | Refused, with the server's own reason, and you stay on the page |
| 3d.4 | Register properly | Lands back on `/`, header shows your email and a Sign out |
| 3d.5 | Register the same address twice | "That email is already registered" |
| 3d.6 | Sign out, then sign in with the wrong password | "Incorrect email or password" — never which half was wrong |
| 3d.7 | Reload any page while signed in | The header shows your email immediately; "Sign in" never flashes first |
| 3d.8 | Sign in with the browser's password manager | Sign-in offers the saved password; sign-up offers to generate a new one |
| 3d.9 | Visit `/sign-in` by typing the URL | Loads. So do `/sign-up` and `/documents` — every route is reachable by URL, not only by clicking |
| 3d.10 | Visit a path that does not exist | The app's own 404 page |

## 3e. Saved documents

| # | Step | Expected |
| --- | --- | --- |
| 3e.1 | Fill in an agreement, press Save | Header shows the document's name and "Saved" |
| 3e.2 | Keep editing after saving | It saves itself about a second after you stop typing. No button to press |
| 3e.3 | Rename it in the header | The new name is kept, and appears in My documents |
| 3e.4 | Open My documents | Your agreement is listed, newest first, with when it was last changed |
| 3e.5 | Click it | Opens at `/?document=<id>` with every value exactly as you left it — including the chat's answers and the term you picked |
| 3e.6 | Reload that URL | Same document again. Bookmark it and it still works |
| 3e.7 | Change agreement type after saving | A new, empty document. The saved one is untouched |
| 3e.8 | Delete one | Disappears from the list without a reload; the others stay |
| 3e.9 | Register a second account | My documents is empty. The first account's work is not visible |
| 3e.10 | Paste the first account's `/?document=<id>` while signed in as the second | Nothing loads, and the message says the document could not be opened — never that it belongs to someone else |
| 3e.11 | Restart the server, then reload | Signed out, and everything is gone. Expected, and the screens say so |
| 3e.12 | Press Save with the backend stopped | An error appears beside the button, and nothing is lost from the form |

## 3f. The draft notice

| # | Step | Expected |
| --- | --- | --- |
| 3f.1 | Look at the document pane | A notice above the agreement: draft, not legal advice, have a lawyer review it |
| 3f.2 | Download the PDF | The same notice, ruled off above the title, smaller and centred |
| 3f.3 | Read it as a counterparty would | It reads as a notice *about* the document, never as a clause of it |
| 3f.4 | ⌘P the page | The notice is on the printed copy too |

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
| 5.9 | Tab through every control on every screen | Each one shows the same focus ring. Inputs and selects too, not only buttons |
| 5.10 | Tab through the top bar | Product name, nav links, and sign in/out all reachable and ringed |
| 5.11 | With a screen reader, save a document | The result is announced — the save status is a live region |

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
| 7.1 | `npm run build` | Succeeds; `/` reported as static; writes `out/` |
| 7.2 | `scripts/start-mac.sh`, then download from http://localhost:8000 | Works the same as in dev. There is no `npm start` — `output: "export"` leaves no server to run |
| 7.3 | Open DevTools Network, load the page, then click Download | The PDF renderer is fetched only on click, not on load |
| 7.4 | Build with `templates/` renamed away | Build fails with a clear error — confirms the documented coupling |
| 7.5 | With the app served at :8000, open DevTools Network, switch to Form and fill it in | One `GET /api/health` on load, from the chat pane, and nothing after it. The form, the preview and the download stay entirely client-side |
| 7.6 | Switch between all eleven documents with the Network tab open | No requests at all. Every template is embedded at build time |
| 7.7 | Add a cover page without adding it to `catalog.json` | It simply does not appear — the catalog is what the app reads |
| 7.8 | Give two sections of one cover page the same heading, or two that differ only in case | `npm run build` fails with a message naming the clash, rather than dropping a field |

---

## Known gaps

- **No automated visual regression.** Section 3a is the only guard on PDF layout,
  apart from the signature block, which a test pins to a single page.
- **No cross-browser automation.** Section 3 is manual by necessity.
- **Characters outside Latin-1 are silently dropped from the PDF.** The built-in
  Times faces cover Latin-1 only, so CJK and similar scripts vanish with no
  error and no warning to the user. In a legal document that is silent data
  loss. Fixing it means embedding a font with wider coverage. Pinned by a test
  in `components/mnda-pdf.test.tsx` so the behaviour cannot change unnoticed.
- **No end-to-end test.** There is no Playwright or Cypress suite driving a real
  browser; the download path is covered by mocks plus this document.
