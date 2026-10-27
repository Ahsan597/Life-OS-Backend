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

🚧 Early development — Phase 0 (auth + setup), Phase 1 (habits, logs, check-ins, streaks, analytics), Phase 2 (correlations + rule-based recommendations) and Phase 3 (streak-risk forecasting + personalized recommendation ranking) are done.

## Development

Requires Node 22+ (see `.nvmrc`) and Docker.

```bash
docker compose up -d        # MySQL (+ lifeos_test DB) and Adminer on :8080
cp .env.example .env        # then set real JWT secrets
npm install
npm run prisma:migrate      # apply migrations to the dev DB
npm run dev                 # node --watch
npm run seed:demo           # optional: demo@lifeos.dev / Demo@12345 with 6 weeks of history
```

| Script                                   | What it does                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `npm test`                               | Unit + integration tests (integration uses `lifeos_test`, migrated automatically) |
| `npm run test:unit` / `test:integration` | One suite only; unit tests need no database                                       |
| `npm run lint` / `format`                | ESLint / Prettier                                                                 |
| `npm run check`                          | Lint + format check + tests, the same as CI                                       |
| `npm run seed:demo`                      | Resets the demo account with deterministic sample data (refuses in production)    |

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

## API (Phase 2 — insights)

| Method | Route                           | Notes                                                                                                                                                                                                                        |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/insights/correlations`        | `?from=&to=` (default: last 90 days, max 366; today is excluded). Pearson `r` between each check-in metric and habit completion, overall and per habit, plus chart buckets                                                   |
| GET    | `/insights/recommendations`     | `?status=pending\|accepted\|dismissed\|all` (default `pending`), `?sort=rank\|recent` (default `rank`). Re-evaluates the rules first, so the list is always current. Pending items carry `score`, `priority`, `scoreFactors` |
| PATCH  | `/insights/recommendations/:id` | `{ status: "accepted" \| "dismissed" }`                                                                                                                                                                                      |

### How insights are computed

- **Correlations** pair each day's check-in metric with that day's outcome: the share of scheduled habits completed (overall) or done/missed (per habit). Weekly habits are left out because they have no single expected day. Below 7 paired days the result is `insufficient_data`; strength is `negligible` (|r| < 0.1), `weak` (< 0.3), `moderate` (< 0.5) or `strong`. `highlights` lists the moderate and strong findings, strongest first. Correlation is not causation, and the copy avoids implying it.
- **Recommendations** come from pure rules in `src/services/recommendationRules.js`: `missed_in_a_row`, `low_completion`, `streak_milestone`, `checkin_gap`, `low_sleep` and `rising_stress`. Each firing has a `dedupeKey` anchored to when the situation started, so a dismissed recommendation stays dismissed while that situation lasts, and pending ones that stop applying are removed automatically.
- Correlations are computed on request rather than stored: at one user's data volume it takes milliseconds, and nothing can go stale. Recommendations are stored only so the user's accept/dismiss decision persists.

### Day boundaries and streak rules

- "Today" is always the current date in the user's stored timezone. `date` fields default to it, and future dates are rejected.
- Dates are stored as plain `DATE` values that are already resolved, so the DB never does timezone math.
- Streaks count periods: days for `daily`, the scheduled weekdays for `custom`, and ISO weeks (Mon–Sun, any one completion) for `weekly`.
- If today (or this week) isn't done yet, it doesn't break the streak or count as a miss in the completion rate.
- History starts at the habit's creation date, or earlier if logs were backfilled.
- Archived habits are read-only: logging or editing their logs returns 409.

## API (Phase 3 — predictions)

| Method | Route                      | Notes                                                                                                                                                                        |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/predictions/streak-risk` | One forecast per active habit, riskiest first: `completionProbability`, `riskScore`, `riskLevel` (`low\|medium\|high\|insufficient_data`), `confidence`, `target`, `factors` |
| GET    | `/predictions/accuracy`    | `?from=&to=` (default: last 30 days, max 366; today is excluded). Backtest of the model: Brier score vs. a base-rate baseline, per risk level and calibration buckets        |

### How predictions are computed

- **Streak risk** (`src/services/streakRisk.service.js`, model `heuristic_v1`) forecasts the chance that the habit's next due period is completed: today (or this week) while it's still open, otherwise the next scheduled day or week (`target.current` tells which). It starts from a recency-weighted completion rate (newer periods weigh more; a Beta prior keeps short histories near 50%), blends in the rate for the target weekday, then adjusts on the log-odds scale for a run of misses, an established streak, and today's check-in on metrics that moderately or strongly correlate with that habit. Below a few periods of history the level is `insufficient_data`. Every forecast lists plain-language `factors`.
- Features are extracted separately from scoring, so a learned model (e.g. a Python `/predict` service) can later replace only the scoring step. `modelVersion` is returned for that reason.
- **Accuracy** replays the model over past days using only the logs from before each forecast day, so it is an honest out-of-sample measure. `brierSkillScore` > 0 means the model beats always predicting the overall miss rate.
- **Ranking**: each pending recommendation gets a 0-100 `score` from the rule's importance, the linked habit's current streak risk, the user's own accept/dismiss history for that rule (smoothed), and how long it has been sitting unanswered. A new rule, `streak_at_risk`, fires when a streak of 3+ is forecast as high risk in the open period.
- Like correlations, forecasts are computed on request and not stored (see `database_design.txt`).
