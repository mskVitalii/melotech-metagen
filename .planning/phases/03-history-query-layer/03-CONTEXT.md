# Phase 3: History & Query Layer - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 adds GET /history (with optional ?platform= filter and pagination) to the existing backend. It extends `PersistenceService` with a `findHistory()` method and adds a `HistoryController`. No new module is created — both additions live inside `GenerationModule`. No schema changes.

Phase 3 covers: API-02, API-03, PERSIST-03.

</domain>

<decisions>
## Implementation Decisions

### Query Structure

- **D-01:** `PersistenceService.findHistory({ page, limit, platform })` uses Prisma `findMany` with `include: { results: true }` — a single query, no N+1. When `platform` is provided, filter with `where: { results: { some: { platform } } }` to return only requests that have at least one result for that platform.
- **D-02:** Also run `prisma.generationRequest.count({ where })` with the same `where` clause for the `total` field. Both queries run in parallel: `Promise.all([findMany, count])`.
- **D-03:** Sorting: `orderBy: { createdAt: 'desc' }` — newest first.

### Pagination

- **D-04:** Query params: `page` (integer, 1-based, default `1`) and `limit` (integer, default `20`, max `100`). Use `skip: (page - 1) * limit, take: limit`.
- **D-05:** Validate with class-validator DTO: `HistoryQueryDto` with `@IsOptional() @IsInt() @Min(1) page`, `@IsOptional() @IsInt() @Min(1) @Max(100) limit`, `@IsOptional() @IsIn(['spotify', 'tiktok', 'youtube']) platform`. Use `@Type(() => Number)` for numeric coercion since query params are strings.

### Response Shape

- **D-06:** Response: `{ data: HistoryItem[], total: number, page: number, limit: number }` where `HistoryItem = { id: string, prompt: string, createdAt: string, results: { platform: string, payload: object }[] }`.
- **D-07:** When `platform` filter is active, `HistoryItem.results` still returns ALL results for the matching requests (not just the filtered platform's result). The filter selects WHICH requests to include, not which results to show per request.

### Route & Module

- **D-08:** `HistoryController` at `@Controller('history')` with `@Get()` handler. Registered in `GenerationModule` (no new module).
- **D-09:** `PersistenceService.findHistory()` is the only new method — extends the existing service without breaking Phase 2's `persist()`.
- **D-10:** `HistoryController` uses `@Query()` with `HistoryQueryDto` and `@UsePipes(new ValidationPipe({ transform: true }))` (or relies on global `ValidationPipe` from main.ts — already configured globally with `transform: true`).

### Claude's Discretion

- Exact response field naming (camelCase maintained)
- Error handling for invalid page/limit values (ValidationPipe handles this globally)

</decisions>

<canonical_refs>
## Canonical References

### Phase 2 Foundation (same module, same service)
- `backend/src/generation/persistence.service.ts` — existing PersistenceService to extend
- `backend/src/generation/generation.module.ts` — add HistoryController here
- `backend/src/generation/types/` — add HistoryItem types here

### ESM Requirement
- All local imports MUST use `.js` extension

### Project Requirements
- `.planning/REQUIREMENTS.md` — API-02, API-03, PERSIST-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PersistenceService` — already injectable in GenerationModule, just needs `findHistory()` added
- `GenerationModule` — already imports PrismaModule/CacheModule; add HistoryController to controllers array
- Global `ValidationPipe` with `transform: true` — numeric query params auto-coerced from strings

### Patterns from Phase 2
- DTO pattern: class-validator decorators, same as `GenerateRequestDto`
- Controller pattern: `@Controller('history') @Get()`, same as GenerationController
- All `.js` local imports

### Integration Points
- Phase 4 frontend will call `GET /history` and `GET /history?platform=spotify` via TanStack Query

</code_context>

<specifics>
## Specific Ideas

- The `HistoryItem` type should be exported from `generation/types/` for Phase 4 type-sharing
- `PERSIST-03` requires the query is single (no N+1) — the `include: { results: true }` approach satisfies this

</specifics>

<deferred>
## Deferred Ideas

- Per-request detail endpoint (GET /history/:id) — noted for Phase 4 or v2
- Full-text search on prompt — v2
- Result filtering within a request (returning only the matched platform's result) — v2

</deferred>

---

*Phase: 3-History-Query-Layer*
*Context gathered: 2026-06-02*
