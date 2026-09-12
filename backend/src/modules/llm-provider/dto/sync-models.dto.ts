import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, MaxLength, MinLength } from 'class-validator';

export class SyncModelsDto {
  @ApiProperty({
    description: 'Model keys selected from the provider catalog to add (existing keys are skipped server-side)',
    example: ['openai/gpt-oss-20b', 'moonshotai/kimi-k2.6'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(255, { each: true })
  keys!: string[];
}
