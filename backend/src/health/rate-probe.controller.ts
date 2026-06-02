import { Controller, Post } from '@nestjs/common';

// Probe endpoint to demonstrate 3/min/IP rate limiting (API-04, RATE-01)
// POST /rate-probe returns { ok: true }; the 4th request in 60s returns 429
// This endpoint will be removed or replaced when POST /generate arrives in Phase 2
@Controller('rate-probe')
export class RateProbeController {
  @Post()
  probe(): { ok: boolean } {
    return { ok: true };
  }
}
