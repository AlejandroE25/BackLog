# Backlog

A small shared watchlist for two people. Search IMDb data (via OMDb) to add a movie or show with its poster, year, plot and rating filled in. The owner marks titles watched and writes a rating and review; the friend can read them. Anyone who isn't signed in sees a read-only public page at `/`; sign in at `/login`.

Live: https://backlog-ae42.azurewebsites.net

## How it works

- **Two people, no accounts.** One shared passcode, then pick "me" (owner) or "friend". The choice is stored in a signed, HttpOnly cookie.
- **Owner** (`me`): add, mark watched, rate 1–5, write or edit a review, remove anything.
- **Friend**: add titles, remove their own unwatched titles, read reviews.
- **Public** (`/` when signed out, always at `/public`; data from `GET /api/public`): posters, titles, years, ratings and reviews only. Notes and who-added-what are never exposed.
- Node 22 + Express, SQLite (`better-sqlite3`), plain HTML/CSS/JS with no build step.

## Run locally

```bash
npm install
cp .env.example .env      # then fill in the three values
set -a; . ./.env; set +a
npm start                 # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `BACKLOG_PASSCODE` | Shared login passcode (required) |
| `COOKIE_SECRET` | Signs the session cookie (required) |
| `OMDB_API_KEY` | Search and autofill. Without it, search answers 503 |
| `DB_PATH` | SQLite file. Default `data/backlog.db` |
| `PORT` | Default 3000 |

## Test

```bash
npm test
```

Tests use an in-memory database and a fake OMDb, so they run offline. They cover validation, login and permissions, search, adding by IMDb id, reviews, deletes and the public feed. The page scripts have no automated tests.

## Deploy (Azure App Service)

Pushing to `main` deploys through `.github/workflows/main_backlog-ae42.yml`. The workflow does not run the tests, so run `npm test` first.

App settings required on the web app: `BACKLOG_PASSCODE`, `COOKIE_SECRET`, `OMDB_API_KEY`, `DB_PATH=/home/data/backlog.db` (persistent storage), `SCM_DO_BUILD_DURING_DEPLOYMENT=true` (installs the native SQLite module).

`scripts/deploy.sh` creates the resource group, plan and app if they don't exist and deploys from your machine (`az login` first, secrets from `.env`). It never changes an existing plan or app.

Limits to know:
- **One instance only.** SQLite is a single file; don't scale out.
- **Search cache** is in memory and resets on restart. OMDb's free tier allows 1,000 calls a day.
- **No login rate limiting.** Use a long passcode.
- **Back up** `/home/data/backlog.db` if the reviews matter to you.

## API

| Route | Auth | Notes |
|---|---|---|
| `GET /healthz` | none | health check |
| `GET /api/public` | none | read-only feed |
| `POST /api/login`, `/api/logout` | none | `{passcode, name}` |
| `GET /api/me`, `GET /api/titles` | login | |
| `GET /api/search?q=` | login | OMDb proxy, 2+ characters |
| `POST /api/titles` | login | `{imdb_id, note}` or `{title, kind, note}` |
| `PATCH /api/titles/:id` | owner | `{rating 1-5, review}` |
| `DELETE /api/titles/:id` | owner, or friend for own unwatched | |
