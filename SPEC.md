# Melotech Content Distribution Pipeline

## Goal

Build a content distribution pipeline that accepts a raw AI music concept and generates platform-specific content for multiple music distribution channels.

The system should be designed as an extensible platform capable of supporting dozens of target platforms in the future rather than a hardcoded implementation for Spotify, TikTok, and YouTube.

---

# Technology Stack

## Frontend

- Next.js (App Router)
- TypeScript
- TanStack Query
- Tailwind CSS

## Backend

- NestJS
- TypeScript
- Prisma

## Infrastructure

- PostgreSQL
- Redis
- Railway deployment

---

# Functional Requirements

## Generate Content

### Request

POST /generate

```json
{
  "prompt": "Energetic synthwave track for night driving",
  "targetPlatforms": ["spotify", "tiktok", "youtube"]
}
```

### Response

```json
{
  "requestId": "uuid",
  "results": {
    "spotify": {},
    "tiktok": {},
    "youtube": {}
  }
}
```

---

## Platform Outputs

### Spotify

Generate:

- Title
- Genre
- Mood
- BPM
- Instruments
- Description

Example:

```json
{
  "title": "Neon Highway",
  "genre": "Synthwave",
  "mood": "Energetic",
  "bpm": 120,
  "instruments": ["Analog Synth", "Electronic Drums"],
  "description": "..."
}
```

### TikTok

Generate:

- Hook description
- 3 hashtags

Example:

```json
{
  "hook": "High-energy synthwave soundtrack for late-night drives",
  "hashtags": ["#synthwave", "#nightdrive", "#electronicmusic"]
}
```

### YouTube

Generate:

- SEO title
- Description
- Tags

Example:

```json
{
  "title": "...",
  "description": "...",
  "tags": ["..."]
}
```

---

## History

Retrieve previous generations.

Endpoints:

```http
GET /history
GET /history?platform=spotify
GET /history?platform=tiktok
GET /history?platform=youtube
```

---

## Rate Limiting

Limit generation requests to:

```text
3 requests per minute
```

If limit exceeded:

```http
429 Too Many Requests
```

---

# Core Architecture

## Canonical Generation Model

Instead of generating content independently for every platform, the system first generates a canonical music representation.

### Step 1

Prompt

↓

### Step 2

LLM generates a canonical MusicConcept

↓

### Step 3

Platform processors transform MusicConcept into platform-specific output

---

## MusicConcept

Example:

```json
{
  "title": "Neon Highway",
  "genre": "Synthwave",
  "mood": "Energetic",
  "bpm": 120,
  "instruments": ["Analog Synth", "Electronic Drums"],
  "description": "High-energy retro-futuristic driving soundtrack"
}
```

This object becomes the single source of truth for all platform outputs.

---

# SOLID-Oriented Platform Architecture

## Platform Processor Interface

```typescript
export interface PlatformProcessor {
  readonly platform: string;

  generate(concept: MusicConcept): Promise<PlatformResult>;
}
```

---

## Implementations

```typescript
SpotifyProcessor;
TikTokProcessor;
YouTubeProcessor;
```

Future examples:

```typescript
SoundCloudProcessor;
AppleMusicProcessor;
InstagramProcessor;
AmazonMusicProcessor;
```

No existing code should require modification when adding a new platform.

---

## Platform Registry

Responsible for resolving processors.

```typescript
PlatformRegistry;
```

Responsibilities:

- Register processors
- Resolve processor by platform name
- Provide processor collection

---

## Generation Service

Main orchestration layer.

Responsibilities:

- Receive requests
- Generate MusicConcept
- Resolve requested processors
- Run processors in parallel
- Persist results
- Return response

---

# LLM Layer

## LLM Provider Interface

```typescript
export interface LLMProvider {
  generateStructured<T>(prompt: string): Promise<T>;
}
```

---

## Initial Provider

```typescript
OpenAIProvider;
```

Possible future providers:

```typescript
AnthropicProvider;
GeminiProvider;
```

Platform processors should never communicate directly with a vendor SDK.

All LLM communication must go through the provider abstraction.

---

# Caching Strategy

## Phase 1 — Request Cache

Cache successful generations.

Cache key:

```text
hash(prompt + sortedPlatforms)
```

Example:

```text
Energetic synthwave track
spotify,youtube
```

If the same request arrives again:

- return cached result
- skip LLM call

---

## Phase 2 — Partial Degradation

Avoid returning unrelated content from previous prompts.

If one platform fails:

```text
Spotify -> success
TikTok -> failure
YouTube -> success
```

Return successful platforms normally.

Failed platform should be reconstructed from the canonical MusicConcept whenever possible.

Example:

```json
{
  "spotify": {},
  "youtube": {},
  "tiktok": {
    "fallback": true,
    ...
  }
}
```

This avoids serving content generated for another prompt.

---

# Persistence

## generation_requests

```text
id
prompt
created_at
```

---

## generation_results

```text
id
request_id
platform
payload_json
created_at
```

Benefits:

- Easy platform filtering
- Simpler analytics
- Cleaner schema
- Future scalability

---

# Frontend

## Generation Page

Components:

### Prompt Input

```text
Music concept input
```

### Platform Selector

```text
Spotify
TikTok
YouTube
```

Multi-select.

### Generate Button

Triggers generation.

---

## Comparison View

Display platform outputs side-by-side.

Example:

```text
+------------+
| Spotify    |
+------------+

+------------+
| TikTok     |
+------------+

+------------+
| YouTube    |
+------------+
```

---

## History View

Display previous generations.

Features:

- Pagination
- Platform filter
- Open generation details

---

# Error Handling

LLM failures should not crash the request.

Strategy:

1. Try generation.
2. If cache hit exists → return cached response.
3. If individual platform fails → reconstruct from MusicConcept.
4. Return partial result with fallback indicator.

---

# Deployment

Deploy on Railway:

Services:

- Next.js
- NestJS
- PostgreSQL
- Redis

Environment variables:

```text
OPENAI_API_KEY
DATABASE_URL
REDIS_URL
```

---

# CLAUDE.md

Include:

- AI tools used
- How AI assisted development
- Which parts were generated with AI
- Which parts were manually reviewed and modified

Example topics:

- Architecture brainstorming
- Prisma schema generation
- DTO generation
- React component scaffolding
- Prompt design
- Refactoring assistance

All generated code reviewed manually before submission.
