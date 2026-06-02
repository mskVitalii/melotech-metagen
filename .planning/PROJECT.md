# Melotech Metagen

## What This Is

A content distribution pipeline that accepts a raw AI music concept (text prompt) and generates platform-specific marketing content for multiple music distribution channels simultaneously. The system uses an LLM to first produce a canonical MusicConcept, then transforms it into tailored outputs for each target platform (Spotify, TikTok, YouTube) — designed as an extensible platform supporting dozens of channels without modifying existing code.

## Core Value

Given a single music prompt, instantly generate all platform-optimized content needed to distribute a track — so artists never have to rewrite the same concept for each platform.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can submit a music prompt and select target platforms to generate content
- [ ] System generates a canonical MusicConcept (title, genre, mood, BPM, instruments, description) via LLM
- [ ] SpotifyProcessor produces title, genre, mood, BPM, instruments, description from MusicConcept
- [ ] TikTokProcessor produces hook and 3 hashtags from MusicConcept
- [ ] YouTubeProcessor produces SEO title, description, and tags from MusicConcept
- [ ] PlatformRegistry resolves processors by name; adding a new platform requires no existing code changes
- [ ] Generation results are persisted to PostgreSQL (generation_requests + generation_results tables)
- [ ] GET /history endpoint returns previous generations with optional platform filter and pagination
- [ ] Rate limiting: max 3 requests/minute per client; returns 429 on exceeded
- [ ] Identical requests (same prompt + sorted platforms) return cached result from Redis without re-calling LLM
- [ ] If one platform processor fails, remaining platforms return normally and the failed platform is reconstructed from MusicConcept (fallback indicator in response)
- [ ] Frontend: prompt input, multi-select platform selector, generate button
- [ ] Frontend: side-by-side comparison view of platform outputs
- [ ] Frontend: history view with pagination and platform filter

### Out of Scope

- SoundCloud, Apple Music, Instagram, Amazon Music processors — extensible architecture supports future platforms but none are in v1
- Real-time collaboration or multi-user sessions — single-user pipeline
- Audio file generation — text content only, no actual music production
- OAuth / multi-user auth — no authentication system in v1

## Context

- Stack is prescribed: Next.js (App Router) + TypeScript + TanStack Query + Tailwind CSS on frontend; NestJS + TypeScript + Prisma on backend; PostgreSQL + Redis for persistence/caching; Railway for deployment
- LLM layer is abstracted behind `LLMProvider` interface — OpenAI is the initial implementation; Anthropic and Gemini are future options
- Platform processors implement a `PlatformProcessor` interface; new platforms register themselves without touching existing code (open/closed principle)
- Caching strategy is two-phase: Phase 1 = full request cache (hash of prompt + sorted platforms); Phase 2 = partial degradation (reconstruct failed platform from canonical MusicConcept)
- CLAUDE.md is a deliverable — must document AI tool usage, which parts were AI-generated, and which were manually reviewed

## Constraints

- **Tech Stack**: Next.js App Router, NestJS, Prisma, PostgreSQL, Redis — prescribed, not negotiable
- **LLM Vendor**: OpenAI for v1; all LLM calls go through the `LLMProvider` abstraction
- **Deployment**: Railway (Next.js + NestJS + PostgreSQL + Redis as separate services)
- **Rate Limit**: 3 requests/minute enforced at API level
- **Architecture**: SOLID-oriented platform processor design; no direct vendor SDK calls from processors

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Canonical MusicConcept intermediary | Single LLM call generates source of truth; processors transform deterministically — cheaper and more consistent than per-platform LLM calls | — Pending |
| PlatformRegistry pattern | Enables open/closed extension — new platforms register without modifying generation service | — Pending |
| Two separate DB tables (generation_requests + generation_results) | Easy platform-level filtering, simpler analytics, cleaner schema | — Pending |
| Redis request cache keyed by hash(prompt + sortedPlatforms) | Avoid redundant LLM calls for identical requests | — Pending |
| Fallback reconstruction from MusicConcept on platform failure | Avoids serving stale content from a different prompt; partial results preferred over total failure | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-02 after initialization*
