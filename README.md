# CCF Eastwood Admin App

A church management web application for administrators. Covers members, small groups, ministries, events, and volunteers — with a weighted matching algorithm for automated small group and breakout group assignments.

## Tech Stack

- **Framework** — Next.js 16 (App Router) + TypeScript
- **Database** — PostgreSQL + Prisma 7
- **Auth** — Auth.js v5 (NextAuth)
- **UI** — Tailwind CSS v4 + shadcn/ui
- **Validation** — Zod 4
- **Package manager** — pnpm

## Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL instance (local or cloud)

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy `.env` and fill in your values:

```bash
cp .env .env.local
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Random secret for Auth.js (generate with `/generate-secret`) |
| `AUTH_URL` | Base URL of the app (e.g. `http://localhost:3000`) |

### 3. Set up the database

Apply the schema and generate the Prisma client:

```bash
pnpm prisma migrate dev --name init
```

### 4. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  (auth)/           # Login pages
  (dashboard)/      # Protected admin area
    members/
    small-groups/
    ministries/
    events/
    volunteers/
    settings/
      life-stages/
      matching/
  api/auth/         # Auth.js route handler
lib/
  db.ts             # Prisma client singleton
  auth.ts           # Auth.js config
  matching/         # Weighted group-matching algorithm
prisma/
  schema.prisma
```

## Claude Code Skills

Project-specific slash commands available in Claude Code:

| Command | Description |
|---|---|
| `/db-migrate` | Run `prisma migrate dev` with a name |
| `/db-push` | Push schema to DB without a migration file |
| `/db-studio` | Open Prisma Studio at localhost:5555 |
| `/generate-secret` | Generate a secure `AUTH_SECRET` value |

## Domain Overview

| Domain | Description |
|---|---|
| **Members** | Person records with matching profile data |
| **Small Groups** | Self-referential network of member-led groups |
| **Ministries** | Sub-operations scoped to a life stage |
| **Events** | Church events with registration and breakout groups |
| **Volunteers** | Members serving in ministries or events via committees and roles |

See [CLAUDE.md](CLAUDE.md) for the full domain model and development conventions.
