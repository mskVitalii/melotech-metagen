import {
    ArrayNotEmpty,
    IsArray,
    IsIn,
    IsNotEmpty,
    IsString,
    MaxLength,
} from 'class-validator';

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
