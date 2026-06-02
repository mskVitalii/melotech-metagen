import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

// D-18: GenerateRequestDto with class-validator decorators
// Global ValidationPipe (whitelist: true, transform: true) in main.ts handles validation
export class GenerateRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt!: string;

  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    return obj.targetPlatforms ?? obj.target_platforms;
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(['spotify', 'tiktok', 'youtube'], { each: true })
  targetPlatforms!: string[];
}
