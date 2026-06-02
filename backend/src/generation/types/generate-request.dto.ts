import { IsString, IsNotEmpty, MaxLength, IsArray, ArrayNotEmpty, IsIn } from 'class-validator';

// D-18: GenerateRequestDto with class-validator decorators
// Global ValidationPipe (whitelist: true, transform: true) in main.ts handles validation
export class GenerateRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(['spotify', 'tiktok', 'youtube'], { each: true })
  targetPlatforms!: string[];
}
