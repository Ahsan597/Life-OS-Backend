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

🚧 Early development — currently in Phase 0 (project setup).
