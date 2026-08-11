# prelegal
a platform for drafting legal agreements

## Status

This project is currently in progress. Work is expected to be completed by
**7 August 2026**.

## Layout

| Path | Contents |
| --- | --- |
| `frontend/` | The web app. Currently a Mutual NDA creator — see [`frontend/README.md`](frontend/README.md). |
| `templates/` | [Common Paper](https://commonpaper.com) agreement templates in markdown. |
| `catalog.json` | Index of the templates, with descriptions and provenance. |

The templates are the source of truth for agreement wording; the app reads them
rather than restating them.
