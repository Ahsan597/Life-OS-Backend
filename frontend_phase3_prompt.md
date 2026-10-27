# Life OS — Frontend Phase 3 Build Prompt

You are extending the **frontend** for "Life OS", a personal habit-tracking and daily check-in app (React 18 + Vite + TypeScript, React Router, TanStack Query, Axios, React Hook Form + Zod, Recharts, Tailwind). Phases 1 and 2 are already built: auth, dashboard, habits, logs, check-ins, trends, and the Insights page (correlation cards and a recommendations feed). Your job is to build the **Phase 3 (Prediction & Smarter Recommendations)** UI.

**Phase 3 goal:** the app stops only describing the past and starts **looking ahead**. It warns which habit streaks are likely to break, explains why in plain language, shows how accurate those warnings have been, and orders the recommendations feed by what matters most to this user right now.

**Hard rule:** only build UI for the endpoints listed in this document. Don't invent endpoints or features (no notifications, reminders, exports, or settings; those are Phase 4). Reuse the existing API client, auth and refresh handling, error helper (`getErrorMessage`), layout, and component kit. Don't rebuild any of them.

---

## 1. Backend basics (unchanged)

- Base URL: `VITE_API_URL` (`http://localhost:3000/api/v1`). Every endpoint below needs `Authorization: Bearer <accessToken>`; the existing interceptor already handles this.
- IDs are **strings**. Dates are `YYYY-MM-DD` strings, already resolved in the user's timezone by the server. Never compute "today" from the browser clock for logic.
- Errors: `{ error, details? }`. `400` = bad query, `401` = handled by the refresh interceptor.
- Test account: `demo@lifeos.dev` / `Demo@12345`. Ask for `npm run seed:demo` to be re-run on the backend if the demo data looks stale, because the seed is relative to "today".

Add these types to `src/api/types.ts` and the functions to a new `src/api/predictions.ts`. Update `src/api/insights.ts` for the recommendation changes.

---

## 2. Streak-risk forecasts: `GET /predictions/streak-risk`

No query parameters. Returns one forecast per **active** habit, **riskiest first**, with `insufficient_data` forecasts last.

```jsonc
{
  "date": "2026-10-27", // the user's "today"
  "modelVersion": "heuristic_v1",
  "habits": [
    {
      "habitId": "19",
      "title": "Gym",
      "frequency": "custom", // "daily" | "weekly" | "custom"
      "currentStreak": 0,
      "target": {
        "period": "day", // "day" | "week"
        "date": "2026-10-28", // the day, or the week's Monday when period = "week"
        "current": false, // true = today/this week, still open (the streak is on the line NOW)
      },
      "completionProbability": 0.095, // 0-1
      "riskScore": 0.905, // 0-1, = 1 - completionProbability
      "riskLevel": "high", // "low" | "medium" | "high" | "insufficient_data"
      "confidence": "high", // "low" | "medium" | "high" (how much history it's based on)
      "factors": [
        {
          "factor": "recent_completion",
          "effect": "raises_risk",
          "detail": "Done 3 of the last 10 scheduled days.",
        },
        {
          "factor": "day_of_week",
          "effect": "lowers_risk",
          "detail": "Done on 4 of the last 7 Wednesdays (57%, vs 30% recently overall).",
        },
        {
          "factor": "miss_run",
          "effect": "raises_risk",
          "detail": "Missed the last 6 scheduled days in a row.",
        },
      ],
      "modelVersion": "heuristic_v1",
    },
  ],
}
```

What the fields mean:

- **`target`** is the period the forecast is about. When today's (or this week's) log is still missing, it is today and `current: true`. Once the user ticks the habit off, the forecast moves to the **next** scheduled day or week (`current: false`). For a custom habit on an off-day, it is the next scheduled day.
- **`riskLevel`**: `riskScore` ≥ 0.6 is `high`, ≥ 0.35 is `medium`, and anything lower is `low`. **`insufficient_data`** means fewer than about 5 days (or 3 weeks) of history. In that case `riskScore` is still present but is only a placeholder. **Never show a risk badge or percentage for `insufficient_data`**; show "Not enough history yet" instead.
- **`factors`**: plain-language reasons, already worded for display. `factor` is one of `recent_completion`, `day_of_week`, `miss_run`, `streak`, or `checkin`. A `checkin` factor also carries `metric` (`sleepHours`, `mood`, `energy`, or `stressLevel`) and only appears when today's check-in is in and that metric is linked to this habit. `effect` is `raises_risk` or `lowers_risk`. Use it for the icon and colour (↑ red / ↓ green). Never parse `detail`.
- **Copy rule:** phrase forecasts as tendencies, not certainties. Write "about 90% chance of a miss, based on your recent pattern", never "you will miss".

---

## 3. Forecast accuracy: `GET /predictions/accuracy?from=&to=`

The backend backtests the model: it replays past days using only the data that was known before each day, then compares the forecasts with what actually happened. Both query params are optional. The default is the last 30 days, the maximum is 366 days, and today is excluded (its outcome isn't known yet).

```jsonc
{
  "from": "2026-09-28",
  "to": "2026-10-26",
  "modelVersion": "heuristic_v1",
  "evaluated": 75, // number of forecasts checked; 0 = nothing to show yet
  "observedMissRate": 0.533,
  "brierScore": 0.2179, // 0 = perfect, 0.25 = coin flip (lower is better)
  "baselineBrierScore": 0.2489, // "always guess your average miss rate"
  "brierSkillScore": 0.125, // > 0 = better than that baseline; can be null
  "byRiskLevel": [
    {
      "riskLevel": "low",
      "predictions": 22,
      "averagePredictedRisk": 0.241,
      "observedMissRate": 0.409,
    },
    {
      "riskLevel": "medium",
      "predictions": 29,
      "averagePredictedRisk": 0.463,
      "observedMissRate": 0.379,
    },
    {
      "riskLevel": "high",
      "predictions": 24,
      "averagePredictedRisk": 0.771,
      "observedMissRate": 0.833,
    },
  ],
  "calibration": [
    {
      "bucket": "0-20%",
      "predictions": 8,
      "averagePredictedRisk": 0.167,
      "observedMissRate": 0.625,
    },
    // ... "20-40%", "40-60%", "60-80%", "80-100%"
  ],
}
```

When a group has `predictions: 0`, its averages are `null`. Skip that group or show "—". If `evaluated` is `0`, show an empty state: "Keep logging for a week or two and we'll show how accurate these forecasts are."

---

## 4. Ranked recommendations: changes to `GET /insights/recommendations`

The query parameters are `?status=pending|accepted|dismissed|all` (as before) and **new** `?sort=rank|recent` (default **`rank`**).

- `rank`: pending recommendations come first, ordered by a personalized score from highest to lowest. Accepted and dismissed ones follow, newest first.
- `recent`: newest first, the Phase 2 behaviour.

Each recommendation now has three extra fields. They are filled only for **pending** items and are `null` for accepted or dismissed ones:

```jsonc
{
  "id": "41",
  "rule": "missed_in_a_row",
  "source": "rule_based",
  "habitId": "18",
  "habitTitle": "Read 20 pages",
  "message": "...",
  "reason": "...",
  "status": "pending",
  "createdAt": "...",
  "updatedAt": "...",
  "score": 54, // 0-100
  "priority": "medium", // "high" (>= 60) | "medium" (>= 35) | "low"
  "scoreFactors": {
    // multipliers behind the score; 1 = neutral
    "ruleWeight": 0.85, // how important this kind of advice is
    "habitRisk": 1.2, // > 1 = linked habit's streak is at risk
    "feedback": 1, // > 1 = you usually accept this kind; < 1 = you usually dismiss it
    "freshness": 1.1, // new advice ranks slightly higher; decays over ~2 weeks
  },
}
```

There is also **a new rule, `streak_at_risk`**: "Your 5-day streak on "Read" is at risk today…". It fires when a streak of 3 or more is forecast as high risk for the open period. It is the most urgent rule, so give it a distinct icon (for example a flame with a warning badge).

The score is personalized: accepting or dismissing a recommendation feeds into future ranking. `PATCH /insights/recommendations/:id` with `{ status }` works as before; after a PATCH, invalidate `['recommendations', ...]`.

---

## 5. UI to build

### 5.1 Risk badge on habit cards (Dashboard + Habits list)

- Fetch `GET /predictions/streak-risk` once with React Query (`['streakRisk']`) and build a `Map<habitId, forecast>`. Join it client-side with the habit list; don't add a request per card.
- Badge rules:
  - `riskLevel: "high"` and `target.current: true` → a prominent **"At risk"** badge (red or amber, with an icon and text, not colour alone). Show the streak at stake when `currentStreak > 0`: "🔥 5 at risk".
  - `"medium"` and `target.current: true` → a subtle "Watch" badge.
  - `"low"` → no badge. Optionally show a small green "On track" badge on the habit detail page only.
  - `target.current: false` (already done today, or not due today) → no badge on the dashboard, because today is safe.
  - `insufficient_data` → no badge.
- Hovering or tapping the badge opens a popover with the probability ("~90% chance of a miss today") and the `factors` list.
- On the **Dashboard**, add a "Streaks at risk today" strip above today's habits. It lists the high-risk forecasts with `target.current` and links each to its habit. Hide the strip when there are none.

### 5.2 Habit detail page: forecast panel

Add a "Forecast" card that uses the matching forecast from the same query:

- A big percentage: "**72%** likely to get done today", or "...on Fri, Oct 30" when `target.current` is false. Format `target.date` with the existing date helpers. For weekly habits say "this week" or "next week".
- The risk level chip and a confidence label ("Based on a lot of / some history").
- The factors list: an icon per `effect` plus the `detail` text.
- For `insufficient_data`: "Log this habit for a few more days to unlock forecasts."

### 5.3 New Predictions page (`/predictions`, add it to the sidebar)

1. **Header:** "Forecasts for {date}", with a short explainer: "Based on your recent logs, weekday patterns and today's check-in. These are tendencies, not certainties."
2. **Risk overview:** a card per habit in API order (riskiest first). Each card shows the title, the risk badge, a horizontal probability bar (completionProbability × 100), the target ("today" / "tomorrow" / weekday / "this week"), the current streak, and the top 2 factors, with a "Why?" expander for all of them. `insufficient_data` cards go in a muted "Still learning" group at the bottom.
3. **Check-in nudge:** if no forecast has a `checkin` factor and today's check-in is missing (reuse the existing `['checkin', today]` query, where a 404 means missing), show "Do today's check-in to sharpen today's forecasts" with a link to `/checkin`.
4. **"How accurate are these?"** section, from `/predictions/accuracy`:
   - A range selector for 30, 90 or 180 days. Compute `from` from the server's `date`, and never exceed 366 days.
   - A headline built from `byRiskLevel`: "When we said **high risk**, you missed **83%** of the time. When we said **low risk**, you missed **41%**." That's the most intuitive accuracy statement, so lead with it.
   - A **calibration chart** (Recharts): grouped bars per bucket with "predicted risk" (`averagePredictedRisk`) next to "actual miss rate" (`observedMissRate`). The closer the two bars, the better calibrated the model. Show `predictions` in the tooltip and skip buckets with 0 predictions.
   - A small stat line: "Accuracy score: Brier 0.22 (lower is better; guessing your average scores 0.25)". Add a ✓ "beats guessing" chip when `brierSkillScore > 0`.
   - The `evaluated === 0` empty state.
   - Put `modelVersion` in small muted text at the bottom.

### 5.4 Ranked recommendations feed (Insights page)

- The feed now uses `sort=rank` (the default), so render it **in the order received**. Don't re-sort on the client.
- Show a priority marker on each pending card: a "High priority" badge for `high`, and either a subtle dot or nothing for medium and low. The top item, if `high`, can render as a larger highlighted card.
- A "Why am I seeing this?" disclosure per card, built from `reason` plus readable `scoreFactors`. Only mention factors that differ from 1 by more than 0.05:
  - `habitRisk > 1` → "This habit's streak is at risk"
  - `feedback > 1` → "You usually find this kind of tip useful"; `feedback < 1` → "You often dismiss these, so it's ranked lower"
  - `freshness < 1` → "This has been waiting a while"
- A sort toggle, "Most relevant" (`rank`) or "Newest" (`recent`), stored in the URL query string.
- Accept and dismiss work as before: optimistic removal from the pending list, then invalidate. Mention in a toast after dismissing: "Got it. We'll show fewer tips like this."
- Give `streak_at_risk` cards a "Go to habit" button that links to `/habits/:habitId`.

---

## 6. React Query keys and invalidation

- New keys: `['streakRisk']` and `['predictionAccuracy', from, to]`. Update `['recommendations', status, sort]` to include `sort`.
- **Logging or unlogging a habit** (the existing optimistic toggle) changes the forecasts. Also invalidate `['streakRisk']` and `['recommendations']`.
- **Saving a check-in** can change today's forecasts (the check-in factor). Invalidate `['streakRisk']` and `['recommendations']`.
- **Creating, editing or archiving a habit**: invalidate `['streakRisk']`.
- `['predictionAccuracy', ...]` only needs a sensible `staleTime` (for example 10 minutes). Past outcomes rarely change.
- The `staleTime` for `['streakRisk']` should be short (for example 60 seconds), and it should refetch on window focus. "Today" can roll over while the tab is open.

---

## 7. Quality requirements

- Same bar as earlier phases: loading skeletons, an error state with Retry, empty states, no `any`, typed API layer, and responsive down to 360px.
- Accessibility: risk badges pair colour with an icon and text, the popover is keyboard-reachable, and the charts have a text summary.
- Percentages: `Math.round(x * 100) + '%'`. `null` → "—".
- Show only forecasts and copy that come from the API. Don't compute your own risk on the client.

## 8. Out of scope for Phase 3

Notifications or reminders for at-risk streaks, push or email, export, settings/timezone editing, any ML model UI, and storing forecast history. Those are Phase 4 or later.

## 9. Definition of done

Using `demo@lifeos.dev` / `Demo@12345` after a fresh `npm run seed:demo` on the backend, I can:

- see "At risk" badges on the dashboard and habits list, and open one to read the reasons
- see the "Streaks at risk today" strip
- tick a risky habit off and watch its badge disappear and its forecast move to the next day
- do today's check-in and see the forecasts refresh
- open `/predictions` and read the forecasts, the "When we said high risk…" headline and the calibration chart for 30, 90 and 180 days
- see the recommendations feed ordered by priority with "Why am I seeing this?" explanations, switch to "Newest", and dismiss a tip type a few times and see it rank lower afterwards
