# Experience.com Visitor Platform (POC)

Standalone proof of concept for the visitor (consumer) side of a professional-services marketplace. Monorepo:

- `server/` – Node 22, Express 5, MongoDB, Mongoose 9, Zod 4, JWT, bcrypt
- `client/` – React 19, Vite, Redux Toolkit, React Router, Axios, Tailwind 4, Lucide

It does not depend on any existing Experience.com code. All data shown in the UI comes from the API and MongoDB; the seed scripts create the demo data.

## Contents
[Local setup](#local-setup) · [Demo credentials](#demo-credentials) · [Seed data](#seed-data) · [Scripts](#scripts) · [API endpoints](#api-endpoints) · [Database models](#database-models) · [Security model](#security-model) · [AI features and demo mode](#ai-features-and-demo-mode) · [Test results](#test-results) · [Known limitations](#known-limitations)

## Local setup
Requirements: Node.js 22+, MongoDB (local, or a connection string).

```bash
npm run install:all
cp server/.env.example server/.env     # set JWT_SECRET to a long random value
cp client/.env.example client/.env     # optional, default VITE_API_URL=/api
npm run db:start                       # terminal 1: local MongoDB, data in .data/db (skip if MongoDB already runs)
npm run seed                           # terminal 2: demo data (see below)
npm start                              # builds the client and serves app + API on http://localhost:5000
```

Hot-reload development: `npm run dev` (API on :5000, Vite on :5173, which proxies `/api`).

### Environment files
`server/.env.example` (every value has a safe development default except `JWT_SECRET`):

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT`, `MONGODB_URI` | Runtime and database |
| `JWT_SECRET` | Signs access tokens (required, use a long random value) |
| `ACCESS_TOKEN_TTL_MINUTES` | Login lifetime, default 480 |
| `BCRYPT_ROUNDS` | Password hashing cost, default 12 |
| `API_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_MAX`, `SENSITIVE_RATE_LIMIT_MAX`, `AI_RATE_LIMIT_MAX` | Rate limits |
| `EMAIL_MODE` | `dev` saves emails to a local outbox, `none` sends nothing (forced in production) |
| `CLIENT_URL` | Optional, derived by default |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | Optional real AI provider (`openrouter`, `openai`, `anthropic`); leave empty for demo mode |
| `REVIEW_INSIGHTS_MIN_NEW_REVIEWS`, `REVIEW_INSIGHTS_COOLDOWN_SECONDS` | Insight regeneration policy |
| `RECENTLY_VIEWED_DEDUP_MINUTES` | Repeat views inside this window are not counted |

`client/.env.example`: `VITE_API_URL=/api`.

## Demo credentials
All demo visitors share the demo-only password **`Demo@12345`** (stored as a bcrypt hash; never use it outside local development).

| Email | Notes |
|---|---|
| emma.carter@example.com | verified |
| liam.nguyen@example.com | verified |
| sofia.ramirez@example.com | verified |
| noah.fischer@example.com | verified |
| ava.thompson@example.com | email **not** verified (shows the verification banner) |
| suspended.demo@example.com | suspended, login is refused |

Password recovery works locally: emails go to a development mailbox at **/dev/mailbox** (loopback only, not available in production).

## Seed data
`npm run seed` is repeatable (each dataset is wiped and recreated, no duplicates; it refuses to run in production). Each dataset has its own file in `server/src/seed/`, run in dependency order by `index.js`. Random choices use a fixed seed, so every run produces the same data.

| Dataset | File | Volume |
|---|---|---|
| Visitors | `visitors.js` | 6 (bcrypt hashed) |
| Professionals | `professionals.js` | 38 across 6 categories (36 active, 1 inactive, 1 pending) |
| Reviews | `reviews.js` | ~695: 15–20 public per active professional, plus pending/rejected/hidden ones; `averageRating` and `reviewCount` are computed from the public reviews |
| Saved folders / professionals | `savedFolders.js`, `savedProfessionals.js` | 3–4 folders, 5–8 saved per visitor (some with notes) |
| Contacts / messages | `conversations.js`, `messages.js` | 3 contacted professionals per visitor, 4–6 messages each (some unread; professional replies are sample data) |
| Experience history | `experienceHistory.js` | 6 per visitor, 2 of them with professionals they contacted |
| Service records | `serviceRecords.js` | 36 |
| Saved searches | `savedSearches.js` | 5–6 per visitor |
| AI conversations | `aiConversations.js` | 3 per visitor, produced by the real pipeline in demo mode |
| Review insights | `reviewInsights.js` | 20, generated from the seeded reviews |
| Recently viewed / search history / comparisons | `recentlyViewed.js`, `searchHistory.js`, `comparisons.js` | 10–14 / 6 / 3–4 per visitor |

Verify at any time with `npm run seed:check` (62 checks: volumes, every reference valid, ratings and counts match reviews, no double bookings, no duplicates, per-visitor minimums). Names, contact details and reviews are fictional.

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | Server and client with hot reload |
| `npm start` | Build the client and serve everything on one port |
| `npm run build` | Production client build |
| `npm run seed` / `npm run seed:check` | Create / verify demo data |
| `npm test` | Server (node:test + supertest) and client (Vitest) tests |
| `npm run test:e2e` | Playwright browser tests against the real backend (separate `evp_e2e` database). First time: `npx playwright install chromium` |
| `npm run test:all` | Unit/API tests, then E2E |
| `npm run db:start` | Local MongoDB in `.data/db` |

## API endpoints
Base path `/api`. Public routes need no login. Everything else needs the login cookie and, for POST/PATCH/DELETE, the CSRF header (see [Security model](#security-model)). Private routes only touch the logged-in visitor's own records: another visitor's id returns 404, a malformed id returns 400.

**Health / dev**
- `GET /health` – API and database status (public)
- `GET /dev/emails?to=` – development mailbox (only when `EMAIL_MODE=dev`, loopback only)
- `POST /dev/simulate-reply` `{conversationId, body}` – dev-only stand-in for the professional's inbox: adds a professional reply, marks it unread and emails the visitor (loopback only, same CSRF rule; not used by the visitor app)

**Auth** (`/auth`)
- `GET /csrf` · `POST /register` · `POST /login` · `POST /logout`
- `POST /forgot-password` · `POST /reset-password` · `POST /verify-email` · `POST /resend-verification`
- `GET /me` · `PATCH /profile` (also notification and privacy settings) · `PATCH /change-password`

**Professionals** (`/professionals`, public)
- `GET /` – query: `q`, `category`, `location`, `specialization`, `services`, `minRating`, `minExperience`, `verified`, `lat` + `lng` + `maxDistanceKm` (all three together), `sort` (`rating|reviews|experience|name`), `page`, `limit` (max 50)
- `GET /categories` · `GET /locations` · `GET /compare`
- `GET /:id` · `GET /:id/reviews` (`sort`, `rating`, `page`, `limit`)

**Saved professionals and folders**
- `GET|POST /saved-professionals`, `GET /saved-professionals/ids`, `PATCH|DELETE /saved-professionals/:id` (folder, note)
- `GET|POST /saved-folders`, `PATCH|DELETE /saved-folders/:id` (deleting a folder keeps the professionals, unfiled)

**Saved searches** (`/saved-searches`)
- `GET /` · `POST /` · `GET|PATCH|DELETE /:id` · `POST /:id/run` (runs through the directory search)

**AI recommendation assistant** (`/ai`)
- `GET /status` (mode) · `POST /recommendations`
- `GET|POST /conversations` · `GET|PATCH|DELETE /conversations/:id` · `GET /conversations/:id/messages`

**Review insights** (`/review-insights`)
- `GET /professional/:professionalId` (cached insight, generated if missing) · `GET /professional/:professionalId/sources`
- `POST /professional/:professionalId/generate` (regenerate, subject to the cooldown) · `GET /mine`

**Experience history and service records** (the timeline merges experiences, service records and contacts)
- `GET|POST /experience-history`, `GET /experience-history/timeline`, `GET|PATCH|DELETE /experience-history/:id`
- `GET|POST /service-records`, `GET|PATCH|DELETE /service-records/:id` (list filters `q`, `professionalId`, `status`, `from`, `to`, `sort`; also returns `totalSpentCents`)

**Contacts** (`/conversations`; shown as *My Contacts* in the app)
- `GET /` · `GET /unread-count` · `POST /` (contact a professional: creates the thread, or adds to the existing one, and emails the professional)
- `GET /:id` · `GET /:id/messages` · `POST /:id/messages` (also emails the professional) · `POST /:id/read` · `DELETE /:id`

**History and privacy**
- `GET|POST /recently-viewed`, `DELETE /recently-viewed/:id`, `DELETE /recently-viewed/clear`
- `GET|POST /search-history`, `DELETE /search-history/:id`, `DELETE /search-history/clear`
- `GET|POST /recent-comparisons`, `DELETE /recent-comparisons/:id`, `DELETE /recent-comparisons/clear`

## Database models
All private collections reference `Visitor` and are always queried by it.

| Model | Key fields and relations |
|---|---|
| Visitor | firstName, lastName, email (unique), passwordHash (never returned), phone, role=`visitor`, accountStatus (`active|suspended|deactivated`), emailVerified, notificationPreferences (recommendations, productUpdates), privacySettings (trackHistory, historyRetentionDays 30/90/180/365), passwordChangedAt, hashed verification and reset tokens with expiry |
| Professional | fullName, title, category/categorySlug, specializations, services, description, yearsOfExperience, city/state/location, GeoJSON `coordinates` (2dsphere index), contact fields, averageRating, reviewCount, verificationStatus, profileStatus |
| Review | → Professional, reviewerName, rating, title, text, serviceCategory, reviewDate, moderationStatus, visibility (only approved + visible reviews are public) |
| SavedFolder | → Visitor, name (unique per visitor), description |
| SavedProfessional | → Visitor, → Professional (unique pair), → SavedFolder (optional), note |
| SavedSearch | → Visitor, name (unique per visitor), category, location, lat/lng, radiusKm, maxDistanceKm, minRating, specializations, serviceRequirements, additionalFilters, lastUsedAt |
| ExperienceEntry | → Visitor, → Professional, serviceUsed, experienceDate, rating, wouldRecommend, notes |
| ServiceRecord | → Visitor, → Professional, → ExperienceEntry (optional), serviceName, serviceDate, status (`planned|in_progress|completed`), amountCents, currency, summary |
| Conversation (a contact) | → Visitor, → Professional (unique pair), subject, messageCount, unreadCount, lastMessageAt, lastMessagePreview |
| Message | → Conversation, → Visitor, → Professional, senderType (`visitor|professional`), body, readAt |
| AIConversation / AIMessage | A visitor's assistant chats; messages have a role and a link to the recommendation search |
| RecommendationSearch | → Visitor, → AIConversation, criteria, directoryQuery, recommendations (professional, score, matched/unmet, explanation), mode (`demo|live`), outcome |
| ReviewInsight | → Professional (one per professional), summary, strengths, concerns, themes, recentTrends, sourceReviewIds, reviewsAnalyzed, generatedAt, generationStatus, mode, provider/model |
| RecentlyViewedProfessional | → Visitor, → Professional (unique pair), firstViewedAt, lastViewedAt, viewCount |
| SearchHistory | → Visitor, query, filters, queryKey (identical searches merge), resultsCount, searchedAt |
| RecentComparison | → Visitor, professionals (2–3), setKey (the same set in any order merges), comparedAt |
| DevEmail | Development outbox, auto-deleted after 24 hours |

## Security model
- Passwords are hashed with bcrypt. Hashes and reset/verification tokens (stored hashed) are never returned.
- JWT (HS256) in an HttpOnly, SameSite=Lax cookie. It expires after `ACCESS_TOKEN_TTL_MINUTES`; changing the password invalidates older tokens.
- CSRF: double-submit cookie. Get a token from `GET /api/auth/csrf` and send it in the `x-csrf-token` header on every state-changing request (otherwise 403).
- Zod validates every body and query and rejects unknown fields (a visitor cannot set their own role). Mongo ids are validated before any query.
- Login attempts are rate limited per IP + email; a global API limiter and a stricter limiter for AI and sensitive routes also apply.
- Unverified visitors can sign in (a banner asks them to verify); suspended accounts cannot.

## AI features and demo mode
- The assistant and review insights work without any API key in a clearly labelled **demo mode**: rule-based intent parsing, real database search, deterministic ranking, and explanations built from real fields and reviews. The UI shows a "Demo mode" label and no external AI service is called.
- **OpenRouter:** put these in `server/.env` and restart the server (the key stays on the server and is never sent to the browser):
  ```
  AI_PROVIDER=openrouter
  AI_API_KEY=<your OpenRouter key>
  AI_MODEL=openai/gpt-4o-mini   # any model id your OpenRouter account can use
  ```
  The assistant page then shows "AI provider: OpenRouter (model)" instead of the Demo banner.
- With a real model the assistant is conversational: if your request is too vague (no kind of professional, no location, unclear need) it asks one short follow-up question, merges your answer with what you already said, and recommends once it has enough. It asks at most two questions in a row. Without a model (demo mode) it never asks questions.
- Other providers: `AI_PROVIDER=openai|anthropic`, `AI_API_KEY`, `AI_MODEL` (and `AI_BASE_URL` for OpenAI-compatible servers). Model output is validated and anything that references professionals or reviews that do not exist is dropped.
- **The real-provider adapters (including OpenRouter) have only been tested with stubbed HTTP responses, never against a live API.** Questions written by the model are shown only if they are short plain text without links.
- Insights are cached per professional and regenerated only when enough new reviews arrive (`REVIEW_INSIGHTS_MIN_NEW_REVIEWS`), after the cooldown, or when a source review was removed.

## Test results
Last full run, on freshly seeded databases:

| Suite | Command | Result |
|---|---|---|
| Server (node:test + supertest, real MongoDB) | `cd server && npm test` | **156 / 156 passed** |
| Client (Vitest + Testing Library) | `cd client && npm test` | **46 / 46 passed** (10 files) |
| Client production build | `cd client && npm run build` | succeeds |
| Seed integrity | `npm run seed:check` | **62 / 62 checks passed** |
| Browser E2E (Playwright, Chromium, real backend) | `npm run test:e2e` | **29 / 29 passed** |

E2E coverage (browser → real API → MongoDB): registration, login, logout, password recovery through the dev mailbox, protected routes; save/unsave, folders, notes; contacting a professional (the professional is emailed, a simulated reply produces an email to the visitor and an unread message in the chat); experience timeline, filters, notes, service records; search preferences save/edit/delete/run; AI recommendations (natural language, filters, real DB results, demo mode); review insights (analysis, sources, caching); recently viewed, search and comparison history, clear; and a responsive check of every page at 375, 768 and 1280 px (no horizontal overflow, no console errors, navigation works).

Security tests (`server/tests/security.test.js`, `auth.test.js`, `engagement.test.js`, E2E `security.spec.js`): visitor A cannot read, change or delete visitor B's records on any private resource (404); unauthenticated requests get 401; role-escalation fields are rejected; invalid Mongo ids return 400; Zod rejects bad input; expired and tampered JWTs are refused; a missing or wrong CSRF token gets 403.

## Known limitations
- **No professional-side application.** On Experience.com a professional receives the contact by email and answers from their own inbox, and the visitor then gets an email. This POC only models the visitor side: the "email to the professional" and the "reply email to the visitor" are saved in the development mailbox (`/api/dev/emails`) and nothing is delivered. Professional replies in seeded threads are sample data, and `POST /api/dev/simulate-reply` (dev only, loopback only) stands in for a reply so the flow can be tried and tested.
- Email is development-only (a local outbox). No real email provider is connected, so verification, reset and contact emails are not delivered anywhere.
- There is no appointment or booking feature, on purpose: visitors contact professionals instead.
- The OpenAI/Anthropic adapters are untested against live services (stubbed HTTP only). Demo mode is deterministic and rule-based, not a language model.
- A JWT cannot be revoked on logout before it expires (only a password change invalidates it); logout clears the cookie.
- Rate limiters are in memory and per process; multiple servers would need a shared store.
- `npm run seed` deletes everything in the seeded collections, including data created by hand. All demo visitors share one password.
- Directory distances are measured from city centres; seed data is US-only and fictional; profile images are empty (initials are shown).
- Not tested: browsers other than Chromium, and real devices (responsive checks use emulated viewport sizes).
