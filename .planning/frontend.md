# Frontend Documentation

## Goal

The frontend is a Next.js App Router application that lets users generate platform-specific music marketing content and browse generation history.

## Route Map

- `/` — prompt form, platform multi-select, generate action, comparison view
- `/history` — paginated history list with platform filter
- `/history/[id]` — detailed view for a previous generation

## Data Flow

The frontend uses TanStack Query for all server state.

- `POST /api/generate` is called from the client through a same-origin Next.js proxy
- `GET /api/history` is called the same way for the list and detail screens
- The browser never talks directly to the backend when the app is running behind Docker; Next.js proxies requests to the backend container via `BACKEND_INTERNAL_URL`

## Docker Behavior

When the frontend runs in Docker Compose:

- the frontend container listens on port `3000`
- the backend container listens on port `3001`
- the frontend proxies `/api/*` to the backend service name `http://backend:3001`
- the browser only needs to know the frontend origin, so client code stays environment-agnostic

## UI Architecture

- `app/layout.tsx` defines global shell navigation
- `app/providers.tsx` owns the TanStack Query client
- `app/page.tsx` renders the generator UX and result cards
- `app/history/page.tsx` renders paginated history with platform filtering
- `app/history/[id]/page.tsx` renders a full record detail view

## Shared Types

- `lib/types.ts` mirrors backend response shapes for generation and history
- `lib/api.ts` contains the fetch helpers that all pages use

## Operational Notes

- Frontend linting uses a local ESLint flat config in `frontend/eslint.config.mjs`
- Formatting uses a local Prettier config in `frontend/.prettierrc`
- The repo-level Husky hook runs backend and frontend lint plus format checks before commits
