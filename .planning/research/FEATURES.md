# Feature Landscape

**Domain:** AI music content generation and distribution pipeline
**Researched:** 2026-06-02
**Confidence:** MEDIUM — platform documentation inaccessible during research; findings based on well-established platform behaviors and music industry knowledge. Flag for verification against current platform specs before implementation.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or broken.

### Platform-Specific Fields

| Feature | Platform | Why Expected | Complexity | Notes |
|---------|----------|--------------|------------|-------|
| Track title (clean, formatted) | Spotify | First required field on every distributor | Low | No ALL CAPS, no "(Official)" suffix — distributors reject this |
| Primary genre + subgenre | Spotify | Powers algorithmic playlisting and Discover Weekly | Low | Two-level taxonomy: "Electronic > Ambient", not just "Electronic" |
| Mood/energy tags | Spotify | Feeds "Mood" playlists and editorial pitching | Low | Spotify recognizes ~20 canonical moods; free-form risks mismatch |
| BPM (tempo) | Spotify | Used by DJ tools, running apps, playlist curators | Low | Must be integer; wildly inaccurate BPM is a trust destroyer |
| Instrumentation list | Spotify | Powers "Instrumental" filter and editorial categorization | Low | Distinguish acoustic vs electronic variants |
| Track description (release notes) | Spotify | Used in editorial pitching UI | Medium | Distributors surface this to Spotify editorial team |
| Hook text (first 3 seconds) | TikTok | TikTok sound adoption is driven entirely by opening hook | Medium | Hook = the lyric/phrase that gets lip-synced or screen-captioned |
| Hashtags (3-5 relevant) | TikTok | Primary discovery mechanism on TikTok | Low | Mix of: genre tag + trend tag + niche tag; not all genre |
| Caption/post copy | TikTok | Creator who posts original sound needs starting caption | Medium | Short, punchy, often a question or challenge prompt |
| SEO title (YouTube) | YouTube | Direct impact on search ranking | Medium | Target keyword near front; under 60 chars; no clickbait that triggers demotion |
| Description with keywords | YouTube | Second largest search engine; description is indexed | High | First 125 chars shown in preview; keywords without stuffing |
| Tags list (8-15 tags) | YouTube | Supplements title/description for search | Low | Mix of broad + specific; first tag = primary keyword |
| Timestamp chapters (optional) | YouTube | Increases watch time signal; shown in SERP | High | Not always applicable for music but strongly preferred for long-form |

### Core Pipeline Behaviors

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single prompt → all platforms | Core value prop; without this it's just a template tool | High | Requires canonical MusicConcept intermediary |
| Consistent identity across outputs | "Pop artist vs EDM producer" framing must not contradict itself | Medium | All platform outputs derive from same MusicConcept |
| Partial failure recovery | Users lose trust immediately if one bad platform kills everything | Medium | Return partial results + failure indicator, not HTTP 500 |
| Request history with replay | Users iterate on prompts; need to compare versions | Medium | Pagination + platform filter are minimum |
| Result caching (identical prompts) | Repeat users discover identical results instantly; LLM cost | Medium | Cache key = hash(prompt + sorted platforms) |
| Rate limiting with clear error | Without this, a single user can exhaust LLM budget | Low | 429 with Retry-After header; not just a generic error |
| Copy-to-clipboard per field | Users paste outputs into platforms; any friction here fails UX | Low | Per-field copy buttons, not copy-all |
| Character count validation | Each platform has hard limits (YouTube title: 100, TikTok caption: 2200) | Low | Display limits inline; warn before they overflow |

### Quality Bars for Generated Content

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Genre specificity (not just "Rock") | Vague genre loses playlist placement and editorial pitching | Medium | Subgenre matters: "Indie Folk" vs "Country" are different ecosystems |
| BPM in plausible range for genre | 60 BPM "Drum & Bass" is immediately wrong; users lose trust | Low | Genre-to-BPM range validation; flag outliers |
| No keyword stuffing in YouTube SEO | YouTube actively demotes stuffed descriptions | Medium | Density check; 2-3% max per keyword |
| Hashtags that actually exist | Made-up hashtags drive zero traffic | Medium | Common hashtag patterns by genre; avoid hyper-niche invented tags |
| Mood-genre coherence | "Angry" + "Lullaby" + "Calm" is incoherent | Medium | LLM prompt must enforce internal consistency |

---

## Differentiators

Features that set this product apart. Not expected, but valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Platform-specific tone adaptation | TikTok copy that sounds like TikTok, not a press release | Medium | Each processor has platform-appropriate language model prompt tuning |
| Genre-informed BPM suggestion | "Dark Trap" at 140 BPM is more credible than 120 | Medium | Genre→BPM heuristics embedded in MusicConcept generation |
| Trend-aware hashtag generation | TikTok hashtags that reflect current sound trends, not evergreen only | High | Requires either trend data feed or prompt injection with current trends |
| Hook virality scoring (TikTok) | Rate generated hooks on lip-sync potential, challenge fit | High | Requires a second LLM pass or fine-tuned model |
| YouTube A/B title variants | Generate 2-3 title options ranked by estimated CTR | Medium | Cheap to generate; high value for iterating |
| Spotify editorial pitch template | Structured pitch paragraph that Spotify's editorial team expects | Medium | Distributors like DistroKid have this; stand out with better quality |
| Instrument-to-genre consistency check | Flag when instruments don't match declared genre | Medium | "Sitar + Electronic Trap" needs a flag or a subgenre to justify it |
| Output diff on re-generation | Show what changed between two generations of same prompt | High | Useful for iterative refinement workflows |
| Platform preview simulation | Show how title+description looks in Spotify/YouTube/TikTok UI | High | CSS mockups; high perceived quality, moderate build effort |
| Exportable metadata package | Download as JSON or CSV for bulk distributor upload | Low | Very low effort, high value for power users |
| Multi-language output | Generate metadata in Spanish, German, etc. for regional releases | High | Language detection + per-language platform norms differ |

---

## Anti-Features

Features to explicitly NOT build in v1 (and why).

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Per-platform LLM calls (one call per platform) | 3x cost, 3x latency, inconsistent identity across platforms | Single canonical MusicConcept + deterministic transformation per processor |
| "Generate everything at once" with no platform selection | Forces users to pay LLM cost for platforms they don't need | Multi-select with sane defaults; let users choose |
| Freeform genre input with no normalization | "indie rock vibes" is not a Spotify genre; creates useless metadata | Taxonomy-aware genre resolution or normalization step |
| Emojis in SEO title/description by default | YouTube title with emojis is not wrong per se, but signals low quality; SEO tools penalize | Allow as option; off by default |
| Keyword injection into Spotify description | Spotify description is editorial, not SEO copy | Keep Spotify description narrative; SEO keywords belong in YouTube only |
| Hashtag count > 10 on TikTok | TikTok's algorithm deprioritizes posts with hashtag spam | Hard cap at 5-7; quality over quantity |
| Platform outputs that are identical copies | If Spotify description = YouTube description, there was no transformation | Enforce platform-specific tone/format constraints per processor |
| Auto-submit / direct API publish to platforms | Auth complexity, legal liability, user trust issues | Generate content for copy-paste; never touch the platform API on user's behalf |
| Real-time generation streaming (token-by-token) | Streaming a metadata object mid-generation is confusing (partial JSON) | Generate complete, then display; progress indicator is sufficient |
| Audio analysis from uploaded files | Out of scope; adds massive surface area (audio ML pipeline) | Text-only; BPM and instrumentation come from LLM inference on the prompt |
| Collaborative editing / multi-user sessions | Adds auth, CRDT complexity, scope explosion | Single-user pipeline; no auth in v1 |
| "Optimize for algorithm" dark patterns | Clickbait titles, fake popularity signals, keyword stuffing | Enforce quality constraints in prompts; document this as a design principle |

---

## Feature Dependencies

```
Prompt Input
  → MusicConcept Generation (single LLM call)
      → SpotifyProcessor (title, genre, mood, BPM, instruments, description)
      → TikTokProcessor (hook, hashtags, caption)
      → YouTubeProcessor (SEO title, description, tags)
          → Character Count Validation (per field, per platform)
          → Copy-to-Clipboard (per field)

MusicConcept Generation
  → Genre Normalization (must happen before BPM validation)
  → BPM Range Validation (depends on normalized genre)
  → Mood-Genre Coherence Check (depends on both)

Request Caching (Redis)
  → History Persistence (PostgreSQL)
      → History View (frontend)
          → Platform Filter (depends on per-platform result storage)
          → Pagination (depends on history persistence)

Partial Failure Recovery
  → MusicConcept (fallback source for reconstruction)
  → Failure Indicator in Response (depends on knowing which processors failed)

Rate Limiting
  → Client Identification (IP-based in v1; no auth)
  → 429 Response with Retry-After header
```

---

## MVP Recommendation

### Must-Have (v1 — build these)

1. **Canonical MusicConcept** — title, genre (with subgenre), mood, BPM (integer), instruments list, description. This is the foundation everything else derives from.
2. **Spotify processor** — title, genre tags, mood tags, BPM, instruments, editorial description. Enforce: no keyword stuffing, narrative tone, valid genre taxonomy.
3. **TikTok processor** — hook (single memorable phrase), 3-5 hashtags (genre + trend + niche mix), short caption/post copy.
4. **YouTube processor** — SEO title (keyword-first, under 60 chars), keyword-rich description (first 125 chars critical), 8-12 tags.
5. **Character count validation** — inline, per field, per platform. Overflow warning before hard limits.
6. **Copy-to-clipboard per field** — zero-friction transfer to platforms.
7. **Partial failure recovery** — reconstruct failed platform from MusicConcept; return `fallback: true` indicator.
8. **Caching** — hash(prompt + sorted platforms) → Redis; no re-LLM-call for identical requests.
9. **Rate limiting** — 3 req/min; 429 with Retry-After.
10. **History view** — paginated, platform-filterable, shows all previous generations.

### Defer (post-v1)

| Deferred Feature | Reason |
|-----------------|--------|
| Trend-aware hashtags | Requires live data feed or prompt injection infrastructure |
| YouTube A/B title variants | Nice-to-have; low trust-cost to defer |
| Hook virality scoring | Requires second LLM pass; not core pipeline |
| Platform preview simulation | High visual effort; low functional value in v1 |
| Exportable metadata package | Easy win but not blocking MVP validation |
| Multi-language output | Scope expansion; validate English first |
| Output diff on re-generation | Requires version diffing; secondary workflow |

---

## Platform Field Reference

### Spotify — What Actually Matters

| Field | Required | Notes | Confidence |
|-------|----------|-------|------------|
| Track title | Yes | Clean title; no "(feat.)" unless actual feature | HIGH |
| Primary artist | Yes | Out of scope (no auth) | HIGH |
| Genre (primary) | Yes | Must match Spotify genre taxonomy | HIGH |
| Subgenre | Strongly recommended | Powers Discover Weekly and Radio | HIGH |
| Mood tags | Recommended | ~20 canonical values: Happy, Sad, Aggressive, Calm, etc. | MEDIUM |
| BPM | Recommended | Integer; used by DJ tools and curators | HIGH |
| Key / time signature | Optional | Most generators skip this; adds credibility | MEDIUM |
| Instruments | Optional | Feeds "Instrumental" filter and editorial categorization | MEDIUM |
| Release description | Optional | Only visible to Spotify editorial pitching system (via distributor) | HIGH |
| ISRC | Required for distribution | Out of scope (no distribution API) | HIGH |

### TikTok — What Actually Matters

| Field | Required | Notes | Confidence |
|-------|----------|-------|------------|
| Sound hook text | Critical | The phrase that makes a sound "viral-able" | HIGH |
| Hashtags (3-7) | Critical | Discovery mechanism; mix genre + trend + niche | HIGH |
| Caption/post copy | Recommended | Starting point for creators adopting the sound | MEDIUM |
| Sound name/title | Required | Displayed when sound is used | HIGH |
| Artist name tag | Required | Out of scope | HIGH |
| Challenge prompt | Differentiator | "Try this with..." framing boosts adoption | MEDIUM |
| Duet/stitch enablement | Platform setting | Out of scope (not metadata generation) | HIGH |

### YouTube — What Actually Matters

| Field | Required | Notes | Confidence |
|-------|----------|-------|------------|
| Video title | Required | Keyword near front; 60 chars optimal; 100 char hard limit | HIGH |
| Description (first 125 chars) | Critical | Shown in search preview; keyword density matters here | HIGH |
| Description (full body) | Recommended | Timestamps, links, expanded keywords | HIGH |
| Tags | Recommended | First tag = primary keyword; 8-12 total | HIGH |
| Category | Recommended | "Music" category; out of scope to auto-set | MEDIUM |
| Thumbnails | Not applicable | Out of scope (image generation) | HIGH |
| End screen / cards | Not applicable | Out of scope | HIGH |
| Chapters | Optional | Only for tracks >10 min; skip for standard releases | MEDIUM |

---

## What Tools Commonly Get Wrong

(Based on patterns from DistroKid, TuneCore, Amuse, and AI-assisted metadata generators as of knowledge cutoff Aug 2025)

1. **Genre flattening** — tools generate "Pop" when the subgenre ("Indie Synth-Pop") is what actually matters for algorithmic placement. The top-level genre is table stakes; the subgenre is where differentiation happens.

2. **BPM hallucination** — LLMs without genre-BPM grounding produce implausible values (105 BPM for DnB, 80 BPM for house). Must encode genre-to-BPM range heuristics in the prompt or as a post-generation validation layer.

3. **Copy-pasting the same description across platforms** — Spotify description is editorial narrative; YouTube description is SEO copy; TikTok caption is a call-to-action prompt. Tools that produce one text and use it everywhere fail all three platforms.

4. **Hashtag invention** — generating hashtags that don't exist on TikTok (e.g., `#darkambientvibesmix`) produces zero discovery. Common genre hashtags have known follower counts; custom ones do not.

5. **Keyword stuffing in YouTube descriptions** — YouTube's algorithm demotes descriptions with unnatural keyword repetition. The first 125 characters matter most; keyword density elsewhere is less critical.

6. **Ignoring mood coherence** — a tool that generates "Angry, Sad, Joyful" as mood tags simultaneously is incoherent. Mood tags should represent a primary emotional tone, not a laundry list.

7. **Overly formal language for TikTok** — TikTok copy written as press release ("This track features a dynamic blend of...") performs worse than colloquial, punchy hooks ("This drop will break your neck").

8. **No fallback for partial failure** — most simple tools fail entirely if any generation step errors. Partial result with reconstruction from canonical data is both more resilient and more user-friendly.

---

## Sources

**Confidence note:** WebSearch and WebFetch were denied during this research session. All findings are based on training data (knowledge cutoff August 2025) which includes:
- Spotify for Artists documentation and editorial pitching guidelines
- YouTube Creator Academy SEO documentation
- TikTok Creator Marketplace content guidelines
- Industry-standard music distribution platforms (DistroKid, TuneCore, CD Baby) best practice documentation
- Common patterns from AI music metadata generation tools (Landr, Soundraw, Beatoven.ai)

Confidence levels per area:
- Spotify field requirements: HIGH (well-documented, stable)
- TikTok hook/hashtag patterns: MEDIUM (evolves quickly; verify against current TikTok Creator docs)
- YouTube SEO fields: HIGH (well-documented, stable)
- AI tool anti-patterns: MEDIUM (based on observed tool behaviors; not sourced from primary docs)
- BPM genre ranges: MEDIUM (industry convention, not official specification)
