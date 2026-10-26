# Plan: Backlog (rev 2)

A shared watchlist for two people. Friend and I add movies/shows by searching IMDb data (title + poster autofill); I watch them and write a review. Hosted on Azure. Should feel nice, not like a form.

Rev 2 changes: IMDb-backed search with posters, Azure hosting, and a real UI pass. The "ticket queue" framing from the homework rubric maps to this: titles are tickets, Queue → Watched is the lifecycle.

## Assumptions (change now, cheap today)
1. **Two users**: me (owner) and one friend. Friend adds; only I mark watched / review.
2. **Auth**: one shared passcode (app setting) + pick "me"/"friend", signed cookie. No accounts.
3. **Stack**: Node + Express + SQLite (`better-sqlite3`), vanilla HTML/CSS/JS frontend, no build step.
4. **"IMDb" data = OMDb API** (omdbapi.com). IMDb has no free public API; OMDb serves IMDb ids, titles, year, poster, plot, IMDb rating. Free key (1,000 calls/day) is plenty. The server proxies it so the key never reaches the browser. Alternative: TMDB (better images, free, not IMDb-branded). Say so if you prefer it.
5. **Azure**: App Service (Linux, Node, B1 or Free F1) deployed via GitHub Actions or `az webapp up`. SQLite file lives in `/home/data` (persistent on App Service Linux). Constraint: single instance only; don't scale out. Upgrade path if ever needed: Azure SQL / Cosmos.
6. **Review** = 1–5 stars + text, written once watched; editable.

## Out of scope (v1)
Multiple lists, friend reviews/comments, notifications, per-user accounts, recommendations, custom domain.

## Dependency graph
```
Skeleton + DB ─► Passcode/identity ─► OMDb search proxy ─► Add from search (poster autofill)
                                                              │
                                  Queue view (poster grid) ◄──┘
                                              │
                          Mark watched + review (owner) ─► Watched view
                                              │
                         Delete / UX polish ─► Azure deploy ─► Verify live
```
Deploy a skeleton early (T3) so Azure surprises show up while they're cheap, not at the end.

## Data model
`titles(id, imdb_id UNIQUE, title, year, kind CHECK in ('movie','show'), poster_url, plot, imdb_rating, note, added_by, added_at, watched_at NULL, rating NULL, review NULL)`
`imdb_id UNIQUE` stops duplicates (409 with a friendly "already in the queue").

## Phases & tasks

### Phase 1: Foundation, early deploy
**T1. Skeleton + add/list a title (manual fields)**: S
- Express, SQLite schema on boot, `GET /healthz`, static page; `POST/GET /api/titles`.
- Accept: add "Dune" and see it after reload; empty title / bad kind → 400.
- Verify: supertest suite (create, list, validation); run locally.

**T2. Passcode gate + identity**: S
- `BACKLOG_PASSCODE` and `COOKIE_SECRET` from env; login sets signed httpOnly cookie with name. `/api/*` 401 without it; `added_by` always from cookie.
- Accept: 401 / wrong passcode rejected / spoofed `added_by` in body ignored.
- Verify: tests; two browsers logged in as different names.

**T3. Azure deploy of the skeleton**: M
- Create resource group + App Service (Linux, Node LTS); app settings for passcode, secret, `DB_PATH=/home/data/backlog.db`; HTTPS only; deploy (GitHub Actions or `az webapp up`); `/healthz` as health check.
- Accept: live URL loads, login works, a title survives an app restart (`az webapp restart`) and a redeploy.
- Verify: restart + redeploy test on the live site. I'll need you to run `az login` (and pick the subscription) yourself.

**Checkpoint A**: live site, both of us can log in and add. Show friend.

### Phase 2: The nice part
**T4. IMDb search proxy (OMDb)**: S
- `GET /api/search?q=` → up to ~8 normalized results `{imdb_id, title, year, kind, poster_url}`; `OMDB_API_KEY` from env; missing poster handled; upstream error/timeout → 502 with clear message; short in-memory cache and min query length 2.
- Accept: "dune" returns Dune entries with posters; offline OMDb doesn't crash the app.
- Verify: tests with a mocked fetch (success, empty, upstream down); one live call.

**T5. Add-by-search UI with autofill**: M
- Search box with debounced dropdown of poster + title + year; selecting one fetches details (plot, IMDb rating) via `GET /api/lookup/:imdbId` and saves to queue with optional "why watch this" note. Keyboard accessible (arrows/enter/esc). Duplicate → friendly message.
- Accept: type, pick, it appears in the queue with cover and name filled in, no typing beyond the query.
- Verify: tests for lookup + 409; manual keyboard-only add.

**T6. Queue poster grid**: S
- Responsive poster cards (title, year, who added, note), loading skeletons, empty state, placeholder image for missing poster.
- Accept: looks good at 375px and 1280px; no layout shift when images load (fixed aspect ratio).

**T7. Mark watched + review (owner only) + Watched view**: M
- `PATCH /api/titles/:id` `{rating 1-5, review}` sets `watched_at`; 403 for friend, 404 unknown id, rating validated. Watched section shows poster, stars, review (friend read-only); review editable.
- Accept: a title is in exactly one view; friend never sees review controls.
- Verify: API tests per rule; manual end-to-end.

**Checkpoint B**: full loop works on the live site (friend adds → I watch → I review → friend reads). MVP.

### Phase 3: Finish
**T8. Delete + UX polish**: S
- Friend can delete own unwatched entries; owner can delete anything; confirm dialog; toasts for success/error; dark/light via `prefers-color-scheme`; focus states; contrast ok; all user text escaped (no raw `innerHTML`).
- Accept: `<img onerror>` title/review renders as text; permissions enforced by tests.

**T9. README + final live verification**: S
- README: setup, env vars, `az` deploy steps, tests. Redeploy and walk the whole loop on phones.
- Accept: fresh clone + README runs locally; live loop passes.

**Checkpoint C**: tests green, live loop verified, README works.

## Risks
| Risk | Mitigation |
|---|---|
| OMDb is not literally IMDb; rate limit 1,000/day | Cache, min query length; switch to TMDB if wanted |
| SQLite on App Service breaks if scaled out or on a non-persistent path | Single instance, `/home/data`; verify survival in T3 |
| Azure subscription/cost/quota | Free F1 tier works for this; check subscription before T3 |
| API key or passcode leak | Env/app settings only; never in repo or browser |
| "Ticket queue app" you mentioned may have a layout/features to match | See question below |

## Open questions
- Is the ticket-queue app an existing codebase to reuse/match in look or structure? If so point me at it and I'll fold it in. If not, this plan stands alone.
- OMDb (IMDb ids) ok, or would you rather TMDB?
- Azure subscription ready (student credits)?
