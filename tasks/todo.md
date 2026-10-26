# Backlog: Task List (rev 2)

See plan.md for assumptions and acceptance criteria.

## Before starting
- [ ] Answer open questions in plan.md (ticket-queue app reference, OMDb vs TMDB, Azure subscription)
- [ ] Get free OMDb API key

## Phase 1: Foundation, early deploy
- [x] T1. Skeleton + add/list a title (Express, SQLite, tests)
- [x] T2. Passcode gate + identity cookie, server-set `added_by`
- [x] T3. Azure App Service deploy of skeleton; data survives restart/redeploy
- [x] **Checkpoint A**: live site, both users log in and add

## Phase 2: The nice part
- [x] T4. IMDb search proxy (OMDb), cached, error-safe
- [x] T5. Add-by-search UI with poster/name autofill, duplicate handling
- [x] T6. Queue poster grid (responsive, skeletons, empty state)
- [x] T7. Mark watched + review (owner only) + Watched view
- [x] **Checkpoint B**: add → watch → review → friend reads, on live site (MVP)

## Phase 3: Finish
- [x] T8. Delete permissions + UX polish (toasts, dark/light, a11y, XSS-safe)
- [ ] T9. README + final live verification
- [ ] **Checkpoint C**: tests green, live loop verified, README works
