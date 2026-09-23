# Planroom

## Problem

Teachers write a lesson plan. The head of department reads it, sends it back, or signs it off. Planroom is that review board for one department.

## Roles

A teacher writes plans, saves drafts, and submits a complete plan. They can edit a draft or a plan that was sent back. A submitted or approved plan is read-only for them. They cannot open another teacher's plan, and they have no review queue.

A head of department sees every plan in the department. They can send a plan that is in review back with a note, approve someone else's plan, reopen an approved plan, or leave a comment. They cannot approve their own plan.

Registration creates a teacher only. The head of department account comes from the seed.

## Status

```text
Draft -- submit --> In review
In review -- approve --> Approved
In review -- send back --> Sent back
Sent back -- submit --> In review
Approved -- reopen --> Sent back
```

Those are the five legal edges. Any other jump is refused and writes no note.

## Schemas

MongoDB holds four collections. Ids are 24 hex characters. Dates on the JSON records are ISO 8601.

`users`

- `email` is required, trimmed, stored lowercase, and unique.
- `name` is required, trimmed, and at most 80 characters.
- `role` is `TEACHER` or `HOD`. The default is `TEACHER`.
- `passwordHash` is required. It is a Node scrypt hash and is not returned to the client.
- `createdAt` and `updatedAt` are timestamps.

`lesson_plans`

- `title`, `topic`, `objectives`, and `activities` are optional strings. An empty string is not stored.
- `subject` is `ENGLISH`, `MATHS`, `SCIENCE`, `SOCIAL_SCIENCE`, `COMPUTER`, `ARTS`, or `OTHER`.
- `grade` is a number from 6 to 12.
- `durationMinutes` is a number.
- `resources` is a string and defaults to `''`.
- `status` is `DRAFT`, `SUBMITTED`, `CHANGES_REQUESTED`, or `APPROVED`. The default is `DRAFT`. The screen says Draft, In review, Sent back, and Approved.
- `authorId` is required and references the user who owns the plan.
- `deletedAt` is `null` until the plan is removed. Remove sets the date and leaves the row.
- Indexes cover author and status, status and `updatedAt`, `deletedAt` and status, and a text index on `title` and `topic`.

A draft save may omit fields. A present value still has to fit: title 3 to 80 characters, topic 3 to 120, objectives 1 to 2000, activities 1 to 4000, resources at most 2000, and duration 15 to 120 minutes in steps of 5. Submitting, or saving a sent-back plan, requires the complete set.

`review_notes`

- `planId` and `authorId` are required.
- `body` is required and at most 1000 characters.
- `kind` is `COMMENT`, `SUBMITTED`, `CHANGES_REQUESTED`, `APPROVED`, or `REOPENED`.
- `createdAt` is set. There is no `updatedAt`.
- Notes for one plan are listed oldest first.

`suggest_hours`

- `hour` is `YYYY-MM-DDTHH` in server-local time and is unique.
- `count` is an integer. It counts Suggest objectives calls for that hour.

## Config files

`config/default.json`, `config/localhost.json`, and `config/production.json` are committed. Load `default.json`, then the file chosen by `APP_ENV`, then environment variables for secrets and AI overrides. A missing `APP_ENV` means localhost. `NODE_ENV` does not pick the file, because Next sets `NODE_ENV=production` at build time. `APP_ENV` must be `localhost` or `production`.

JSON may name environment variables and holds no secret values. `AI_API_KEY` and `AI_BASE_URL` are never written into JSON.

Localhost, and the default, use the `openai-compatible` provider and model `gpt-4o-mini`. Production uses `gemini` and `gemini-2.0-flash` unless `AI_PROVIDER` or `AI_MODEL` overrides them. `auth.sessionDays` is 14. `ai.enabled` defaults to true. `ai.timeoutMs` is 15000. `security.maxSuggestPerHour` is 10. The database name is `planroom`.

`.env.example` lists `APP_ENV`, `MONGODB_URI`, `AUTH_SECRET`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_PROVIDER`, and `DEMO_PASSWORD`. Copy it to `.env.local` and fill the secrets there.

## Auth

Accounts are first-party user records. The UI reads `SessionContext` and does not read the session cookie.

Register, sign in, the current session, and sign out are `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout`. Register ignores any role on the body and always creates a teacher. A duplicate email says "That email already has an account. Sign in." A password must be 8 to 72 characters. A bad sign-in says "That email and password did not match."

A successful register or sign-in sets an HTTP-only `planroom_session` cookie. The value is `base64url(payload).base64url(hmac)` signed with `AUTH_SECRET`. The session lasts 14 days. Sign out clears that cookie. The header shows a quiet Sign out control only while someone is signed in.

`/`, `/login`, and `/register` work without a session. Plan and review pages redirect to `/login` when the cookie is missing. A write with no session does not change a plan.

The demo password is `planroom` (`DEMO_PASSWORD`). The login page shows `teacher@planroom.demo` and `hod@planroom.demo` and does not print the password. The seeded teacher is Meera. The seeded head of department is Arun.

## AI failure mode

Suggest objectives drafts 3 to 5 lines into a preview. It does not write the plan and it does not change status. The teacher inserts or dismisses the preview, then saves separately. The prompt does not mention duration.

When suggestions are turned off, the form says "Suggestions are off. You can still save this plan." When `AI_API_KEY` is missing or blank, it says "Suggestions will be back soon. You can still save this plan." Neither case calls a provider or takes a cap slot. Invalid topic, subject, or grade does not take a cap slot either.

The server increments `suggest_hours` before the provider call. The 11th request in that server-local hour says "No suggestions left this hour. Try again later." and does not call the provider. A provider failure still uses the slot it already took.

When the provider cannot be reached, times out after 15 seconds, or rejects the call, the form says "Could not draft objectives. Write them yourself." The objectives field stays as it was. A preview that would push the field past 2000 characters is not inserted, and the field shows its length error.

## How to run

Use Node 26.

```text
npm install
copy .env.example .env.local
npm run seed
npm run dev
npm test
npm run test:e2e
```

On macOS or Linux, copy the env file with `cp .env.example .env.local`. Set `AUTH_SECRET` in `.env.local` to any non-blank value. Do not commit that file. Start MongoDB at the `MONGODB_URI` in `.env.local`. The example points at `mongodb://127.0.0.1:27017/planroom`. `npm run seed` inserts the two demo accounts and four plans. `npm run dev` serves `http://localhost:3000`.

Click path: sign in as the teacher and open the in-review plan read-only. The seed titles that plan "The water cycle". Sign out, sign in as the head of department, and send one plan back or approve it. Sign in as the teacher, edit the plan if it was sent back, and submit again. The demo password is `planroom`.

`npm test` runs the unit tests with Vitest. They use `mongodb-memory-server` and do not need a running MongoDB.

`npm run test:e2e` runs `tests/e2e/review-loop.spec.ts`. It signs in as `teacher@planroom.demo`, submits a new complete plan, signs out, signs in as `hod@planroom.demo`, sends that plan back with a note, and checks that the page shows Sent back and the note. Playwright starts `npm run dev` when `http://127.0.0.1:3000` is free, and reuses a server that is already running. Seed the database before the first run. If the Chromium browser is missing, install it once with `npx playwright install chromium`. GitHub Actions runs lint, `tsc --noEmit`, and `npm test` with `APP_ENV=localhost`. It does not run Playwright. A push to `main` that passes those checks also deploys to Vercel. `DEPLOY.md` says where the deploy secrets go.

## Live URL

Not deployed yet.

## Security note

The session is checked on every write. Roles live in the managers. Remove is a soft delete. There is no student PII. Secrets stay in the environment. Planroom is one department. There is no tenancy. Atlas free tier is an accepted limit. Suggest objectives costs money if it is abused. Twenty schools would break Planroom because every head of department would see every plan.
