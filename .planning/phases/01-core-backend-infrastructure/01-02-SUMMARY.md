---
phase: 01-core-backend-infrastructure
plan: 02
subsystem: llm-integration
tags: [nestjs, openai, zod, structured-output, llm-provider, music-concept]
dependency_graph:
  requires:
    - backend/src/config/env.validation.ts
    - backend/src/app.module.ts
    - PrismaModule
    - ConfigModule (global, from 01-01)
  provides:
    - backend/src/generation/types/music-concept.schema.ts
    - backend/src/llm/llm-provider.abstract.ts
    - backend/src/llm/openai.provider.ts
    - backend/src/llm/llm.module.ts
    - MusicConceptSchema
    - MusicConcept (type)
    - LLMProvider (abstract class / DI token)
    - OpenAIProvider
    - LLMModule
  affects:
    - backend/src/app.module.ts
    - backend/package.json
tech_stack:
  added:
    - "openai@6.41.0 — chat.completions.parse + zodResponseFormat"
  patterns:
    - "Abstract class as NestJS DI token (D-04)"
    - "zodResponseFormat + chat.completions.parse — never json_object (D-05)"
    - "Refusal guard: message.refusal -> 400, null parsed -> 500 (D-07)"
    - "OpenAI client timeout: 30_000, maxRetries: 2 (D-08)"
    - "MusicConceptSchema as single source of truth, shared types module (D-09)"
    - "TDD: RED (failing spec) committed before GREEN (implementation)"
key_files:
  created:
    - backend/src/generation/types/music-concept.schema.ts
    - backend/src/generation/types/music-concept.schema.spec.ts
    - backend/src/llm/llm-provider.abstract.ts
    - backend/src/llm/openai.provider.ts
    - backend/src/llm/openai.provider.spec.ts
    - backend/src/llm/llm.module.ts
  modified:
    - backend/src/app.module.ts
    - backend/package.json
decisions:
  - "D-04: LLMProvider is abstract class (not interface) — survives TS compilation as NestJS DI token"
  - "D-05: zodResponseFormat + chat.completions.parse; json_object mode explicitly excluded"
  - "D-06: OPENAI_MODEL env var; default 'gpt-5.4' per project critical_context"
  - "D-07: Refusal guard — message.refusal -> BadRequestException (400); null parsed -> InternalServerErrorException (500)"
  - "D-08: OpenAI client constructed with timeout: 30_000, maxRetries: 2"
  - "D-09: MusicConceptSchema in src/generation/types/; genre/mood are plain strings (not enums)"
metrics:
  duration: ~50 minutes
  completed_date: "2026-06-02"
  tasks_completed: 2
  tasks_total: 2
  tasks_blocked: 0
---

# Phase 01 Plan 02: LLM Integration Layer Summary

**One-liner:** OpenAI structured-output integration with LLMProvider abstract class, refusal guard (400), and canonical MusicConceptSchema — all wired into NestJS DI via LLMModule.

## What Was Built

### Task 1: MusicConcept schema + LLMProvider abstract class (TDD)

**RED:** `backend/src/generation/types/music-concept.schema.spec.ts` — 6 tests covering valid parse, bpm < 40 rejection, bpm > 250 rejection, boundary values (40 and 250), non-integer bpm, and missing required fields.

**GREEN:**
- Created `backend/src/generation/types/music-concept.schema.ts` per D-09:
  - `MusicConceptSchema = z.object({ title, genre, mood, bpm: z.number().int().min(40).max(250), instruments, description })`
  - `export type MusicConcept = z.infer<typeof MusicConceptSchema>` 
  - Genre and mood are plain strings (not enums) — avoids hallucination from constrained sets
- Created `backend/src/llm/llm-provider.abstract.ts` per D-04:
  - `export abstract class LLMProvider { abstract generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T>; }`
  - Abstract class (NOT interface) — survives TypeScript compilation as a NestJS DI token
- Installed `openai@6.41.0`

**Commits:** `c80272d` (RED), `27c2d67` (GREEN)

### Task 2: OpenAIProvider + LLMModule wiring (TDD)

**RED:** `backend/src/llm/openai.provider.spec.ts` — 5 tests covering: success returns parsed, refusal -> BadRequestException (400), null parsed -> InternalServerErrorException (500), empty choices -> InternalServerErrorException, and verifying chat.completions.parse is called with zodResponseFormat.

**GREEN:**
- Created `backend/src/llm/openai.provider.ts`:
  - `@Injectable() class OpenAIProvider extends LLMProvider`
  - Constructor injects `ConfigService`, builds `new OpenAI({ apiKey, timeout: 30_000, maxRetries: 2 })` (D-08)
  - `generateStructured<T>` calls `this.openai.chat.completions.parse()` with `zodResponseFormat(schema, 'structured_output')` (D-05)
  - Refusal guard: `message?.refusal` -> `BadRequestException` (400) with safe message (D-07)
  - Null parsed guard: `!message?.parsed` -> `InternalServerErrorException` (500) — distinct path
  - Returns `message.parsed as T` — no non-null assertion
  - OPENAI_MODEL defaults to `'gpt-5.4'` (project critical_context)
- Created `backend/src/llm/llm.module.ts`:
  - `providers: [OpenAIProvider, { provide: LLMProvider, useClass: OpenAIProvider }]`
  - `exports: [LLMProvider]` — downstream modules inject via abstract class token
- Updated `backend/src/app.module.ts` to import `LLMModule`

**Commits:** `dd8ad31` (RED), `d39bd8a` (GREEN)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Note on OPENAI_MODEL default:** The plan references `gpt-4o-2024-08-06` in CONTEXT.md D-06 but the `<critical_context>` block explicitly overrides this with `gpt-5.4`. The `env.validation.ts` from Plan 01-01 already defaults to `gpt-5.4`. The OpenAIProvider implementation uses the same default (`'gpt-5.4'`) for consistency with the existing env validation and per the execution instructions. This is not a deviation — it follows the critical_context mandate.

## Known Stubs

None — all files are fully implemented and wired. MusicConceptSchema and LLMProvider are ready for Phase 2 consumption.

## Threat Surface Scan

The following threat mitigations from the plan's `<threat_model>` are all implemented:

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-01-05: OPENAI_API_KEY disclosure | Read via ConfigService only; never logged | Implemented — `config.get('OPENAI_API_KEY')` in constructor only |
| T-01-06: Prompt injection via generateStructured | zodResponseFormat constrains output schema | Implemented — `zodResponseFormat(schema, 'structured_output')` |
| T-01-07: Hanging OpenAI calls (DoS) | `timeout: 30_000`, `maxRetries: 2` | Implemented — OpenAI constructor options |
| T-01-08: Refusal path info disclosure | message.refusal -> 400 with safe message; not 500 | Implemented — BadRequestException with sanitized refusal text |

No new threat surfaces introduced beyond what the plan's threat model covers.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (Task 1) | `c80272d` — `test(01-02): add failing tests for MusicConceptSchema` | PASSED |
| GREEN (Task 1) | `27c2d67` — `feat(01-02): add MusicConceptSchema, MusicConcept type, and LLMProvider abstract class` | PASSED |
| RED (Task 2) | `dd8ad31` — `test(01-02): add failing tests for OpenAIProvider` | PASSED |
| GREEN (Task 2) | `d39bd8a` — `feat(01-02): implement OpenAIProvider, LLMModule, and wire into AppModule` | PASSED |

## Self-Check: PASSED

- `c80272d` exists: verified
- `27c2d67` exists: verified
- `dd8ad31` exists: verified
- `d39bd8a` exists: verified
- `backend/src/generation/types/music-concept.schema.ts` exists: verified
- `backend/src/llm/llm-provider.abstract.ts` exists: verified
- `backend/src/llm/openai.provider.ts` exists: verified
- `backend/src/llm/llm.module.ts` exists: verified
- `backend/src/app.module.ts` contains `LLMModule`: verified
- `backend/src/llm/openai.provider.ts` contains `chat.completions.parse`: verified
- `backend/src/llm/openai.provider.ts` does NOT contain `json_object`: verified
- `npm run build` exits 0: verified
- `npx jest src/llm src/generation` — 11/11 tests pass: verified
