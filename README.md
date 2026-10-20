# Life OS — Backend

A personal "Life OS" backend: habit tracking, daily check-ins, decision journaling, and (eventually) pattern-based predictions and recommendations for living better.

This is a learning project (Express.js + MySQL) that may grow into a real product. Built incrementally, in phases, with production-realistic practices from day one (Docker, migrations, layered architecture, tests).

## Tech Stack

- **Runtime/Framework:** Node.js + Express.js
- **Database:** MySQL 8 (via Docker)
- **ORM:** Prisma
- **Auth:** JWT (access + refresh tokens)
- **Testing:** Jest + Supertest
- **Future intelligence layer:** Node/SQL-based statistics first; real ML later via a separate Python microservice

## Vision

Life OS aims to help track and understand personal habits, decisions, and daily state (mood/energy/sleep), surface correlations between them, and eventually offer predictions and recommendations for better decision-making across every area of life (health, career, finance, relationships).

## Phased Roadmap

**Phase 0 — Foundation**
Auth, core CRUD (habits, habit logs, check-ins), layered architecture, migrations, validation, error handling.

**Phase 1 — Core Product Loop**
Streak calculation, history/calendar views, basic analytics (completion rate, trends).

**Phase 2 — Intelligence v1 (statistics)**
Correlation detection between logged variables (e.g. sleep vs. habit success), rule-based recommendations.

**Phase 3 — Prediction & Smarter Recommendations**
Streak-risk forecasting, personalized recommendation ranking (potential Python ML microservice).

**Phase 4 — Product Polish**
Notifications/reminders, exports, dashboards, possible frontend.

## Status

🚧 Early development — Phase 0 (auth + setup) and Phase 1 (habits, logs, check-ins, streaks, analytics) are done.

## Development

Requires Node 22+ (see `.nvmrc`) and Docker.

```bash
docker compose up -d        # MySQL (+ lifeos_test DB) and Adminer on :8080
cp .env.example .env        # then set real JWT secrets
npm install
npm run prisma:migrate      # apply migrations to the dev DB
npm run dev                 # node --watch
```

| Script                                   | What it does                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `npm test`                               | Unit + integration tests (integration uses `lifeos_test`, migrated automatically) |
| `npm run test:unit` / `test:integration` | One suite only; unit tests need no database                                       |
| `npm run lint` / `format`                | ESLint / Prettier                                                                 |
| `npm run check`                          | Lint + format check + tests, the same as CI                                       |

Integration tests read `.env.test` and refuse to run against any database whose name doesn't end in `_test`, so they can never wipe dev data. If your MySQL volume predates `docker/mysql/init/`, create the test DB once:

```bash
docker exec lifeos_mysql mysql -uroot -proot_password -e "CREATE DATABASE IF NOT EXISTS lifeos_test; GRANT ALL ON lifeos_test.* TO 'lifeos_user'@'%';"
```

## API (Phase 1)

All routes are under `/api/v1` and need `Authorization: Bearer <accessToken>`.

| Method | Route               | Notes                                                                                                                                                                        |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/habits`           | `{ title, description?, frequency?: daily\|weekly\|custom, targetDays? }` — `targetDays` (0 = Sun … 6 = Sat) only for `custom`                                               |
| GET    | `/habits`           | Active habits, each with `today: { date, scheduled, completed }`, `currentStreak`, `longestStreak`. `?includeArchived=true` to include archived                              |
| GET    | `/habits/:id`       | Same shape as one list item                                                                                                                                                  |
| PUT    | `/habits/:id`       | Partial update; `isActive: true` unarchives                                                                                                                                  |
| DELETE | `/habits/:id`       | Archives (soft delete) — history is kept                                                                                                                                     |
| POST   | `/habits/:id/logs`  | `{ date?, completed?: true, note? }` — one log per day; posting again updates it (201 created / 200 updated)                                                                 |
| GET    | `/habits/:id/logs`  | `?from=&to=` (YYYY-MM-DD)                                                                                                                                                    |
| PATCH  | `/logs/:id`         | `{ completed?, note? }`                                                                                                                                                      |
| GET    | `/habits/:id/stats` | Streaks, completion rate and per-week breakdown. `?from=&to=` (default: whole history)                                                                                       |
| POST   | `/checkins`         | `{ date?, mood?, energy?, sleepHours?, stressLevel?, note? }` — scales are 1-5, at least one metric required. One per day; posting again updates it and keeps omitted fields |
| GET    | `/checkins`         | `?from=&to=` (default: last 30 days, max 366)                                                                                                                                |
| GET    | `/checkins/stats`   | Per-metric count/average/min/max/trend plus the daily series. Same range rules                                                                                               |
| GET    | `/checkins/:date`   | 404 if there's no check-in that day                                                                                                                                          |

### Day boundaries and streak rules

- "Today" is always the current date in the user's stored timezone. `date` fields default to it, and future dates are rejected.
- Dates are stored as plain `DATE` values that are already resolved, so the DB never does timezone math.
- Streaks count periods: days for `daily`, the scheduled weekdays for `custom`, and ISO weeks (Mon–Sun, any one completion) for `weekly`.
- If today (or this week) isn't done yet, it doesn't break the streak or count as a miss in the completion rate.
- History starts at the habit's creation date, or earlier if logs were backfilled.
- Archived habits are read-only: logging or editing their logs returns 409.
