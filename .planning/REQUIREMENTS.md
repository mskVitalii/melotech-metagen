# Requirements: Melotech Metagen

**Defined:** 2026-06-02
**Core Value:** Given a single music prompt, instantly generate all platform-optimized content needed to distribute a track

## v1 Requirements

### API

- [ ] **API-01**: User can POST /generate with `{ prompt, targetPlatforms }` and receive `{ requestId, results }` with platform-keyed outputs
- [ ] **API-02**: User can GET /history to retrieve a paginated list of previous generation requests with their results
- [ ] **API-03**: User can filter history by platform via GET /history?platform=spotify|tiktok|youtube
- [x] **API-04**: Server returns HTTP 429 with appropriate message when rate limit is exceeded

### Pipeline

- [ ] **PIPE-01**: System generates a canonical MusicConcept (title, genre, mood, BPM, instruments, description) from the user's prompt via the LLM provider
- [x] **PIPE-02**: LLM communication is abstracted behind a `LLMProvider` interface with `generateStructured<T>(prompt)` — platform processors never call vendor SDKs directly
- [ ] **PIPE-03**: Platform processors run in parallel using `Promise.allSettled` so one failure does not block other platforms
- [ ] **PIPE-04**: If a platform processor fails, the system reconstructs output from MusicConcept and includes `"fallback": true` in that platform's response; other platforms return normally
- [ ] **PIPE-05**: `GenerationService` orchestrates: receive request → generate MusicConcept → resolve processors → run in parallel → persist → return response

### Platform Processors

- [ ] **PROC-01**: `SpotifyProcessor` transforms MusicConcept into `{ title, genre, mood, bpm, instruments, description }`
- [ ] **PROC-02**: `TikTokProcessor` transforms MusicConcept into `{ hook, hashtags }` with exactly 3 hashtags drawn from established genre hashtag patterns
- [ ] **PROC-03**: `YouTubeProcessor` transforms MusicConcept into `{ title, description, tags }` with SEO-optimized content
- [ ] **PROC-04**: All processors implement the `PlatformProcessor` interface: `readonly platform: string; generate(concept: MusicConcept): Promise<PlatformResult>`
- [ ] **PROC-05**: `PlatformRegistry` resolves processors by platform name and provides the processor collection; adding a new platform requires only registering a new processor — no changes to existing code

### Caching

- [ ] **CACHE-01**: Successful generations are cached in Redis using `hash(prompt + sortedPlatforms)` as key
- [ ] **CACHE-02**: Identical requests (same prompt + same platforms in any order) return cached result without calling the LLM
- [ ] **CACHE-03**: Cache misses trigger normal LLM generation; cache hits skip LLM and return stored result

### Rate Limiting

- [x] **RATE-01**: Maximum 3 generation requests per minute per client IP; excess requests receive HTTP 429
- [x] **RATE-02**: Rate limiting is Redis-backed to survive server restarts; the Railway reverse-proxy `trust proxy` setting is configured so client IP is correctly extracted from `X-Forwarded-For`

### Persistence

- [ ] **PERSIST-01**: Each generation request is stored in `generation_requests` table with `id`, `prompt`, `created_at`
- [ ] **PERSIST-02**: Each platform result is stored as a separate row in `generation_results` table with `id`, `request_id`, `platform`, `payload_json`, `created_at`
- [ ] **PERSIST-03**: History endpoint queries `generation_results` with optional platform filter and returns paginated results

### Frontend

- [ ] **UI-01**: User can enter a music concept prompt in a text input field
- [ ] **UI-02**: User can select one or more target platforms (Spotify, TikTok, YouTube) via multi-select
- [ ] **UI-03**: User can trigger generation via a Generate button; loading state is shown during the request
- [ ] **UI-04**: Generated platform outputs are displayed side-by-side in a comparison view
- [ ] **UI-05**: User can view a history page listing previous generations with pagination
- [ ] **UI-06**: User can filter the history list by platform
- [ ] **UI-07**: User can open a previous generation to view its full platform output details
- [ ] **UI-08**: Frontend uses TanStack Query for data fetching and mutation; Next.js App Router with TypeScript

### Documentation

- [ ] **DOC-01**: `CLAUDE.md` documents AI tools used, which parts were AI-generated, which parts were manually reviewed, and AI's role in architecture/prompts/code

## v2 Requirements

### Additional Platforms

- **PLAT-01**: SoundCloudProcessor — audio-platform-specific metadata (track title, tags, description)
- **PLAT-02**: AppleMusicProcessor — editorial pitch, genre categories, release notes
- **PLAT-03**: InstagramProcessor — caption with hook + hashtags + story hook variant
- **PLAT-04**: AmazonMusicProcessor — album/track metadata fields

### Enhanced Generation

- **GEN-01**: Two-level genre field in MusicConcept (primary genre + subgenre) for Spotify algorithmic placement
- **GEN-02**: BPM range validation against genre-specific heuristics before returning response
- **GEN-03**: User can regenerate a single platform without re-running all processors

### Observability

- **OBS-01**: Generation latency tracked per platform processor
- **OBS-02**: LLM token usage tracked per request and surfaced in admin view

## Out of Scope

| Feature | Reason |
|---------|--------|
| User authentication / accounts | Single-user pipeline in v1; no auth required |
| Audio file generation | Text content only — no actual music production |
| Real-time collaboration | Single-user; multi-tenancy deferred |
| Per-user history isolation | No auth in v1 — history is global |
| Webhook / async job queue | Synchronous generation only in v1 |
| Mobile app | Web-first; mobile deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| API-01 | Phase 2 | Pending |
| API-02 | Phase 3 | Pending |
| API-03 | Phase 3 | Pending |
| API-04 | Phase 1 | Complete |
| PIPE-01 | Phase 2 | Pending |
| PIPE-02 | Phase 1 | Complete |
| PIPE-03 | Phase 2 | Pending |
| PIPE-04 | Phase 2 | Pending |
| PIPE-05 | Phase 2 | Pending |
| PROC-01 | Phase 2 | Pending |
| PROC-02 | Phase 2 | Pending |
| PROC-03 | Phase 2 | Pending |
| PROC-04 | Phase 2 | Pending |
| PROC-05 | Phase 2 | Pending |
| CACHE-01 | Phase 2 | Pending |
| CACHE-02 | Phase 2 | Pending |
| CACHE-03 | Phase 2 | Pending |
| RATE-01 | Phase 1 | Complete |
| RATE-02 | Phase 1 | Complete |
| PERSIST-01 | Phase 2 | Pending |
| PERSIST-02 | Phase 2 | Pending |
| PERSIST-03 | Phase 3 | Pending |
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 4 | Pending |
| UI-03 | Phase 4 | Pending |
| UI-04 | Phase 4 | Pending |
| UI-05 | Phase 4 | Pending |
| UI-06 | Phase 4 | Pending |
| UI-07 | Phase 4 | Pending |
| UI-08 | Phase 4 | Pending |
| DOC-01 | Phase 4 | Pending |

**Coverage:**

- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-02*
*Last updated: 2026-06-02 after roadmap creation (phase assignments confirmed)*
