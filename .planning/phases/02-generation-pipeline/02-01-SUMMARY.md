---
phase: 02-generation-pipeline
plan: "01"
subsystem: generation/processors
tags: [platform-processor, registry, spotify, tiktok, youtube, ocp, tdd]
dependency_graph:
  requires:
    - backend/src/generation/types/music-concept.schema.ts
  provides:
    - backend/src/generation/tokens.ts
    - backend/src/generation/types/platform-result.types.ts
    - backend/src/generation/processors/platform-processor.interface.ts
    - backend/src/generation/processors/spotify.processor.ts
    - backend/src/generation/processors/tiktok.processor.ts
    - backend/src/generation/processors/youtube.processor.ts
    - backend/src/generation/processors/platform-registry.ts
  affects:
    - backend/package.json
tech_stack:
  added: []
  patterns:
    - NestJS Symbol injection token (PLATFORM_PROCESSOR)
    - Multi-provider injection with @Inject + useExisting + multi:true
    - Pure-transform processor pattern (no LLM, no I/O)
    - TDD RED/GREEN per processor and registry
key_files:
  created:
    - backend/src/generation/tokens.ts
    - backend/src/generation/types/platform-result.types.ts
    - backend/src/generation/processors/platform-processor.interface.ts
    - backend/src/generation/processors/spotify.processor.ts
    - backend/src/generation/processors/spotify.processor.spec.ts
    - backend/src/generation/processors/tiktok.processor.ts
    - backend/src/generation/processors/tiktok.processor.spec.ts
    - backend/src/generation/processors/youtube.processor.ts
    - backend/src/generation/processors/youtube.processor.spec.ts
    - backend/src/generation/processors/platform-registry.ts
    - backend/src/generation/processors/platform-registry.spec.ts
  modified:
    - backend/package.json
decisions:
  - "buildFallback is an instance method on the interface (TypeScript interfaces cannot declare static); 'static' in D-07 means no dependence on instance state / never throws"
  - "TikTok hashtags derived from genre-slug + mood-slug + '#music' (3 elements exactly per D-05)"
  - "YouTube SEO title format: 'title | genre mood'; tags = [...instruments, genre, mood] per D-06"
  - "PlatformRegistry imports nothing from concrete processor classes (PROC-05 OCP)"
  - "npm test scripts updated to use --experimental-vm-modules for ESM compatibility (pre-existing infra gap)"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-02T20:47:44Z"
  tasks_completed: 3
  files_created: 11
  files_modified: 1
requirements: [PROC-01, PROC-02, PROC-03, PROC-04, PROC-05]
---

# Phase 2 Plan 01: Platform Processor Layer Summary

**One-liner:** Symbol-tokened PLATFORM_PROCESSOR injection with three pure-transform processors (Spotify/TikTok/YouTube) and a Map-based PlatformRegistry — zero concrete-processor imports in registry (OCP).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Define contracts: PLATFORM_PROCESSOR token, output types, interface | b01425e | tokens.ts, platform-result.types.ts, platform-processor.interface.ts |
| 2 (RED) | Add failing specs for SpotifyProcessor, TikTokProcessor, YouTubeProcessor | 69854fd | spotify.processor.spec.ts, tiktok.processor.spec.ts, youtube.processor.spec.ts |
| 2 (GREEN) | Implement three processors + fix ESM test setup | d283eb5 | spotify.processor.ts, tiktok.processor.ts, youtube.processor.ts, package.json |
| 3 (RED) | Add failing spec for PlatformRegistry | bdd6abd | platform-registry.spec.ts |
| 3 (GREEN) | Implement PlatformRegistry | 3c7e2df | platform-registry.ts |

## Verification Results

- `tsc --noEmit`: zero errors in all plan files
- `npx jest src/generation/processors`: 29 tests across 4 suites, all pass
- `npm run build`: exits 0
- OCP check: `grep -nE "import.*(Spotify|TikTok|YouTube)Processor" platform-registry.ts` → no matches

## Decisions Made

1. **buildFallback as instance method**: TypeScript interfaces cannot declare `static`. The interface declares `buildFallback` as an instance method. Each processor implements it as a deterministic, never-throwing transform of the concept — satisfying D-07's intent without TypeScript `static`.

2. **TikTok hook = concept.description**: D-05 says hook is "derived from concept description." Using `description` directly is the pure-transform interpretation (no LLM call in processors).

3. **YouTube tags = [...instruments, genre, mood]**: Exact implementation per D-06.

4. **ESM test infrastructure fix**: The project's Jest configuration requires `--experimental-vm-modules` but the `npm test` scripts used bare `jest`. Added `node --experimental-vm-modules node_modules/.bin/jest` to `test`, `test:watch`, and `test:cov` scripts. Pre-existing spec files (openai.provider.spec.ts etc.) have independent ESM issues not caused by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Fixed npm test scripts for ESM compatibility**
- **Found during:** Task 2 GREEN phase (tests failed with `SyntaxError: Cannot use import statement outside a module`)
- **Issue:** All existing and new spec files require `--experimental-vm-modules` Node flag for ESM Jest execution. The `npm test` script used bare `jest` which doesn't set this flag.
- **Fix:** Updated `test`, `test:watch`, and `test:cov` scripts in `backend/package.json` to use `node --experimental-vm-modules node_modules/.bin/jest`
- **Files modified:** `backend/package.json`
- **Commit:** d283eb5 (bundled with GREEN implementation)

## TDD Gate Compliance

- RED gate (test commits): 69854fd (processor specs), bdd6abd (registry spec)
- GREEN gate (feat commits): d283eb5 (processors), 3c7e2df (registry)
- All RED commits preceded their corresponding GREEN commits — TDD gates compliant.

## Known Stubs

None — all three processors transform real MusicConcept fields. No placeholder data, no TODO values.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. All files are pure transforms and a Map-based registry. Threat mitigations from plan's threat model are implemented:
- T-02-01: TikTok slug strips non-alphanumeric via `replace(/[^a-z0-9]/g, '')` — confirmed in TikTokProcessor
- T-02-02: buildFallback non-throwing twin confirmed by unit tests
- T-02-03: Registry silently skips unknown names confirmed by unit test (`getProcessors(['unknown']) → []`)

## Self-Check: PASSED

- [x] tokens.ts exists: `/Users/mskkote/Projects/melotech-metagen/backend/src/generation/tokens.ts`
- [x] platform-result.types.ts exists: confirmed
- [x] platform-processor.interface.ts exists: confirmed
- [x] spotify.processor.ts exists: confirmed
- [x] tiktok.processor.ts exists: confirmed
- [x] youtube.processor.ts exists: confirmed
- [x] platform-registry.ts exists: confirmed
- [x] Commits b01425e, 69854fd, d283eb5, bdd6abd, 3c7e2df all exist in git log
