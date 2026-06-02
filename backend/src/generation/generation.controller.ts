import { Controller, Post, Body } from '@nestjs/common';
import { GenerationService } from './generation.service.js';
import { GenerateRequestDto } from './types/generate-request.dto.js';

// API-01: POST /generate endpoint — delegates to GenerationService
@Controller('generate')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post()
  generate(@Body() dto: GenerateRequestDto) {
    return this.generationService.generate(dto);
  }
}
