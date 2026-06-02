# Phase 2: Generation Pipeline - Discussion Log

> **Audit trail only.** Decisions are in CONTEXT.md.

**Date:** 2026-06-02
**Mode:** --auto (all decisions auto-selected via recommended defaults)
**Areas discussed:** PlatformRegistry DI, Cache key strategy, Fallback reconstruction, LLM prompt, Persistence, DTOs, Module structure

---

## PlatformRegistry DI Pattern

| Option | Selected |
|--------|----------|
| Multi-provider injection token (Symbol, multi:true) | ✓ |
| Manual registry with register() method | |

**Auto-selected:** Multi-provider DI token pattern — open/closed extension without modifying registry or GenerationService.

---

## Cache Key

| Option | Selected |
|--------|----------|
| crypto.createHash('sha256')(prompt + sorted platforms) | ✓ |
| MD5 hash | |
| JSON.stringify sorted object | |

**Auto-selected:** SHA-256 from Node.js crypto — no extra dep, deterministic, consistent with sorted platforms.

---

## Fallback Reconstruction

| Option | Selected |
|--------|----------|
| static buildFallback(concept) per processor | ✓ |
| GenerationService reconstructs based on platform name | |
| Return empty object with fallback:true | |

**Auto-selected:** Per-processor static method — keeps reconstruction logic collocated with generation logic.

---

## LLM Prompt Structure

| Option | Selected |
|--------|----------|
| Combined system+user in single string | ✓ |
| Separate system/user messages array | |

**Auto-selected:** Single string (LLMProvider.generateStructured already abstracts message array).

---

## Persistence

| Option | Selected |
|--------|----------|
| PersistenceService with $transaction | ✓ |
| Inline writes in GenerationService | |

**Auto-selected:** Separate PersistenceService — reused by Phase 3 history queries.

---

## Claude's Discretion

- Exact prompt wording beyond the pattern in D-11
- PlatformResult as type vs Zod schema (type preferred)
- Logging strategy
