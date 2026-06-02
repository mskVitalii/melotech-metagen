import { Controller, Get, Query } from '@nestjs/common';
import { PersistenceService } from './persistence.service.js';
import { HistoryQueryDto } from './types/history-query.dto.js';

// API-02 / API-03: GET /history with optional pagination and platform filter
@Controller('history')
export class HistoryController {
  constructor(private readonly persistenceService: PersistenceService) {}

  @Get()
  getHistory(@Query() query: HistoryQueryDto) {
    return this.persistenceService.findHistory(query);
  }
}
