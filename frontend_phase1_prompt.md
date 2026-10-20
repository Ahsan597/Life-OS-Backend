# Life OS — Frontend Phase 1 Build Prompt

You are building the **frontend** for "Life OS", a personal habit-tracking and daily check-in app. The backend (Express + MySQL) is already built and running. Your job is to build the **Phase 1 (Core Product Loop / MVP)** UI on top of it.

**Phase 1 goal:** a user can create habits, mark them done each day, do a daily check-in (mood / energy / sleep / stress), and see their progress (streaks, completion rates, trends).

**Hard rule:** only build UI for the endpoints listed in this document. Do not invent endpoints or features (no AI insights, decision journal, goals, profile editing, or notifications). Those belong to later phases.

---

## 1. Tech stack (use these unless already decided otherwise)

- **React 18 + Vite + TypeScript**: the backend's CORS is configured for `http://localhost:5173`, the Vite default.
- **React Router**: routing and protected routes.
- **TanStack Query (React Query)**: all server state, caching, and invalidation after mutations. Don't keep server data in `useState`/Redux.
- **Axios**: one shared API client with interceptors.
- **React Hook Form + Zod**: forms and client-side validation that mirror the backend rules below.
- **Recharts**: charts.
- **Tailwind CSS** (plus a small component kit such as shadcn/ui if you want).
- **ESLint + Prettier**, strict TypeScript, and a typed API layer (`src/api/*.ts` with types for every request and response).

Suggested folder structure:

```
src/
  api/          client.ts, auth.ts, habits.ts, logs.ts, checkins.ts, types.ts
  hooks/        useHabits.ts, useCheckIns.ts ... (React Query hooks)
  features/
    auth/       LoginPage, RegisterPage, AuthProvider, ProtectedRoute
    dashboard/  DashboardPage, TodayHabitList, CheckInPrompt
    habits/     HabitsPage, HabitForm, HabitDetailPage, HabitCalendar, ArchiveDialog
    checkins/   CheckInPage, CheckInForm, CheckInHistoryPage, TrendCharts
  components/   Layout, Navbar, Sidebar, Button, Modal, Toast, EmptyState, Spinner, ErrorMessage
  lib/          dates.ts, errors.ts
```

---

## 2. Backend connection basics

- **Base URL:** `http://localhost:3000/api/v1`. Put it in `.env` as `VITE_API_URL`.
- **Format:** JSON in, JSON out. Send `Content-Type: application/json`.
- **Auth header** on every protected request: `Authorization: Bearer <accessToken>`
- **Health check:** `GET /health` → `{ "status": "ok", "database": "connected" }`
- **Test account:** `demo@lifeos.dev` / `Demo@12345`

### IDs
All IDs are **strings** (for example `"29"`), not numbers. Keep them as strings.

### Dates
- Every calendar date is a string in the format **`YYYY-MM-DD`**.
- "Today" is decided by the **server, in the user's saved timezone**. Don't calculate "today" from the browser clock for logic. Read it from `habit.today.date` in `GET /habits` (see section 5). Do date math with plain `YYYY-MM-DD` strings (or `date-fns` on UTC dates) so timezones can't shift the day.
- The backend rejects **future dates** for habit logs and check-ins. Disable future days in the UI.

### Error format (every error response)
```json
{ "error": "Validation failed", "details": [ { "field": "title", "message": "Title is required" } ] }
```
- `details` appears only on validation errors (400). Map each `field` onto the matching form input's error message.
- Status codes: `400` validation or bad input, `401` not logged in or token expired, `404` not found, `409` conflict (email already taken, or the habit is archived), `500` server error. For 500, show a generic "Something went wrong" toast.
- Write a single `getErrorMessage(err)` helper in `lib/errors.ts` and use it everywhere.

---

## 3. Authentication (Phase 0 prerequisite: build it if it doesn't exist yet)

| Method | Endpoint | Body | Success |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name?, timezone? }` | `201 { user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` | `200 { user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` |
| POST | `/auth/logout` | `{ refreshToken }` | `204` (no body) |
| GET | `/auth/me` | (none, needs a Bearer token) | `200 { user }` |

`user` = `{ id, email, name, timezone, createdAt }`

**Validation rules to mirror on the client:**
- email: valid email, max 255.
- password: 8–72 characters on register. Required on login.
- name: optional, 1–100.
- timezone: an IANA name. **On register, send it automatically** with `Intl.DateTimeFormat().resolvedOptions().timeZone` (for example `"Asia/Karachi"`). It is required for correct "today" handling, and there is no endpoint to change it later.

**Token behaviour (important):**
- The access token lasts **15 minutes**. The refresh token lasts **7 days**.
- Refresh tokens **rotate**: each `/auth/refresh` call returns a **new** refresh token and permanently revokes the old one. Always save the new one.
- If an already-used refresh token is sent again, the backend treats it as theft and **logs the user out everywhere**. So:
  - Build an Axios response interceptor. On a `401` from a protected endpoint, call `/auth/refresh` **once**, save both new tokens, and retry the original request.
  - The refresh must be **single-flight**. If 5 requests fail at the same moment, only one refresh call may happen; the others wait for it and then retry.
  - If the refresh itself fails, clear the tokens and redirect to `/login`.
  - Never try to refresh in response to a failure of `/auth/login`, `/auth/register`, or `/auth/refresh` itself.
- Storage: keep the access token in memory and the refresh token in `localStorage`. This is acceptable for the MVP because the backend returns tokens in the response body, not in cookies.
- On app start: if a refresh token exists, call `/auth/refresh`, then `/auth/me`, to restore the session. Show a full-page loader until that finishes.
- Logout: call `/auth/logout` with the refresh token, clear storage, clear the React Query cache, and go to `/login`.
- `<ProtectedRoute>` redirects to `/login` when there is no session. Logged-in users who visit `/login` or `/register` go to `/`.

---

## 4. Pages and routes

| Route | Page | Auth |
|---|---|---|
| `/login`, `/register` | Auth forms | public |
| `/` | Dashboard | protected |
| `/habits` | Habit list (active, plus an archived toggle) | protected |
| `/habits/new` | Create habit | protected |
| `/habits/:id` | Habit detail: calendar, stats, chart, log history | protected |
| `/habits/:id/edit` | Edit habit | protected |
| `/checkin` | Today's check-in form (or `?date=YYYY-MM-DD` for a past day) | protected |
| `/checkins` | Check-in history and trend charts | protected |

Layout: a Navbar showing the user's name and a logout button, and a Sidebar linking to Dashboard, Habits, Check-in, and History. It must be responsive: the sidebar collapses on mobile.

---

## 5. Habits

### Data shape
`GET /habits` and `GET /habits/:id` return the **enriched** habit:
```json
{
  "id": "12",
  "title": "Read 20 pages",
  "description": "Before bed",
  "frequency": "daily",          // "daily" | "weekly" | "custom"
  "targetDays": null,            // custom only: array of 0-6 (0 = Sunday ... 6 = Saturday)
  "isActive": true,              // false = archived
  "createdAt": "...", "updatedAt": "...",
  "today": { "date": "2026-10-20", "scheduled": true, "completed": false },
  "currentStreak": 4,
  "longestStreak": 9
}
```
`POST /habits` and `PUT /habits/:id` return the **plain** habit, without `today` or the streak fields. After any mutation, **invalidate the habit queries** so the enriched data refetches.

### What the frequencies mean (explain these in the UI too)
- **daily**: expected every day.
- **custom**: expected only on the chosen weekdays (`targetDays`). Other days are "not scheduled", not "missed".
- **weekly**: expected once per week (Monday–Sunday). Any completed day in the week counts. Its streak is measured **in weeks**, so label it "4 weeks", not "4 days".
- The current day or week isn't counted as a miss until it is over (it is "pending"). A streak doesn't break just because today isn't done yet.

### Endpoints
| Method | Endpoint | Body / Query | Success |
|---|---|---|---|
| POST | `/habits` | `{ title, description?, frequency?, targetDays? }` | `201 { habit }` |
| GET | `/habits` | `?includeArchived=true` (default `false`) | `200 { habits: [...] }`, oldest first |
| GET | `/habits/:id` | (none) | `200 { habit }` or `404` |
| PUT | `/habits/:id` | any subset of `{ title, description, frequency, targetDays, isActive }` (at least one) | `200 { habit }` |
| DELETE | `/habits/:id` | (none) | `204`: **archives** it (soft delete). History is kept. |

**Validation rules:**
- title: required, 1–150 characters (trimmed).
- description: optional, max 2000. Send `null` to clear it.
- frequency defaults to `"daily"`.
- **targetDays is required when frequency is `custom`** (at least one day), and **must not be sent** for `daily` or `weekly`.
- When editing away from `custom`, the backend clears `targetDays` automatically.

### UI to build
- **Habit form** (shared by create and edit): title, description, and a frequency selector (Daily / Weekly / Specific days). When "Specific days" is selected, show 7 toggleable weekday chips (Sun–Sat → 0–6). Only send `targetDays` when the frequency is custom. On edit, send only the fields that changed.
- **Habits list**: a card per habit showing the title, a frequency label (for example "Mon, Wed, Fri"), the current streak with a 🔥 icon, the longest streak, and today's status. Add a "Show archived" toggle that uses `includeArchived=true`; archived habits are greyed out and have a **Restore** button (`PUT { isActive: true }`). Show an empty state with a "Create your first habit" button.
- **Archive ("delete") confirmation dialog**: "Archive this habit? Its history is kept and you can restore it later." → `DELETE`.
- **Archived habits are read-only.** Logging them returns `409`. Hide or disable log toggles for archived habits.

---

## 6. Habit logs (marking done)

A habit has **at most one log per day**. Posting again for the same date **updates** that day's log (upsert).

Log shape: `{ id, habitId, date: "YYYY-MM-DD", completed: boolean, note: string|null, createdAt }`

| Method | Endpoint | Body / Query | Success |
|---|---|---|---|
| POST | `/habits/:id/logs` | `{ date?, completed? (default true), note? }` | `201 { log }` new, `200 { log }` updated |
| GET | `/habits/:id/logs` | `?from=YYYY-MM-DD&to=YYYY-MM-DD` (both optional; no range returns all) | `200 { logs }`, oldest first |
| PATCH | `/logs/:id` | `{ completed?, note? }` (at least one) | `200 { log }` |

- `date` is optional. Leaving it out means "today" in the user's timezone.
- Future dates → `400`. Archived habit → `409`.
- Note: max 2000 characters.

**How to toggle:**
- Mark done: `POST /habits/:id/logs { "completed": true }`
- Undo: `POST /habits/:id/logs { "completed": false }`. This works whether or not a log exists.
- Past day (backfill): `POST /habits/:id/logs { "date": "2026-10-18", "completed": true }`
- Add or edit a note on an existing log: `PATCH /logs/:id { "note": "..." }`

Use **optimistic updates** in React Query (flip the checkbox instantly, roll back on error), then invalidate `habits` and that habit's `logs` and `stats`.

---

## 7. Habit stats and streaks

`GET /habits/:id/stats?from=&to=` (both optional; the default is the habit's whole history up to today)

```json
{ "stats": {
  "habitId": "12", "frequency": "daily",
  "currentStreak": 4, "longestStreak": 9,
  "from": "2026-09-01", "to": "2026-10-20",
  "scheduled": 45, "completed": 38,
  "completionRate": 0.844,          // 0-1, or null if nothing was scheduled yet
  "weekly": [ { "weekStart": "2026-09-01", "scheduled": 7, "completed": 6, "rate": 0.857 } ]
} }
```
- `completionRate` and `rate` are fractions. Show them as percentages (`0.844` → "84%"). Show `null` as "—".
- `from` and `to` in the response are the range actually used (clipped to the habit's start date and today). Display those values.

### Habit detail page (`/habits/:id`)
1. Header: title, description, frequency label, Edit and Archive buttons, and a big "Done today" toggle.
2. **Stat tiles**: Current streak, Longest streak, Completion rate, and Completed / Scheduled.
3. **Calendar heatmap** (GitHub-style grid or a month calendar) covering the last ~3 months. Fetch the logs with `from`/`to`. Colour each day as:
   - completed → green
   - scheduled but not completed (past) → red or grey "missed"
   - not scheduled (custom habit, off-day) → neutral or blank
   - today, not done → outlined "pending"
   - future → disabled
   - before the habit's `createdAt` → neutral (unless there is a backfilled log)

   Clicking a past day toggles it (POST with that `date`) and opens a small note editor.
4. **"Completion rate over time" chart**: a Recharts bar or line chart of `stats.weekly` (x = `weekStart`, y = `rate` × 100). Add a range selector (4 weeks / 12 weeks / all time), which sets `from`.
5. **Log history list**: date, done/not done, and a note with inline edit (`PATCH /logs/:id`).

---

## 8. Daily check-ins

One check-in per day per user, holding 4 optional metrics and a note.

Check-in shape:
```json
{ "id": "5", "date": "2026-10-20", "mood": 4, "energy": 3, "sleepHours": 7.5, "stressLevel": 2, "note": "Good day", "createdAt": "..." }
```

| Method | Endpoint | Body / Query | Success |
|---|---|---|---|
| POST | `/checkins` | `{ date?, mood?, energy?, sleepHours?, stressLevel?, note? }` | `201 { checkIn }` new, `200 { checkIn }` updated |
| GET | `/checkins` | `?from=&to=`: defaults to the last 30 days, **max 366 days** | `200 { from, to, checkIns: [...] }` |
| GET | `/checkins/:date` | (none) | `200 { checkIn }`, or **`404` = no check-in that day** (normal, not an error) |
| GET | `/checkins/stats` | `?from=&to=` (same defaults and limit) | `200 { stats }` (below) |

**Validation rules:**
- mood, energy, stressLevel: **whole numbers 1–5**, or `null`.
- sleepHours: 0–24, rounded to 1 decimal place (for example 7.5).
- note: max 2000.
- **At least one** of the 4 metrics must be present.
- `date` is optional (defaults to today). Future dates → `400`.
- **Upsert semantics:** posting again for the same day updates it. **Fields you leave out keep their old value; sending `null` clears a field.** So in the edit form, send `null` for metrics the user cleared.

### Check-in form (`/checkin`)
- On load, call `GET /checkins/:date` for today (or `?date=`). On `200`, prefill the form ("Update today's check-in"). On `404`, show an empty form ("How was your day?").
- Inputs: Mood 1–5 (emoji scale 😞 😕 😐 🙂 😄), Energy 1–5, Stress 1–5 (label "1 = calm, 5 = very stressed"), Sleep hours (number input or slider, step 0.5, 0–24), and Note (textarea, with a character counter out of 2000).
- Each metric can be left blank. Disable the submit button until at least one is filled.
- After saving: a success toast, then invalidate the check-in queries and return to the dashboard.

### Check-in history and trends (`/checkins`)
`GET /checkins/stats` returns:
```json
{ "stats": {
  "from": "2026-09-21", "to": "2026-10-20",
  "daysInRange": 30, "daysCheckedIn": 22,
  "metrics": {
    "mood":        { "count": 22, "average": 3.82, "min": 2, "max": 5, "slopePerDay": 0.021, "trend": "rising" },
    "energy":      { ... }, "sleepHours": { ... }, "stressLevel": { ... }
  },
  "series": [ { "date": "2026-09-21", "mood": 4, "energy": 3, "sleepHours": 7, "stressLevel": 2 } ]
} }
```
- `trend` is `"rising" | "falling" | "flat" | null` (`null` = not enough data). **Interpret it per metric:** rising mood, energy, or sleep is good (green ↑). **Rising stress is bad** (red ↑).
- Build:
  1. A range selector: 7 / 30 / 90 days / custom. Compute `from` from `to`, and never exceed 366 days.
  2. A consistency tile: "Checked in X of Y days".
  3. A metric tile for each of the 4 metrics: average, min–max, and a trend arrow (or "Not enough data").
  4. **Trend line charts** from `series`: one line chart with mood, energy, and stress on a 1–5 axis, and a separate chart for sleep hours (0–12). Days without a check-in are absent from `series`, so show gaps; don't draw them as zero.
  5. A history list or table of `checkIns`, with each row linking to `/checkin?date=...` for editing.

---

## 9. Dashboard (`/`), the main screen

1. **Greeting** with the user's name and today's date (from `habits[0].today.date`, or the client date as a fallback).
2. **Check-in prompt**: call `GET /checkins/{today}`. On `404`, show a highlighted card "You haven't checked in today → Check in" linking to `/checkin`. On `200`, show a compact summary of today's values with an Edit link.
3. **Today's habits**: from `GET /habits`, show habits where `today.scheduled === true`, each with a checkbox or toggle bound to `today.completed` (optimistic POST log) and its current streak. Include a progress bar showing "3 / 5 done today".
4. **"Not scheduled today"**: a collapsed section for custom habits that aren't scheduled today. For **weekly** habits, show "Done this week ✓" when the current streak includes this week, and still allow logging today.
5. Empty state when the user has no habits: a "Create your first habit" button.

---

## 10. Quality requirements (all screens)

- A loading skeleton or spinner for every query. An error state with a Retry button. Empty states.
- Disable buttons while a mutation is in progress (no double submits).
- Toasts for success and failure. Show 400 field errors inline on the form inputs.
- Accessible: labelled inputs, keyboard-usable toggles and calendar cells, colour plus an icon or text (don't rely on colour alone in the heatmap).
- Responsive down to 360px wide.
- All API types in `src/api/types.ts`. No `any`.
- React Query keys, for example: `['habits', { includeArchived }]`, `['habit', id]`, `['habitLogs', id, from, to]`, `['habitStats', id, from, to]`, `['checkin', date]`, `['checkins', from, to]`, `['checkinStats', from, to]`. Invalidate the related keys after each mutation.
- Clear the React Query cache on logout so the next user never sees stale data.

## 11. Out of scope for Phase 1 (don't build)
Insights or recommendations, profile or timezone editing, password reset, decision journal, goals or life areas, notifications or reminders, and dark mode (optional, only if it's trivial).

## 12. Definition of done
Using `demo@lifeos.dev` / `Demo@12345`, I can: log in, stay logged in after a page refresh and after the 15-minute token expiry, create daily, weekly, and custom habits, tick them off on the dashboard, see streaks update, backfill a past day from the calendar, add notes, archive and restore a habit, submit and edit today's check-in, view trends over 7, 30, and 90 days, and log out.
