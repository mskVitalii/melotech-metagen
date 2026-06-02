import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

// D-05: HistoryQueryDto — query params for GET /history
// Global ValidationPipe(transform: true) in main.ts coerces string query params to numbers
export class HistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsIn(['spotify', 'tiktok', 'youtube'])
  platform?: string;
}
