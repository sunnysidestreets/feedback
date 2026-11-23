# Sunnyside Street Safety: Neighbor Feedback

A page where Sunnyside neighbors can vote on, and comment on, the street safety proposals from the SFMTA (Bosworth-Monterey Connections Quick-Build) and SFCTA (Vision Zero Freeway Ramps Study), plus ideas neighbors have raised. Organized by Sunnyside neighbors; not run by the SFMTA or SFCTA.

- **Site:** served by GitHub Pages from this repository (`index.html` and `img/`).
- **Data:** votes, comments, and flags are stored in a Google Sheet through a small Google Apps Script web service (`apps-script/Code.gs`). Neighbor reports come in through a Google Form, and an organizer approves them in the same sheet.

## How it fits together

```
Neighbors ──▶ GitHub Pages site (index.html)
                 │  GET  ?action=getData        (cards, votes, comments, approved reports)
                 │  POST vote / addComment / flag
                 ▼
          Apps Script web app (apps-script/Code.gs)
                 │
                 ▼
          Google Sheet: Form Responses 1 · Votes · Comments · Flags
                 ▲
Neighbors ──▶ Google Form (reports go to a review queue)
```

## Settings (top of the script in `index.html`)

| Setting | What it is |
|---|---|
| `API_URL` | The Apps Script **Web app URL** (ends in `/exec`). Empty = preview mode, where votes save only in the visitor's browser. |
| `FORM_URL` | The Google Form's share link, used by the "Report an issue" buttons. |
| `DRAFT_WORDING` | Shows "draft" labels on agency cards. Off now that the wording matches the Nov 9, 2026 slides. |

The proposal cards live in the `PROPOSALS` list in `index.html`. The pictures in `img/` are crops of the SFMTA and SFCTA slides presented to the Sunnyside Neighborhood Association on Nov 9, 2026.

## Moderation (in the Google Sheet)

- **Form Responses 1:** tick **Approved** to publish a report as a card. Optional columns: **Title**, **Outside project** (orange border), **Image link** (Drive file shared "Anyone with the link").
- **Comments:** tick **Hide** to take a comment down.
- **Flags:** items hide themselves after 3 flags. Delete an item's flag rows to restore it.

## Updating the Apps Script

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Don't create a new deployment, because that changes the URL.
